import { z } from "zod";
import { optionalPriceCents, optionalText, optionalYear } from "./coercers";

// Artwork-specific coercer (inches). Shared coercers live in ./coercers.
const optionalInches = z.preprocess(
  (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  },
  z.number().min(0).max(10000).nullable(),
);

export const artworkStatus = z.enum(["available", "on_hold", "sold"]);
export type ArtworkStatus = z.infer<typeof artworkStatus>;

// Provenance line items as objects in the form (useFieldArray requires objects);
// flattened to string[] before persisting.
export const provenanceLineSchema = z.object({
  value: z.string().trim().min(1, "Empty entry"),
});

export const artworkSchema = z.object({
  artist_id: z.string().uuid("Pick an artist"),
  title: z.string().trim().min(1, "Title is required"),
  year: optionalYear,
  medium: optionalText,
  signature_details: optionalText,
  height_in: optionalInches,
  width_in: optionalInches,
  depth_in: optionalInches,
  edition: optionalText,
  catalogue_raisonne: optionalText,
  provenance_lines: z.array(provenanceLineSchema).default([]),
  literature: optionalText,
  condition: optionalText,
  price_cents: optionalPriceCents,
  currency: z.string().trim().min(3).max(3).default("USD"),
  status: artworkStatus.default("available"),
  notes: optionalText,
  primary_image_path: optionalText,
});

export type ArtworkFormInput = z.input<typeof artworkSchema>;
export type ArtworkInput = z.output<typeof artworkSchema>;

// DB shape: provenance_lines is flat text[] in postgres, not [{value}].
export type Artwork = Omit<ArtworkInput, "provenance_lines"> & {
  id: string;
  provenance_lines: string[];
  created_at: string;
  updated_at: string;
};

export type ArtworkImage = {
  id: string;
  artwork_id: string;
  storage_path: string;
  position: number;
  created_at: string;
};
