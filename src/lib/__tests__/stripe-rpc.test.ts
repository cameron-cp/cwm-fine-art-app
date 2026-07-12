import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integration tests for apply_stripe_event, run against the LOCAL Supabase stack
// (`supabase start`). They verify the three properties a pure test can't: the
// negative-authz grant (only service_role may call it), idempotent dedup, and
// atomic persistence of a reconciled state.
//
// Skipped (not failed) when no local stack is reachable — mirrors
// invoice-rpc.test.ts — so CI without Docker stays green.

type LocalEnv = { url: string; anon: string; service: string } | null;

function readLocalEnv(): LocalEnv {
  try {
    const out = execSync("supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const vars: Record<string, string> = {};
    for (const line of out.split("\n")) {
      const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
      if (m) vars[m[1]] = m[2];
    }
    if (vars.API_URL && vars.ANON_KEY && vars.SERVICE_ROLE_KEY) {
      return { url: vars.API_URL, anon: vars.ANON_KEY, service: vars.SERVICE_ROLE_KEY };
    }
    return null;
  } catch {
    return null;
  }
}

const local = readLocalEnv();
const d = local ? describe : describe.skip;

function invoicePayload(overrides: Record<string, unknown> = {}) {
  return {
    bill_to_name: "Stripe Test Buyer",
    date_issued: "2026-07-11",
    payment_terms: "Net 14",
    currency: "USD",
    subtotal_cents: 500_000,
    shipping_cents: 0,
    total_cents: 500_000,
    line_items: [{ position: 0, title: "Work", amount_cents: 500_000 }],
    ...overrides,
  };
}

function invoicePaymentEvent(
  invoiceId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    kind: "invoice_payment",
    invoice_id: invoiceId,
    checkout_session_id: "cs_test_1",
    payment_intent_id: "pi_test_1",
    amount_cents: 500_000,
    currency: "usd",
    method: "card",
    target_invoice_status: "paid",
    payment_row_status: "succeeded",
    amount_paid_cents: 500_000,
    paid_at: "2026-07-11T00:00:00Z",
    ...overrides,
  };
}

d("apply_stripe_event (local Supabase)", () => {
  let service: SupabaseClient;
  let anon: SupabaseClient;
  const invoiceIds: string[] = [];
  let evtCounter = 0;

  const evtId = () => `evt_test_${Date.now()}_${evtCounter++}`;

  async function newInvoice(overrides: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await service.rpc("create_invoice", {
      payload: invoicePayload(overrides),
    });
    expect(error).toBeNull();
    invoiceIds.push(data as string);
    return data as string;
  }

  beforeAll(() => {
    service = createClient(local!.url, local!.service, {
      auth: { persistSession: false },
    });
    anon = createClient(local!.url, local!.anon, {
      auth: { persistSession: false },
    });
  });

  afterAll(async () => {
    if (invoiceIds.length) {
      await service.from("invoices").delete().in("id", invoiceIds);
    }
  });

  it("rejects apply_stripe_event from anon (grant is service_role only)", async () => {
    const res = await anon.rpc("apply_stripe_event", {
      p_event_id: evtId(),
      p_type: "test",
      p_payload: invoicePaymentEvent("00000000-0000-0000-0000-000000000000"),
    });
    expect(res.error).not.toBeNull();
  });

  it("marks an invoice paid when the collected amount matches the total", async () => {
    const id = await newInvoice();
    const { error } = await service.rpc("apply_stripe_event", {
      p_event_id: evtId(),
      p_type: "checkout.session.completed",
      p_payload: invoicePaymentEvent(id),
    });
    expect(error).toBeNull();
    const { data } = await service
      .from("invoices")
      .select("payment_status, amount_paid_cents")
      .eq("id", id)
      .single();
    expect(data?.payment_status).toBe("paid");
    expect(data?.amount_paid_cents).toBe(500_000);
  });

  it("is idempotent: the same event id twice mutates state exactly once", async () => {
    const id = await newInvoice();
    const sharedEvent = evtId();
    const payload = invoicePaymentEvent(id);

    await service.rpc("apply_stripe_event", {
      p_event_id: sharedEvent,
      p_type: "checkout.session.completed",
      p_payload: payload,
    });
    // Redeliver the identical event.
    const second = await service.rpc("apply_stripe_event", {
      p_event_id: sharedEvent,
      p_type: "checkout.session.completed",
      p_payload: payload,
    });
    expect(second.error).toBeNull();

    const { count } = await service
      .from("invoice_payments")
      .select("*", { count: "exact", head: true })
      .eq("invoice_id", id);
    expect(count).toBe(1); // no duplicate payment row
  });

  it("routes an amount mismatch to 'review', never silently paid", async () => {
    const id = await newInvoice();
    const { error } = await service.rpc("apply_stripe_event", {
      p_event_id: evtId(),
      p_type: "checkout.session.completed",
      p_payload: invoicePaymentEvent(id, {
        amount_cents: 499_999,
        target_invoice_status: "review",
        amount_paid_cents: 499_999,
        paid_at: null,
      }),
    });
    expect(error).toBeNull();
    const { data } = await service
      .from("invoices")
      .select("payment_status")
      .eq("id", id)
      .single();
    expect(data?.payment_status).toBe("review");
  });

  it("does not regress paid -> processing on an out-of-order event", async () => {
    const id = await newInvoice();
    // First: settled/paid.
    await service.rpc("apply_stripe_event", {
      p_event_id: evtId(),
      p_type: "payment_intent.succeeded",
      p_payload: invoicePaymentEvent(id),
    });
    // Then a late 'processing' event for the same invoice.
    await service.rpc("apply_stripe_event", {
      p_event_id: evtId(),
      p_type: "checkout.session.completed",
      p_payload: invoicePaymentEvent(id, {
        target_invoice_status: "processing",
        payment_row_status: "processing",
        amount_paid_cents: 0,
        paid_at: null,
      }),
    });
    const { data } = await service
      .from("invoices")
      .select("payment_status")
      .eq("id", id)
      .single();
    expect(data?.payment_status).toBe("paid"); // terminal guard held
  });
});
