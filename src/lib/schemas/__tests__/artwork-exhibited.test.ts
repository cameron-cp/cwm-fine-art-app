import { describe, expect, it } from "vitest";
import { artworkSchema } from "../artwork";
import {
  importDraftSchema,
  importDraftToolInputSchema,
  modelOutputSchema,
} from "../import-draft";

// Exhibition history has to survive the whole chain — AI extraction of an uploaded
// factsheet → persisted draft → review form → artworks row → tearsheet PDF. Each
// hand-off re-declares the field list, so each one is a place it can be silently
// dropped: an unlisted key in a Zod object is stripped, not rejected.

const REAL_ENTRY =
  "Santa Fe, Gerald Peters Gallery, Picasso on Paper, Selected Works from the " +
  "Marina Picasso Collection, August – November 1998, fig. 10, n.p. (incorrect " +
  "medium listed), traveled to Dallas, Gerald Peters Gallery, November – December 1998.";

// artworkSchema's optionalText fields coerce "" → null but reject `undefined`, so
// every caller sends the full key set. Mirror that here.
const BASE_ARTWORK = {
  artist_id: "19ff35a1-59d4-4e29-bc70-7cc4353206ef",
  title: "Homme au béret basque",
  year: 1946,
  medium: "Gouache on paper",
  signature_details: null,
  height_in: 19.88,
  width_in: 13,
  depth_in: null,
  edition: null,
  catalogue_raisonne: null,
  provenance_lines: [],
  exhibited: null,
  literature: null,
  condition: null,
  price_cents: null,
  currency: "USD",
  status: "available" as const,
  notes: null,
  primary_image_path: null,
  current_party_address_id: null,
};

describe("artworkSchema.exhibited", () => {
  it("keeps the field, so it reaches the DB write", () => {
    // artworkSchema is the gate in front of createArtwork/updateArtwork's
    // toDbRow(). If exhibited were absent from the schema, Zod would strip it
    // here and the save would succeed while losing the dealer's typing.
    const parsed = artworkSchema.parse({ ...BASE_ARTWORK, exhibited: REAL_ENTRY });
    expect(parsed.exhibited).toBe(REAL_ENTRY);
  });

  it("preserves the blank lines that separate one exhibition from the next", () => {
    // The tearsheet splits on /\n\s*\n/ to get one <p> per exhibition — so the
    // paragraph breaks are data, and trimming them would merge two shows into one.
    const two = `${REAL_ENTRY}\n\nNew York, Acquavella Galleries, Picasso, May – June 2003, no. 14.`;
    const parsed = artworkSchema.parse({ ...BASE_ARTWORK, exhibited: two });
    expect(parsed.exhibited?.split(/\n\s*\n/)).toHaveLength(2);
  });

  it("stores an empty field as null, not an empty string", () => {
    // Most works have never been exhibited. The render page checks for content
    // after splitting, but a NULL column keeps "no exhibition history" honest in
    // the data rather than recording an empty one.
    expect(artworkSchema.parse({ ...BASE_ARTWORK, exhibited: "" }).exhibited).toBeNull();
    expect(artworkSchema.parse({ ...BASE_ARTWORK, exhibited: "   \n  " }).exhibited).toBeNull();
  });
});

describe("import extraction contract", () => {
  it("asks the model for exhibited, and requires an explicit answer", () => {
    // In the required list the model must return null for a factsheet with no
    // exhibition section, instead of quietly omitting the key and leaving us
    // unable to tell "no exhibitions" from "didn't look".
    const props = importDraftToolInputSchema.properties as Record<string, unknown>;
    expect(props.exhibited).toBeDefined();
    expect(importDraftToolInputSchema.required).toContain("exhibited");
  });

  it("accepts the model's extraction verbatim", () => {
    const parsed = modelOutputSchema.parse({
      artist_name: "Pablo Picasso",
      title: "Homme au béret basque",
      year: 1946,
      medium: "Gouache on paper",
      signature_details: null,
      height_in: 19.88,
      width_in: 13,
      depth_in: null,
      edition: null,
      catalogue_raisonne: null,
      provenance_lines: ["Estate of the artist;"],
      exhibited: REAL_ENTRY,
      literature: null,
    });
    expect(parsed.exhibited).toBe(REAL_ENTRY);
  });

  it("treats an omitted exhibited key as 'no exhibition history'", () => {
    // Belt and braces on a forced tool call: a model that drops the property
    // must not fail the entire extraction of an otherwise-good factsheet.
    const parsed = modelOutputSchema.parse({
      artist_name: "Pablo Picasso",
      title: "Homme au béret basque",
      year: 1946,
      medium: "Gouache on paper",
      signature_details: null,
      height_in: 19.88,
      width_in: 13,
      depth_in: null,
      edition: null,
      catalogue_raisonne: null,
      provenance_lines: [],
      literature: null,
    });
    expect(parsed.exhibited).toBeNull();
  });

  it("still parses drafts saved before the field existed", () => {
    // importDraftSchema validates persisted import_drafts.payload jsonb. A draft
    // sitting on the review screen from before this change has no exhibited key;
    // rejecting it would strand a half-finished import with no way to recover.
    const legacyPayload = {
      artist_id: null,
      matched_artist_id: null,
      suggested_artist_name: "Pablo Picasso",
      matched_artist_candidates: [],
      title: "Homme au béret basque",
      year: 1946,
      medium: "Gouache on paper",
      signature_details: null,
      height_in: 19.88,
      width_in: 13,
      depth_in: null,
      edition: null,
      catalogue_raisonne: null,
      provenance_lines: ["Estate of the artist;"],
      literature: null,
    };
    const parsed = importDraftSchema.safeParse(legacyPayload);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.exhibited).toBeNull();
  });
});
