-- Party model + invoice generation.
--
-- Introduces the CRM/transaction foundation (Silverston "Party" pattern): one
-- `parties` table (person/organization/household) + standing `party_roles` +
-- typed, time-bounded `party_relationships`. Buyer/seller/on-behalf-of are
-- per-transaction roles on the invoice, not party attributes.
--
-- Invoices SNAPSHOT everything that must stay fixed on a re-print: bill-to,
-- each work's details + an invoice-owned image copy, and the business/
-- remittance/T&C settings in effect at issue time (`settings_snapshot`, built
-- inside create_invoice()). Historical invoices never mutate.
--
-- Money is integer cents (bigint). Number allocation + invoice insert + line
-- items happen atomically inside SECURITY DEFINER RPCs. Those RPCs bypass RLS,
-- so — per the 0005 precedent — execute is revoked from public/anon and granted
-- only to authenticated (Clerk sessions). Without that revoke, Supabase's default
-- grants would leave an unauthenticated write path into invoices.

-- Party foundation -----------------------------------------------------

create table parties (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('person','organization','household')),
  display_name text not null,
  legal_name text,
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index parties_kind_idx on parties(kind);
create index parties_display_name_idx on parties(display_name);

create table party_roles (
  party_id uuid not null references parties(id) on delete cascade,
  role text not null check (role in (
    'collector','gallery','auction_house','advisory','collection_manager',
    'studio','artist','museum','dealer','shipper','conservator','institution'
  )),
  primary key (party_id, role)
);

create index party_roles_role_idx on party_roles(role);

-- Typed, time-bounded edges between parties (Len-model: who works where,
-- advises whom, represents which artist). Schema now; a read-only display lands
-- on the Contact detail page. Full management UI is a fast-follow.
create table party_relationships (
  id uuid primary key default gen_random_uuid(),
  from_party_id uuid not null references parties(id) on delete cascade,
  to_party_id uuid not null references parties(id) on delete cascade,
  type text not null check (type in (
    'employed_by','advises','manages_collection_of','represents','operated_by','member_of'
  )),
  valid_from date,
  valid_to date,
  notes text,
  created_at timestamptz not null default now()
);

create index party_relationships_from_idx on party_relationships(from_party_id, type);
create index party_relationships_to_idx on party_relationships(to_party_id, type);

-- Invoice settings (singleton) ----------------------------------------
-- Fixed content (business header, remittance/wire, Net-14 statement, full T&C)
-- editable via an in-app Settings page — account numbers out of git, editable
-- without a deploy — and snapshotted onto each invoice at creation.

create table invoice_settings (
  singleton boolean not null default true unique check (singleton),
  business_name text not null default '',
  business_legal_name text not null default '',
  business_address text not null default '',
  business_phone text not null default '',
  business_email text not null default '',
  remittance_intro text not null default '',
  remittance_beneficiary text not null default '',
  remittance_bank text not null default '',
  remittance_aba text not null default '',
  remittance_account text not null default '',
  payment_terms_default text not null default 'Net 14',
  payment_terms_statement text not null default '',
  terms_intro text not null default '',
  terms_conditions jsonb not null default '[]',   -- [{title, body}]
  invoice_prefix text not null default 'CWFA-',
  next_invoice_number int not null default 1001,
  updated_at timestamptz not null default now()
);

-- Invoices ------------------------------------------------------------

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number int not null,
  invoice_prefix text not null,
  unique (invoice_prefix, invoice_number),

  -- Party refs for traceability (null seller ⇒ the business itself).
  buyer_party_id uuid references parties(id) on delete set null,
  on_behalf_of_party_id uuid references parties(id) on delete set null,
  seller_party_id uuid references parties(id) on delete set null,

  -- Bill-to snapshot (immutable once issued).
  bill_to_name text not null,
  bill_to_attention text,
  bill_to_address text,
  bill_to_email text,
  -- Party-name snapshots (captured at creation; not rendered in V1 — no docx field).
  on_behalf_of_name text,
  seller_name text,

  -- Business/remittance/T&C content in effect at issue time. Built by
  -- create_invoice() reading invoice_settings in-transaction. The render page
  -- reads THIS, never the live invoice_settings row.
  settings_snapshot jsonb not null,

  date_issued date not null,
  payment_terms text not null,
  currency text not null default 'USD',
  ship_from text,
  ship_to text,

  -- Server-computed totals (integer cents).
  subtotal_cents bigint not null,
  shipping_cents bigint not null default 0,
  total_cents bigint not null,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_created_at_idx on invoices(created_at desc);
