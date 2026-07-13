import { resolveInterestValue } from "./resolve";
import {
  type InterestRow,
  type InterestSentiment,
  interestSentiments,
} from "@/lib/schemas/interest";

// Read-time, drift-proof natural-language summary of a collector's interests.
// A pure total function of the rows — never stored, never hand-edited (mirrors
// deriveSortName / formatNationalities). Recomputed on every render.
//
// Shape: one clause per non-empty sentiment bucket, in a fixed sentiment order,
// joined with "; ", the whole thing sentence-cased and ".".-terminated. Values
// within a clause are ordered created_at desc (newest signal first) and Oxford-
// joined. A qualifier appends as " (…)".

const SENTIMENT_VERB: Record<InterestSentiment, string> = {
  seeking: "seeking",
  collects: "collects",
  owns: "owns",
  watching: "watching",
  avoid: "avoids",
};

// "a" | "a and b" | "a, b and c"
function joinOxford(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

type SummaryRow = Pick<
  InterestRow,
  | "dimension"
  | "sentiment"
  | "artist_name"
  | "value"
  | "price_min_cents"
  | "price_max_cents"
  | "qualifier"
  | "created_at"
>;

function labelFor(row: SummaryRow): string {
  const base = resolveInterestValue(row).label;
  return row.qualifier ? `${base} (${row.qualifier})` : base;
}

export function summarizeInterests(rows: SummaryRow[]): string {
  if (rows.length === 0) return "";

  const clauses: string[] = [];
  for (const sentiment of interestSentiments) {
    const bucket = rows
      .filter((r) => r.sentiment === sentiment)
      // Newest signal first. Stable string compare on the ISO timestamp.
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    if (bucket.length === 0) continue;
    const values = joinOxford(bucket.map(labelFor));
    clauses.push(`${SENTIMENT_VERB[sentiment]} ${values}`);
  }

  const joined = clauses.join("; ");
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}
