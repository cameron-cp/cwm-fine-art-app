import { describe, expect, it } from "vitest";
import { formatPriceBand, resolveInterestValue } from "../resolve";
import { summarizeInterests } from "../summarize";
import type { InterestRow } from "@/lib/schemas/interest";

// Build an InterestRow with sane defaults; override per case.
function row(overrides: Partial<InterestRow>): InterestRow {
  return {
    id: crypto.randomUUID(),
    party_id: "p",
    dimension: "medium",
    sentiment: "seeking",
    source: "stated",
    confidence: "confirmed",
    artist_id: null,
    artist_name: null,
    value: "Oil on canvas",
    price_min_cents: null,
    price_max_cents: null,
    qualifier: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("summarizeInterests", () => {
  it("returns empty string for no rows (component renders nothing)", () => {
    // Drift-proof: an empty collector has no summary, not a stray 'Seeking .'.
    expect(summarizeInterests([])).toBe("");
  });

  it("puts an avoid signal in the 'avoids' clause and never in 'seeking'", () => {
    // The whole point of the avoid sentiment: it must read as a negative, not get
    // silently mixed into what the collector wants.
    const s = summarizeInterests([
      row({ dimension: "artist", artist_name: "Agnes Martin", value: null, sentiment: "seeking" }),
      row({ dimension: "format", value: "editions", sentiment: "avoid" }),
    ]);
    expect(s).toBe("Seeking Agnes Martin; avoids editions.");
    expect(s).not.toContain("seeking editions");
    expect(s).not.toContain("Seeking editions");
  });

  it("formats a min-only price band with the exact-cents formatter", () => {
    // Money must render via formatInvoiceMoney (exact cents), NEVER whole-dollar.
    // 50000 cents = $500.00.
    const s = summarizeInterests([
      row({ dimension: "price_band", value: null, price_min_cents: 50_000, sentiment: "seeking" }),
    ]);
    expect(s).toBe("Seeking over $500.00.");
    expect(formatPriceBand(50_000, null)).toBe("over $500.00");
    expect(formatPriceBand(50_000, 150_000)).toBe("$500.00–$1,500.00");
    expect(formatPriceBand(null, 50_000)).toBe("under $500.00");
  });

  it("moves a row between clauses when only its sentiment changes", () => {
    // Falsifies any implementation that buckets by something other than sentiment.
    const base = { dimension: "movement" as const, value: "Minimalism" };
    expect(summarizeInterests([row({ ...base, sentiment: "seeking" })])).toBe(
      "Seeking Minimalism.",
    );
    expect(summarizeInterests([row({ ...base, sentiment: "avoid" })])).toBe(
      "Avoids Minimalism.",
    );
  });

  it("orders values within a clause newest-first (created_at desc), independent of input order", () => {
    // Input deliberately oldest-first; output must still lead with the newest.
    const s = summarizeInterests([
      row({ dimension: "school", value: "Old", created_at: "2026-01-01T00:00:00.000Z" }),
      row({ dimension: "school", value: "New", created_at: "2026-06-01T00:00:00.000Z" }),
    ]);
    expect(s).toBe("Seeking New and Old.");
  });

  it("appends a qualifier and Oxford-joins three values", () => {
    const s = summarizeInterests([
      row({ dimension: "artist", artist_name: "Basquiat", value: null, qualifier: "early works", created_at: "2026-03-03T00:00:00.000Z" }),
      row({ dimension: "medium", value: "canvas", created_at: "2026-02-02T00:00:00.000Z" }),
      row({ dimension: "era", value: "1980s", created_at: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(s).toBe("Seeking Basquiat (early works), canvas and 1980s.");
  });
});

describe("resolveInterestValue", () => {
  it("labels nationality via country name, not the raw code", () => {
    expect(resolveInterestValue(row({ dimension: "nationality", value: "CU" })).label).toBe(
      "Cuba",
    );
  });

  it("falls back to a placeholder when an artist row has no joined name", () => {
    expect(
      resolveInterestValue(row({ dimension: "artist", artist_name: null, value: null })).label,
    ).toBe("Unknown artist");
  });
});