create index invoices_buyer_idx on invoices(buyer_party_id);

create table invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  artwork_id uuid references artworks(id) on delete set null,
  position int not null default 0,

  -- Per-work snapshot (immutable once issued).
  artist_name text,
  title text,
  year int,
  medium text,
  dimensions_text text,
  edition text,
  signature_details text,
  catalogue_raisonne text,
  inventory_no text,
  provenance_lines text[] not null default '{}',
  -- Invoice-OWNED image copy under artworks/invoices/{invoice_id}/{position}.jpg
  -- (NOT the artwork's live path — deleteArtwork hard-removes those objects).
  image_path text,
  amount_cents bigint not null,

  created_at timestamptz not null default now()
);

create index invoice_line_items_invoice_idx on invoice_line_items(invoice_id, position);

-- updated_at triggers
create trigger parties_set_updated_at before update on parties
  for each row execute function set_updated_at();
create trigger invoice_settings_set_updated_at before update on invoice_settings
  for each row execute function set_updated_at();
create trigger invoices_set_updated_at before update on invoices
  for each row execute function set_updated_at();

-- Atomic write RPCs ---------------------------------------------------
-- One transaction: allocate number + build settings_snapshot (in-tx) + insert
-- invoice + insert line items. A committed invoice is the only way a number is
-- consumed → no orphans, no burned numbers, no partial line items.

