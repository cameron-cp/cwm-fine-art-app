import { z } from "zod";
import { artworkStatus } from "./artwork";

// All-nullable mirror of artworkSchema fields used during the import flow.
// Validates Anthropic's tool-use output before persisting to import_drafts.
// suggested_artist_name + matched_artist_id are filled in by the API route
// after artist matching, NOT by the model.

export const importDraftSchema = z.object({
  artist_id: z.string().uuid().nullable(),
  matched_artist_id: z.string().uuid().nullable(),
  suggested_artist_name: z.string().trim().min(1).nullable(),
  matched_artist_candidates: z
    .array(z.object({ id: z.string().uuid(), name: z.string() }))
    .default([]),
  title: z.string().trim().min(1).nullable(),
  year: z.number().int().min(1).max(3000).nullable(),
  medium: z.string().trim().min(1).nullable(),
  signature_details: z.string().trim().min(1).nullable(),
  height_in: z.number().min(0).max(10000).nullable(),
  width_in: z.number().min(0).max(10000).nullable(),
  depth_in: z.number().min(0).max(10000).nullable(),
  edition: z.string().trim().min(1).nullable(),
  catalogue_raisonne: z.string().trim().min(1).nullable(),
  provenance_lines: z.array(z.string().trim().min(1)).default([]),
  // .default(null) so drafts saved before the Exhibited field existed still
  // parse — this schema validates persisted import_drafts.payload jsonb, and a
  // missing key must not strand a pending import on the review screen.
  exhibited: z.string().trim().min(1).nullable().default(null),
  literature: z.string().trim().min(1).nullable(),
});

export type ImportDraft = z.infer<typeof importDraftSchema>;

// JSON Schema for Anthropic's tool input_schema. Only fields the model fills in.
// Server-set fields (matched_artist_id, suggested_artist_name, candidates,
// artist_id) are excluded — the model never produces those.
//
// Every absent-able field declares null in its type, so the model returns
// `null` (not `""`) when a section isn't on the factsheet. Zod's preprocessing
// also coerces empty strings to null defensively.
export const importDraftToolInputSchema = {
  type: "object" as const,
  properties: {
    artist_name: {
      type: ["string", "null"],
      description:
        "Full artist name as it appears on the factsheet, e.g. 'Philip Guston'. Use null if not stated.",
    },
    title: {
      type: ["string", "null"],
      description:
        "The artwork's title, italicized on the factsheet. e.g. 'Migration'. Null if not stated.",
    },
    year: {
      type: ["integer", "null"],
      description:
        "Year the artwork was made (4-digit integer). Null if not stated.",
    },
    medium: {
      type: ["string", "null"],
      description:
        "Medium of the work, e.g. 'Oil on canvas' or 'Bronze, edition of 6'. Null if not stated.",
    },
    signature_details: {
      type: ["string", "null"],
      description:
        "Signature, inscription, or stamp details verbatim, e.g. 'Inscribed on the reverse: \"PHILIP GUSTON / MIGRATION\"'. Null if not stated.",
    },
    height_in: {
      type: ["number", "null"],
      description:
        "Height in inches as a decimal. Convert from cm if only cm is provided. Null if no dimensions stated.",
    },
    width_in: {
      type: ["number", "null"],
      description: "Width in inches. Null if not stated.",
    },
    depth_in: {
      type: ["number", "null"],
      description:
        "Depth in inches for sculptural works. Null for paintings, works on paper, or any flat work.",
    },
    edition: {
      type: ["string", "null"],
      description:
        "Edition information for prints/multiples, e.g. '3/10' or 'AP 2/4'. Null if not stated.",
    },
    catalogue_raisonne: {
      type: ["string", "null"],
      description:
        "Catalogue raisonné registration sentence verbatim, e.g. 'This work is registered in the Philip Guston Catalogue Raisonné (# P78.047).'. Null if not stated.",
    },
    provenance_lines: {
      type: "array",
      items: { type: "string" },
      description:
        "Each previous owner or auction record as a separate string, in chronological order. Empty array if no Provenance section.",
    },
    exhibited: {
      type: ["string", "null"],
      description:
        "Verbatim EXHIBITED / Exhibitions / Exhibition History section text — every exhibition the work has been shown in. Keep each exhibition's full entry intact on one paragraph (city, venue, exhibition title, dates, catalogue figure/page, and any 'traveled to ...' leg all belong to the SAME entry), and separate one exhibition from the next with double newlines. Null if the factsheet has no exhibition section.",
    },
    literature: {
      type: ["string", "null"],
      description:
        "Verbatim Literature section text. Preserve paragraph breaks as double newlines so each citation renders separately. Null if no Literature section.",
    },
  },
  required: [
    "artist_name",
    "title",
    "year",
    "medium",
    "signature_details",
    "height_in",
    "width_in",
    "depth_in",
    "edition",
    "catalogue_raisonne",
    "provenance_lines",
    "exhibited",
    "literature",
  ],
};

// Defensive: coerce "" → null for nullable text fields, since some model
// outputs default to empty string instead of explicit null.
const nullableText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().min(1).nullable(),
);

const nullableYear = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.number().int().min(1).max(3000).nullable(),
);

const nullableInches = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.number().min(0).max(10000).nullable(),
);

// Shape the Anthropic tool produces (model output, before artist matching).
export const modelOutputSchema = z.object({
  artist_name: nullableText,
  title: nullableText,
  year: nullableYear,
  medium: nullableText,
  signature_details: nullableText,
  height_in: nullableInches,
  width_in: nullableInches,
  depth_in: nullableInches,
  edition: nullableText,
  catalogue_raisonne: nullableText,
  provenance_lines: z.array(z.string().trim().min(1)).default([]),
  // Tolerate an omitted key as well as an explicit null: Exhibited is absent
  // from most factsheets, and a model that drops the property entirely must not
  // fail the whole extraction.
  exhibited: nullableText.default(null),
  literature: nullableText,
});

export type ModelOutput = z.infer<typeof modelOutputSchema>;

// Re-export status enum for the artwork status field (kept on the artwork
// itself, not extracted by the model; defaults to "available" on save).
export const importStatusEnum = artworkStatus;
