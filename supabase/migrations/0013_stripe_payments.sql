-- Stripe payments: invoice pay-by-card/ACH, card-on-file, Stripe-native retainers.
--
-- Design (see plan "Stripe Payments for art-app"):
--   * Zero PCI scope — all card/bank entry is on Stripe-hosted pages. The app
--     only creates redirect sessions (server secrets only) and mirrors state.
--   * The invoice stays the source of truth for one-off sales; retainers are
--     Stripe-native subscriptions the app mirrors.
--
-- apply_stripe_event() is the ONLY automatic write path for paid-status. It does
-- two things atomically in one transaction: (1) dedup the Stripe event id, and
-- (2) apply the already-resolved business writes carried in p_payload. Either
-- both commit or both roll back — a crash between them can never mark an event
-- processed without its state change landing (Stripe then retries).
--
-- Deliberate refinement vs. the plan's "reconcile inside the RPC": the money
-- DECISION (settlement-first PI-status mapping + amount/currency reconciliation)
-- lives in ONE place — pure TypeScript `decideInvoiceState` in
-- src/lib/stripe/reconcile.ts — where it is exhaustively unit-tested. The route
-- resolves the target state there and passes it in p_payload. This RPC does NO
-- money math; it persists the decided state under a terminal-state guard and
-- owns idempotency + atomicity (the actual safety property the plan requires).
--
-- Grants (SECURITY-CRITICAL): unlike create_invoice/update_invoice (a logged-in
-- dealer legitimately calls those), the ONLY legitimate caller of
-- apply_stripe_event is the webhook route running as service_role. The function
-- trusts p_payload as pre-verified (HMAC checked upstream in the route) and
-- cannot re-check it, so execute is revoked from public/anon/authenticated and
-- granted ONLY to service_role. An authenticated grant would let any code path
-- holding the dealer's JWT fabricate a payload and mark any invoice paid.

-- Customer anchor -----------------------------------------------------
-- One Stripe Customer per party, created lazily the first time a party needs a
-- checkout/setup/subscription session.
alter table parties add column stripe_customer_id text unique;

-- Invoice payment state ------------------------------------------------
-- 'review' = money arrived but the collected amount/currency did NOT match the
-- current live invoice total; never marked paid silently, and it is RECOVERABLE
-- (a later matching event or reconcileInvoicePayment promotes review -> paid).
alter table invoices
  add column payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','processing','paid','review','refunded')),
  add column amount_paid_cents bigint not null default 0,
  add column paid_at timestamptz;