create or replace function create_invoice(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_prefix text;
  v_number int;
  v_snapshot jsonb;
  v_item jsonb;
begin
  if jsonb_typeof(payload->'line_items') is distinct from 'array'
     or jsonb_array_length(payload->'line_items') < 1 then
    raise exception 'create_invoice: at least one line item is required';
  end if;

  v_id := coalesce(nullif(payload->>'id','')::uuid, gen_random_uuid());

  -- Allocate the number atomically; consumed only if this tx commits.
  update invoice_settings
     set next_invoice_number = next_invoice_number + 1
   where singleton = true
   returning invoice_prefix, next_invoice_number - 1
        into v_prefix, v_number;

  if v_prefix is null then
    raise exception 'create_invoice: invoice_settings row missing';
  end if;

  -- Snapshot the business/remittance/T&C content in-transaction (X15) —
  -- never trust a client-assembled blob. Drop mutable numbering fields.
  select (to_jsonb(s) - 'next_invoice_number' - 'singleton' - 'updated_at')
    into v_snapshot
    from invoice_settings s
   where s.singleton = true;

  insert into invoices (
    id, invoice_number, invoice_prefix,
    buyer_party_id, on_behalf_of_party_id, seller_party_id,
    bill_to_name, bill_to_attention, bill_to_address, bill_to_email,
    on_behalf_of_name, seller_name,
    settings_snapshot,
    date_issued, payment_terms, currency, ship_from, ship_to,
    subtotal_cents, shipping_cents, total_cents, notes
  ) values (
    v_id,
    v_number,
    v_prefix,
    nullif(payload->>'buyer_party_id','')::uuid,
    nullif(payload->>'on_behalf_of_party_id','')::uuid,
    nullif(payload->>'seller_party_id','')::uuid,
    payload->>'bill_to_name',
    payload->>'bill_to_attention',
    payload->>'bill_to_address',
    payload->>'bill_to_email',
    payload->>'on_behalf_of_name',
    payload->>'seller_name',
    v_snapshot,
    (payload->>'date_issued')::date,
    payload->>'payment_terms',
    coalesce(nullif(payload->>'currency',''), 'USD'),
    payload->>'ship_from',
    payload->>'ship_to',
    (payload->>'subtotal_cents')::bigint,
    coalesce((payload->>'shipping_cents')::bigint, 0),
    (payload->>'total_cents')::bigint,
    payload->>'notes'
  );

  for v_item in select * from jsonb_array_elements(payload->'line_items')
  loop
    insert into invoice_line_items (
      invoice_id, artwork_id, position,
      artist_name, title, year, medium, dimensions_text, edition,
      signature_details, catalogue_raisonne, inventory_no,
      provenance_lines, image_path, amount_cents
    ) values (
      v_id,
      nullif(v_item->>'artwork_id','')::uuid,
      coalesce((v_item->>'position')::int, 0),
      v_item->>'artist_name',
      v_item->>'title',
      nullif(v_item->>'year','')::int,
      v_item->>'medium',
      v_item->>'dimensions_text',
      v_item->>'edition',
      v_item->>'signature_details',
      v_item->>'catalogue_raisonne',
      v_item->>'inventory_no',
      coalesce(
        array(select jsonb_array_elements_text(v_item->'provenance_lines')),
        '{}'::text[]
      ),
      nullif(v_item->>'image_path',''),
      (v_item->>'amount_cents')::bigint
    );
  end loop;

  return v_id;
end
$$;

-- Edit path: same transaction guarantee. Preserves the original invoice_number,
-- invoice_prefix, and settings_snapshot (re-print stays immutable); rewrites the
-- header + delete-and-reinsert line items atomically.
create or replace function update_invoice(p_id uuid, payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if jsonb_typeof(payload->'line_items') is distinct from 'array'
     or jsonb_array_length(payload->'line_items') < 1 then
    raise exception 'update_invoice: at least one line item is required';
  end if;

  update invoices set
    buyer_party_id = nullif(payload->>'buyer_party_id','')::uuid,
    on_behalf_of_party_id = nullif(payload->>'on_behalf_of_party_id','')::uuid,
    seller_party_id = nullif(payload->>'seller_party_id','')::uuid,
    bill_to_name = payload->>'bill_to_name',
    bill_to_attention = payload->>'bill_to_attention',
    bill_to_address = payload->>'bill_to_address',
    bill_to_email = payload->>'bill_to_email',
    on_behalf_of_name = payload->>'on_behalf_of_name',
    seller_name = payload->>'seller_name',
    date_issued = (payload->>'date_issued')::date,
    payment_terms = payload->>'payment_terms',
    currency = coalesce(nullif(payload->>'currency',''), 'USD'),
    ship_from = payload->>'ship_from',
    ship_to = payload->>'ship_to',
    subtotal_cents = (payload->>'subtotal_cents')::bigint,
    shipping_cents = coalesce((payload->>'shipping_cents')::bigint, 0),
    total_cents = (payload->>'total_cents')::bigint,
    notes = payload->>'notes'
  where id = p_id;

  if not found then
    raise exception 'update_invoice: invoice % not found', p_id;
  end if;

  delete from invoice_line_items where invoice_id = p_id;

  for v_item in select * from jsonb_array_elements(payload->'line_items')
  loop
    insert into invoice_line_items (
      invoice_id, artwork_id, position,
      artist_name, title, year, medium, dimensions_text, edition,
      signature_details, catalogue_raisonne, inventory_no,
      provenance_lines, image_path, amount_cents
    ) values (
      p_id,
      nullif(v_item->>'artwork_id','')::uuid,
      coalesce((v_item->>'position')::int, 0),
      v_item->>'artist_name',
      v_item->>'title',
      nullif(v_item->>'year','')::int,
      v_item->>'medium',
      v_item->>'dimensions_text',
      v_item->>'edition',
      v_item->>'signature_details',
      v_item->>'catalogue_raisonne',
      v_item->>'inventory_no',
      coalesce(
        array(select jsonb_array_elements_text(v_item->'provenance_lines')),
        '{}'::text[]
      ),
      nullif(v_item->>'image_path',''),
      (v_item->>'amount_cents')::bigint
    );
  end loop;

  return p_id;
end
$$;

-- Grants (CRITICAL): SECURITY DEFINER bypasses RLS and Supabase's default grants
-- make functions callable by anon. Mirror the 0005 precedent.
revoke execute on function create_invoice(jsonb) from public, anon;
revoke execute on function update_invoice(uuid, jsonb) from public, anon;
grant execute on function create_invoice(jsonb) to authenticated;
grant execute on function update_invoice(uuid, jsonb) to authenticated;

-- RLS: single-user posture (same as the rest of the schema). Direct table reads
-- use the authenticated (Clerk) role; the render page uses the service role.
alter table parties enable row level security;
alter table party_roles enable row level security;
alter table party_relationships enable row level security;
alter table invoice_settings enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;

create policy "authenticated full access on parties"
  on parties for all to authenticated using (true) with check (true);
create policy "authenticated full access on party_roles"
  on party_roles for all to authenticated using (true) with check (true);
create policy "authenticated full access on party_relationships"
  on party_relationships for all to authenticated using (true) with check (true);
create policy "authenticated full access on invoice_settings"
  on invoice_settings for all to authenticated using (true) with check (true);
create policy "authenticated full access on invoices"
  on invoices for all to authenticated using (true) with check (true);
create policy "authenticated full access on invoice_line_items"
  on invoice_line_items for all to authenticated using (true) with check (true);

-- Seed the singleton settings row with the verbatim docx content. Bank ABA /
-- account are left as placeholders for Chloe to fill via the Settings page.
insert into invoice_settings (
  singleton,
  business_name, business_legal_name, business_address, business_phone, business_email,
  remittance_intro, remittance_beneficiary, remittance_bank, remittance_aba, remittance_account,
  payment_terms_default, payment_terms_statement,
  terms_intro,
  invoice_prefix, next_invoice_number,
  terms_conditions
) values (
  true,
  'Chloe Waddington Fine Art',
  'CWM Fine Art LLC',
  E'7928 Goforth Road\nDallas, Texas 75238',
  '646.740.3159',
  'chloe@chloewaddington.com',
  'Wire transfer.  Please reference the invoice number on all payments. Buyer is responsible for any bank or intermediary fees.',
  'CWM Fine Art LLC',
  '',
  '',
  '',
  'Net 14',
  'Net 14 — payment in full is due within fourteen (14) business days of the Date Issued shown above.',
  'These Terms and Conditions apply to the transaction described in this invoice between Chloe Waddington Fine Art (“CWFA”) and the purchaser named above (“Buyer”).',
  'CWFA-',
  1001,
  $json$[
    {"title":"Payment","body":"The total amount due is payable Net 14, as defined above, in the currency stated above, by wire transfer to the account specified. Any bank or intermediary fees are the responsibility of Buyer."},
    {"title":"Passage of Title & Possession","body":"Title to the Work passes to Buyer upon CWFA’s receipt of payment in full in cleared funds. Possession and risk of loss pass to Buyer upon release of the Work to Buyer or to Buyer’s agents (including Buyer’s shippers). Buyer is responsible for insuring the Work from that point forward."},
    {"title":"Taxes & Duties","body":"The amounts shown are exclusive of any sales, use, value-added, import, or similar taxes and duties, which are the responsibility of Buyer, including any levies arising in the destination jurisdiction."},
    {"title":"Shipping & Handling","body":"The Work will be shipped from the origin location to the destination indicated above by qualified fine-art handlers, arranged on Buyer’s behalf and at Buyer’s expense. Estimated costs shown above are subject to adjustment to actual."},
    {"title":"Inspection & Condition","body":"The Work is provided in its present condition, “as is,” and a condition report is available on request. Buyer has had the opportunity to inspect the Work or has knowingly waived such inspection. All sales are final once payment has been made."},
    {"title":"Authenticity & Provenance","body":"CWFA represents the authorship, attribution, and provenance of the Work as represented to it by its source, to the best of its knowledge, and conveys such title to the Work as it receives from the source, free of liens or encumbrances known to it. No further warranties, express or implied, are given."},
    {"title":"Cancellation","body":"If Buyer fails to remit payment within the stated term, CWFA may cancel the transaction, and Buyer shall reimburse any reasonable costs incurred by CWFA on Buyer’s behalf."},
    {"title":"Confidentiality","body":"Buyer and CWFA shall keep confidential the terms of this transaction, the identity of the counterparties, and the price, and shall not disclose the same except as required by law or to professional advisors bound by confidentiality."},
    {"title":"Compliance, Export & AML","body":"Buyer agrees to provide such identification and source-of-funds information as CWFA may reasonably request. Buyer is responsible for obtaining any export, import, or other licenses required to transport the Work, including any permits under CITES or cultural-property regulations."},
    {"title":"Governing Law & Venue","body":"These Terms and Conditions are governed by the laws of the State of Texas, without regard to its conflict-of-laws rules. The parties submit to the exclusive jurisdiction of the state and federal courts located in Dallas County, Texas."}
  ]$json$::jsonb
);
