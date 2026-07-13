import { countryName } from "@/lib/countries";
import { formatInvoiceMoney } from "@/lib/money";
import type { InterestRow } from "@/lib/schemas/interest";

// The SINGLE place the dimension -> "which field is authoritative" switch lives.
// Both summarizeInterests and the InterestsEditor chips consume this, so they can
// never disagree about how to label a row.

export type ResolvedInterest = {
  kind: "artist" | "text" | "price_band";
  label: string;
};

// The value part of one interest row (no verb/sentiment) — just the thing itself.
type InterestValueFields = Pick<
  InterestRow,
  "dimension" | "artist_name" | "value" | "price_min_cents" | "price_max_cents"
>;

export function formatPriceBand(
  minCents: number | null,
  maxCents: number | null,
  currency = "USD",
): string {
  if (minCents != null && maxCents != null)
    return `${formatInvoiceMoney(minCents, currency)}–${formatInvoiceMoney(maxCents, currency)}`;
  if (minCents != null) return `over ${formatInvoiceMoney(minCents, currency)}`;
  if (maxCents != null) return `under ${formatInvoiceMoney(maxCents, currency)}`;
  return "any price";
}

export function resolveInterestValue(row: InterestValueFields): ResolvedInterest {
  switch (row.dimension) {
    case "artist":
      return { kind: "artist", label: row.artist_name ?? "Unknown artist" };
    case "price_band":
      return {
        kind: "price_band",
        label: formatPriceBand(row.price_min_cents, row.price_max_cents),
      };
    case "nationality":
      return { kind: "text", label: countryName(row.value) || (row.value ?? "") };
    default:
      return { kind: "text", label: row.value ?? "" };
  }
}
