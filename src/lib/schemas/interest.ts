import { z } from "zod";
import { COUNTRY_CODES } from "@/lib/countries";
import { optionalPriceCents, optionalText, optionalUuid } from "./coercers";

// Collector areas of interest (migration 0014). One row = one typed signal about
// what a collector is into, along a fixed set of dimensions. Vocab arrays + z.enum
// + *_LABELS records follow the party.ts convention.

export const interestDimensions = [
  "artist",
  "medium",
  "era",
  "movement",
  "school",
  "nationality",
  "subject",
  "format",
  "price_band",
] as const;
export const interestDimension = z.enum(interestDimensions);
export type InterestDimension = (typeof interestDimensions)[number];

// The dimensions whose payload lives in `value` (free text, or an ISO alpha-2 code
// for nationality). Everything not artist/price_band.
export const valueDimensions = [
  "medium",
  "era",
  "movement",
  "school",
  "nationality",
  "subject",
  "format",
] as const;

export const interestSentiments = [
  "seeking",
  "collects",
  "owns",
  "watching",
  "avoid",
] as const;
export const interestSentiment = z.enum(interestSentiments);
export type InterestSentiment = (typeof interestSentiments)[number];

export const interestSources = [
  "stated",
  "inferred_from_purchase",
  "inferred_from_conversation",
  "other",
] as const;
export const interestSource = z.enum(interestSources);
export type InterestSource = (typeof interestSources)[number];

export const interestConfidences = ["confirmed", "likely", "tentative"] as const;
export const interestConfidence = z.enum(interestConfidences);
export type InterestConfidence = (typeof interestConfidences)[number];

// Flat base object + superRefine (NOT z.discriminatedUnion): a single flat field
// set is simpler to drive from the capture form's dimension-switch, and the refine
// mirrors the DB CHECK one-to-one (verified in lockstep by the parity test).
const baseInterest = z.object({
  dimension: interestDimension,
  sentiment: interestSentiment.default("seeking"),
  source: interestSource.default("stated"),
  confidence: interestConfidence.default("confirmed"),
  artist_id: optionalUuid, // set iff dimension='artist'
  value: optionalText, // set for value-dimensions (ISO code for nationality)
  price_min_cents: optionalPriceCents, // set iff dimension='price_band'
  price_max_cents: optionalPriceCents,
  qualifier: optionalText,
});

export const interestSchema = baseInterest.superRefine((v, ctx) => {
  const noPrice = v.price_min_cents == null && v.price_max_cents == null;

  if (v.dimension === "artist") {
    if (!v.artist_id)
      ctx.addIssue({ code: "custom", path: ["artist_id"], message: "Pick an artist" });
    if (v.value != null)
      ctx.addIssue({ code: "custom", path: ["value"], message: "An artist interest can't carry a text value" });
    if (!noPrice)
      ctx.addIssue({ code: "custom", path: ["price_min_cents"], message: "An artist interest can't carry a price" });
    return;
  }

  if (v.dimension === "price_band") {
    if (v.artist_id)
      ctx.addIssue({ code: "custom", path: ["artist_id"], message: "A price band can't reference an artist" });
    if (v.value != null)
      ctx.addIssue({ code: "custom", path: ["value"], message: "A price band can't carry a text value" });
    if (noPrice)
      ctx.addIssue({ code: "custom", path: ["price_min_cents"], message: "Enter a minimum or maximum price" });
    if (
      v.price_min_cents != null &&
      v.price_max_cents != null &&
      v.price_max_cents < v.price_min_cents
    )
      ctx.addIssue({ code: "custom", path: ["price_max_cents"], message: "Maximum must be at least the minimum" });
    return;
  }

  // value-dimensions (medium/era/movement/school/nationality/subject/format)
  if (v.artist_id)
    ctx.addIssue({ code: "custom", path: ["artist_id"], message: "This dimension can't reference an artist" });
  if (!noPrice)
    ctx.addIssue({ code: "custom", path: ["price_min_cents"], message: "This dimension can't carry a price" });
  if (!v.value) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a value" });
  } else if (
    v.dimension === "nationality" &&
    !(COUNTRY_CODES as readonly string[]).includes(v.value)
  ) {
    // Nationality codes are validated app-side (like artist_nationalities); the DB
    // CHECK only requires a non-empty value, so this rule is app-only by design.
    ctx.addIssue({ code: "custom", path: ["value"], message: "Pick a valid country" });
  }
});

export type InterestFormInput = z.input<typeof interestSchema>;
export type InterestInput = z.output<typeof interestSchema>;

// DB row + the artist name from the embedded join on read.
export type InterestRow = {
  id: string;
  party_id: string;
  dimension: InterestDimension;
  sentiment: InterestSentiment;
  source: InterestSource;
  confidence: InterestConfidence;
  artist_id: string | null;
  artist_name: string | null;
  value: string | null;
  price_min_cents: number | null;
  price_max_cents: number | null;
  qualifier: string | null;
  created_at: string;
  updated_at: string;
};

// Human-facing labels.
export const INTEREST_DIMENSION_LABELS: Record<InterestDimension, string> = {
  artist: "Artist",
  medium: "Medium",
  era: "Era / period",
  movement: "Movement",
  school: "School",
  nationality: "Nationality",
  subject: "Subject",
  format: "Format",
  price_band: "Price range",
};

export const INTEREST_SENTIMENT_LABELS: Record<InterestSentiment, string> = {
  seeking: "Seeking",
  collects: "Collects",
  owns: "Owns",
  watching: "Watching",
  avoid: "Avoid",
};

export const INTEREST_SOURCE_LABELS: Record<InterestSource, string> = {
  stated: "Stated",
  inferred_from_purchase: "Inferred from purchase",
  inferred_from_conversation: "Inferred from conversation",
  other: "Other",
};

export const INTEREST_CONFIDENCE_LABELS: Record<InterestConfidence, string> = {
  confirmed: "Confirmed",
  likely: "Likely",
  tentative: "Tentative",
};
