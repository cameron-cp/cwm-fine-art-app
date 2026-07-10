import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integration tests for the atomic invoice RPCs, run against the LOCAL Supabase
// stack (`supabase start`). They verify the three properties that can't be
// checked with a unit test: sequential number allocation, transaction atomicity,
// and the negative-authz guarantee (anon cannot call the SECURITY DEFINER RPCs).
//
// Skipped (not failed) when no local stack is reachable, so CI stays green.

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

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    bill_to_name: "Integration Test Buyer",
    date_issued: "2026-07-10",
    payment_terms: "Net 14",
    currency: "USD",
    subtotal_cents: 1_250_050,
    shipping_cents: 45_075,
    total_cents: 1_295_125,
    line_items: [
      { position: 0, title: "Test Work", amount_cents: 1_250_050 },
    ],
    ...overrides,
  };
}

d("invoice RPCs (local Supabase)", () => {
  let service: SupabaseClient;
  let anon: SupabaseClient;
  const createdIds: string[] = [];
  let baselineNextNumber = 1001;

  beforeAll(async () => {
    service = createClient(local!.url, local!.service, {
      auth: { persistSession: false },
    });
    anon = createClient(local!.url, local!.anon, {
      auth: { persistSession: false },
    });
    const { data } = await service
      .from("invoice_settings")
      .select("next_invoice_number")
      .single();
    baselineNextNumber = data?.next_invoice_number ?? 1001;
  });

  afterAll(async () => {
    if (createdIds.length) {
      await service.from("invoices").delete().in("id", createdIds);
    }
    // Restore the counter so repeated runs stay deterministic.
    await service
      .from("invoice_settings")
      .update({ next_invoice_number: baselineNextNumber })
      .eq("singleton", true);
  });

  it("allocates sequential invoice numbers", async () => {
    const first = await service.rpc("create_invoice", { payload: makePayload() });
    expect(first.error).toBeNull();
    const second = await service.rpc("create_invoice", { payload: makePayload() });
    expect(second.error).toBeNull();
    createdIds.push(first.data as string, second.data as string);

    const { data: rows } = await service
      .from("invoices")
      .select("invoice_number")
      .in("id", [first.data, second.data])
      .order("invoice_number");
    const numbers = (rows ?? []).map((r) => r.invoice_number);
    expect(numbers).toHaveLength(2);
    expect(numbers[1]).toBe(numbers[0] + 1);
  });

  it("is atomic: a line-item failure leaves no invoice row and does not burn a number", async () => {
    const { data: before } = await service
      .from("invoice_settings")
      .select("next_invoice_number")
      .single();
    const { count: countBefore } = await service
      .from("invoices")
      .select("*", { count: "exact", head: true });

    // Second line item omits amount_cents → NOT NULL violation mid-loop.
    const res = await service.rpc("create_invoice", {
      payload: makePayload({
        line_items: [
          { position: 0, title: "Good", amount_cents: 100 },
          { position: 1, title: "Bad — no amount" },
        ],
      }),
    });
    expect(res.error).not.toBeNull();

    const { data: after } = await service
      .from("invoice_settings")
      .select("next_invoice_number")
      .single();
    const { count: countAfter } = await service
      .from("invoices")
      .select("*", { count: "exact", head: true });

    expect(after?.next_invoice_number).toBe(before?.next_invoice_number);
    expect(countAfter).toBe(countBefore);
  });

  it("rejects create_invoice/update_invoice from an anon client (negative authz)", async () => {
    const create = await anon.rpc("create_invoice", { payload: makePayload() });
    expect(create.error).not.toBeNull();
    // Postgres raises 42501 (insufficient_privilege); PostgREST surfaces it.
    expect(create.data).toBeNull();

    const update = await anon.rpc("update_invoice", {
      p_id: "00000000-0000-0000-0000-000000000000",
      payload: makePayload(),
    });
    expect(update.error).not.toBeNull();

    // And no row leaked in from the anon attempt.
    const { count } = await anon
      .from("invoices")
      .select("*", { count: "exact", head: true });
    // anon has read RLS? invoices policy is `to authenticated` only, so anon
    // sees nothing / is denied — either way it cannot have created a row.
    expect(count ?? 0).toBe(0);
  });
});
