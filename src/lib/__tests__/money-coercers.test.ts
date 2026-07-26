import { describe, expect, it } from "vitest";
import { artworkSchema } from "@/lib/schemas/artwork";
import { interestSchema } from "@/lib/schemas/interest";
import { invoiceSchema } from "@/lib/schemas/invoice";
import { retainerCreateSchema } from "@/lib/schemas/stripe";
import { formatPriceCents } from "@/lib/supabase/storage";

// Every write path in this app parses its schema TWICE: zodResolver validates in
// the browser form, then the server action re-validates the resolver's own output
// (the client can't be trusted). So a money coercer that isn't idempotent
// silently multiplies the stored amount by 100 on every save — the bug where a
// $9,000,000 artwork landed in the list as $900,000,000.
//
// The invariant these tests pin: parse(parse(x)) === parse(x) for money, and a
// number handed to a *_cents field is ALREADY cents (never dollars).

const ARTIST_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function artworkValues(price: string | number | null) {
  return {
    artist_id: ARTIST_ID,
    title: "Untitled",
    year: null,
    medium: null,
    signature_details: null,
    height_in: null,
    width_in: null,
    depth_in: null,
    edition: null,
    catalogue_raisonne: null,
    provenance_lines: [],
    exhibited: null,
    literature: null,
    condition: null,
    price_cents: price,
    currency: "USD",
    status: "available" as const,
    notes: null,
    primary_image_path: null,
    current_party_address_id: null,
  };
}

describe("artwork price — the $9M regression", () => {
  it("stores a typed '9,000,000' as $9,000,000 and NOT $900,000,000 after the server re-parse", () => {
    const fromForm = artworkSchema.parse(artworkValues("9,000,000"));
    expect(fromForm.price_cents).toBe(900_000_000);

    // What the server action actually receives: the resolver's output.
    const fromServer = artworkSchema.parse(fromForm);
    expect(fromServer.price_cents).toBe(900_000_000);
    expect(fromServer.price_cents).not.toBe(90_000_000_000);

    // Close the loop on the reported symptom: what the artwork list renders.
    expect(formatPriceCents(fromServer.price_cents, fromServer.currency)).toBe(
      "$9,000,000",
    );
  });

  it("survives an arbitrary number of re-parses (edit → save → edit → save)", () => {
    let v = artworkSchema.parse(artworkValues("120000.50"));
    expect(v.price_cents).toBe(12_000_050);
    for (let i = 0; i < 5; i++) v = artworkSchema.parse(v);
    expect(v.price_cents).toBe(12_000_050);
  });

  it("keeps a blank price null through both passes", () => {
    const once = artworkSchema.parse(artworkValues(""));
    expect(once.price_cents).toBeNull();
    expect(artworkSchema.parse(once).price_cents).toBeNull();
  });
});

describe("invoice money — a legal document must not inflate 100x", () => {
  // optionalText requires the key to be present (it maps "" → null, not
  // undefined), so every nullable field is spelled out — same as the real form.
  const form = {
    buyer_party_id: null,
    on_behalf_of_party_id: null,
    seller_party_id: null,
    bill_to_name: "A Collector",
    bill_to_attention: null,
    bill_to_address: null,
    bill_to_email: null,
    date_issued: "2026-07-25",
    currency: "USD" as const,
    ship_from: null,
    ship_to: null,
    shipping_cents: "450.75",
    notes: null,
    line_items: [
      {
        artwork_id: null,
        position: 0,
        artist_name: null,
        title: "Work A",
        year: null,
        medium: null,
        dimensions_text: null,
        edition: null,
        signature_details: null,
        catalogue_raisonne: null,
        inventory_no: null,
        provenance_lines: [],
        amount_cents: "15,500.50",
      },
    ],
  };

  it("line amount + shipping are unchanged by the server re-parse", () => {
    const once = invoiceSchema.parse(form);
    expect(once.line_items[0].amount_cents).toBe(1_550_050);
    expect(once.shipping_cents).toBe(45_075);

    const twice = invoiceSchema.parse(once);
    expect(twice.line_items[0].amount_cents).toBe(1_550_050);
    expect(twice.shipping_cents).toBe(45_075);
  });
});

describe("callers that hand these fields real integer cents", () => {
  it("retainer form: amount_cents is cents already (it did the ×100 itself)", () => {
    // retainer-form.tsx: Math.round(Number(dollars) * 100) — $500/month.
    const parsed = retainerCreateSchema.parse({
      party_id: ARTIST_ID,
      amount_cents: 50_000,
      billing_interval: "month" as const,
      description: "Advisory retainer",
      currency: "USD" as const,
    });
    expect(parsed.amount_cents).toBe(50_000);
  });

  it("chat log_collector_interest: the tool declares price bands in cents", () => {
    // tools.ts declares price_min_cents/price_max_cents as "in cents" to Claude.
    const parsed = interestSchema.parse({
      dimension: "price_band" as const,
      sentiment: "seeking" as const,
      source: "inferred_from_conversation" as const,
      confidence: "likely" as const,
      artist_id: null,
      value: null,
      qualifier: null,
      price_min_cents: 5_000_000,
      price_max_cents: 20_000_000,
    });
    expect(parsed.price_min_cents).toBe(5_000_000);
    expect(parsed.price_max_cents).toBe(20_000_000);
  });

  it("rejects a fractional number instead of silently reading it as dollars", () => {
    // 12.5 used to mean "$12.50" → 1250 cents. Now it fails .int() loudly, so a
    // caller holding dollars is forced to convert rather than guess.
    const result = artworkSchema.safeParse(artworkValues(12.5));
    expect(result.success).toBe(false);
  });
});
