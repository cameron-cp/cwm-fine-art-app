import { describe, expect, it } from "vitest";
import { interestSchema } from "../interest";

// Pure (no-DB) validation of the superRefine shape rules. The DB CHECK is verified
// to agree with these in lockstep by the integration parity test
// (src/lib/__tests__/collector-interests.test.ts).

const ARTIST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function parse(input: Record<string, unknown>) {
  return interestSchema.safeParse({
    sentiment: "seeking",
    source: "stated",
    confidence: "confirmed",
    artist_id: "",
    value: "",
    price_min_cents: "",
    price_max_cents: "",
    qualifier: "",
    ...input,
  });
}

describe("interestSchema shape rules", () => {
  it("artist requires an artist_id and forbids value/price", () => {
    expect(parse({ dimension: "artist", artist_id: ARTIST }).success).toBe(true);
    expect(parse({ dimension: "artist", artist_id: "" }).success).toBe(false);
    expect(parse({ dimension: "artist", artist_id: ARTIST, value: "x" }).success).toBe(false);
  });

  it("value-dimensions require a non-empty value and forbid artist_id", () => {
    expect(parse({ dimension: "medium", value: "Oil on canvas" }).success).toBe(true);
    expect(parse({ dimension: "medium", value: "" }).success).toBe(false);
    expect(parse({ dimension: "medium", value: "Oil", artist_id: ARTIST }).success).toBe(false);
  });

  it("nationality validates the ISO code app-side (DB only checks non-empty)", () => {
    expect(parse({ dimension: "nationality", value: "US" }).success).toBe(true);
    expect(parse({ dimension: "nationality", value: "ZZ" }).success).toBe(false);
  });

  it("price_band needs a min or max and rejects max<min", () => {
    // Money input is dollars; the coercer turns it into cents.
    expect(parse({ dimension: "price_band", price_min_cents: "500" }).success).toBe(true);
    expect(parse({ dimension: "price_band" }).success).toBe(false);
    expect(
      parse({ dimension: "price_band", price_min_cents: "500", price_max_cents: "100" }).success,
    ).toBe(false);
    expect(
      parse({ dimension: "price_band", price_min_cents: "100", price_max_cents: "500" }).success,
    ).toBe(true);
  });

  it("coerces dollar input to integer cents on output", () => {
    const r = parse({ dimension: "price_band", price_min_cents: "1,200.50" });
    expect(r.success && r.data.price_min_cents).toBe(120050);
  });
});