-- One row per Checkout/PaymentIntent against an invoice.
create table invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text unique,
  amount_cents bigint,
  currency text,
  method text,                       -- 'card' | 'us_bank_account'
  status text not null default 'pending'
    check (status in ('pending','processing','succeeded','failed','refunded','superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoice_payments_invoice_idx on invoice_payments(invoice_id);
create index invoice_payments_session_idx on invoice_payments(stripe_checkout_session_id);

-- App mirror of a Stripe Subscription. stripe_checkout_session_id is the
-- fallback recovery key, populated synchronously at creation;
-- stripe_subscription_id stays null until the customer completes checkout.
-- No stripe_customer_id here — reach the customer via party_id -> parties
-- (one source of truth). Cadence column is billing_interval (not `interval`,
-- which collides with Postgres's interval-literal syntax in a CHECK).
create table retainers (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references parties(id) on delete cascade,
  stripe_checkout_session_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  description text,
  amount_cents bigint,
  currency text not null default 'USD',
  billing_interval text check (billing_interval in ('month','quarter')),
  status text not null default 'incomplete'
    check (status in ('incomplete','active','past_due','canceled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index retainers_party_idx on retainers(party_id);
create index retainers_session_idx on retainers(stripe_checkout_session_id);

-- One row per subscription invoice.
create table retainer_payments (
  id uuid primary key default gen_random_uuid(),
  retainer_id uuid not null references retainers(id) on delete cascade,
  stripe_invoice_id text unique,
  amount_cents bigint,
  status text,
  paid_at timestamptz,
  hosted_invoice_url text,
  created_at timestamptz not null default now()
);

create index retainer_payments_retainer_idx on retainer_payments(retainer_id);

-- Idempotency ledger. Locked down (no authenticated policy) — only the webhook
-- (service_role) ever touches it.
create table stripe_events (
  id text primary key,               -- Stripe event id (evt_...)
  type text not null,
  received_at timestamptz not null default now()
);

-- updated_at triggers (set_updated_at() defined in 0001).
create trigger invoice_payments_set_updated_at before update on invoice_payments
  for each row execute function set_updated_at();
create trigger retainers_set_updated_at before update on retainers
  for each row execute function set_updated_at();

-- Atomic event application ---------------------------------------------

create or replace function apply_stripe_event(
  p_event_id text,
  p_type text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := p_payload->>'kind';
  v_invoice_id uuid;
  v_current text;
  v_target text;
  v_retainer_id uuid;
begin
  -- Idempotency: record the event first. On a duplicate we no-op and commit an
  -- empty transaction (the prior run already applied the writes).
  insert into stripe_events (id, type) values (p_event_id, p_type)
  on conflict (id) do nothing;
  if not found then
    return;
  end if;

  -- ---- Invoice payment (card/ACH one-off) ----------------------------
  if v_kind = 'invoice_payment' then
    v_invoice_id := (p_payload->>'invoice_id')::uuid;
    v_target := p_payload->>'target_invoice_status';

    -- Upsert the payment row. Resolve by checkout session first (the pre-created
    -- stub), then by PaymentIntent id, then attach to an outstanding pending
    -- stub (early-arrival ordering), and only insert fresh if nothing matches.
    if nullif(p_payload->>'checkout_session_id','') is not null then
      update invoice_payments set
        stripe_payment_intent_id = coalesce(nullif(p_payload->>'payment_intent_id',''), stripe_payment_intent_id),
        amount_cents = (p_payload->>'amount_cents')::bigint,
        currency = nullif(p_payload->>'currency',''),
        method = coalesce(nullif(p_payload->>'method',''), method),
        status = p_payload->>'payment_row_status'
      where invoice_id = v_invoice_id
        and stripe_checkout_session_id = p_payload->>'checkout_session_id'
        and status <> 'superseded';
    end if;

    if not found and nullif(p_payload->>'payment_intent_id','') is not null then
      update invoice_payments set
        amount_cents = (p_payload->>'amount_cents')::bigint,
        currency = nullif(p_payload->>'currency',''),
        method = coalesce(nullif(p_payload->>'method',''), method),
        status = p_payload->>'payment_row_status'
      where stripe_payment_intent_id = p_payload->>'payment_intent_id';
    end if;

    if not found and nullif(p_payload->>'payment_intent_id','') is not null then
      update invoice_payments set
        stripe_payment_intent_id = p_payload->>'payment_intent_id',
        amount_cents = (p_payload->>'amount_cents')::bigint,
        currency = nullif(p_payload->>'currency',''),
        method = coalesce(nullif(p_payload->>'method',''), method),
        status = p_payload->>'payment_row_status'
      where invoice_id = v_invoice_id
        and status = 'pending'
        and stripe_payment_intent_id is null;
    end if;

    if not found then
      insert into invoice_payments (
        invoice_id, stripe_checkout_session_id, stripe_payment_intent_id,
        amount_cents, currency, method, status
      ) values (
        v_invoice_id,
        nullif(p_payload->>'checkout_session_id',''),
        nullif(p_payload->>'payment_intent_id',''),
        (p_payload->>'amount_cents')::bigint,
        nullif(p_payload->>'currency',''),
        nullif(p_payload->>'method',''),
        p_payload->>'payment_row_status'
      );
    end if;

    -- Apply invoice status under the terminal-state guard: never regress a
    -- terminal state (paid/refunded). 'review' is NOT terminal. Refunds are a
    -- separate kind (invoice_refund) — they are the only path OUT of 'paid'.
    select payment_status into v_current from invoices where id = v_invoice_id for update;
    if not found then
      return;
    end if;

    if v_current not in ('paid','refunded') then
      update invoices set
        payment_status = v_target,
        amount_paid_cents = (p_payload->>'amount_paid_cents')::bigint,
        paid_at = case
          when v_target = 'paid'
          then coalesce(nullif(p_payload->>'paid_at','')::timestamptz, now())
          else null
        end
      where id = v_invoice_id;
    end if;

  -- ---- Invoice refund (charge.refunded) ------------------------------
  -- Full refund flips the invoice to 'refunded'; a partial refund leaves it
  -- 'paid' and only adjusts amount_paid_cents. Either way the payment row is
  -- annotated. This is the only transition allowed out of 'paid'.
  elsif v_kind = 'invoice_refund' then
    v_invoice_id := (p_payload->>'invoice_id')::uuid;

    if (p_payload->>'fully_refunded')::boolean then
      update invoices set
        payment_status = 'refunded',
        amount_paid_cents = (p_payload->>'amount_paid_cents')::bigint
      where id = v_invoice_id;
    else
      update invoices set
        amount_paid_cents = (p_payload->>'amount_paid_cents')::bigint
      where id = v_invoice_id
        and payment_status = 'paid';
    end if;

    update invoice_payments set
      status = case when (p_payload->>'fully_refunded')::boolean then 'refunded' else status end
    where stripe_payment_intent_id = nullif(p_payload->>'payment_intent_id','');

  -- ---- Retainer activation (subscription checkout completed) ----------
  elsif v_kind = 'retainer_activation' then
    update retainers set
      stripe_subscription_id = nullif(p_payload->>'subscription_id',''),
      stripe_price_id = coalesce(nullif(p_payload->>'price_id',''), stripe_price_id),
      status = coalesce(nullif(p_payload->>'status',''), 'active'),
      current_period_end = nullif(p_payload->>'current_period_end','')::timestamptz,
      amount_cents = coalesce(amount_cents, (p_payload->>'amount_cents')::bigint),
      billing_interval = coalesce(billing_interval, nullif(p_payload->>'interval','')),
      description = coalesce(description, nullif(p_payload->>'description','')),
      currency = coalesce(currency, nullif(p_payload->>'currency',''))
    where stripe_checkout_session_id = p_payload->>'checkout_session_id';

    if not found then
      insert into retainers (
        party_id, stripe_checkout_session_id, stripe_subscription_id, stripe_price_id,
        description, amount_cents, currency, billing_interval, status, current_period_end
      ) values (
        (p_payload->>'party_id')::uuid,
        nullif(p_payload->>'checkout_session_id',''),
        nullif(p_payload->>'subscription_id',''),
        nullif(p_payload->>'price_id',''),
        nullif(p_payload->>'description',''),
        (p_payload->>'amount_cents')::bigint,
        coalesce(nullif(p_payload->>'currency',''), 'USD'),
        nullif(p_payload->>'interval',''),
        coalesce(nullif(p_payload->>'status',''), 'active'),
        nullif(p_payload->>'current_period_end','')::timestamptz
      );
    end if;

  -- ---- Retainer status sync (subscription updated/deleted) ------------
  elsif v_kind = 'retainer_status' then
    update retainers set
      status = p_payload->>'status',
      current_period_end = coalesce(
        nullif(p_payload->>'current_period_end','')::timestamptz, current_period_end
      )
    where stripe_subscription_id = p_payload->>'subscription_id';

  -- ---- Retainer invoice (subscription invoice paid/failed) ------------
  elsif v_kind = 'retainer_payment' then
    select id into v_retainer_id from retainers
      where stripe_subscription_id = p_payload->>'subscription_id';
    if v_retainer_id is not null then
      insert into retainer_payments (
        retainer_id, stripe_invoice_id, amount_cents, status, paid_at, hosted_invoice_url
      ) values (
        v_retainer_id,
        p_payload->>'stripe_invoice_id',
        (p_payload->>'amount_cents')::bigint,
        p_payload->>'status',
        nullif(p_payload->>'paid_at','')::timestamptz,
        nullif(p_payload->>'hosted_invoice_url','')
      )
      on conflict (stripe_invoice_id) do update set
        amount_cents = excluded.amount_cents,
        status = excluded.status,
        paid_at = excluded.paid_at,
        hosted_invoice_url = excluded.hosted_invoice_url;

      update retainers set status = case
        when p_payload->>'status' = 'paid' then 'active'
        when p_payload->>'status' = 'failed' then 'past_due'
        else status
      end
      where id = v_retainer_id;
    end if;
  end if;
end
$$;

-- Grants: service_role ONLY (see header). The revoke from authenticated must be
-- explicit — Postgres grants EXECUTE to PUBLIC on new functions unless revoked.
revoke execute on function apply_stripe_event(text, text, jsonb) from public, anon, authenticated;
grant execute on function apply_stripe_event(text, text, jsonb) to service_role;

-- RLS: single-user posture. The app UI reads these as `authenticated`; the
-- webhook writes as `service_role` (bypasses RLS). stripe_events has NO policy
-- (locked down — only the webhook touches it).
alter table invoice_payments enable row level security;
alter table retainers enable row level security;
alter table retainer_payments enable row level security;
alter table stripe_events enable row level security;

create policy "authenticated full access on invoice_payments"
  on invoice_payments for all to authenticated using (true) with check (true);
create policy "authenticated full access on retainers"
  on retainers for all to authenticated using (true) with check (true);
create policy "authenticated full access on retainer_payments"
  on retainer_payments for all to authenticated using (true) with check (true);
