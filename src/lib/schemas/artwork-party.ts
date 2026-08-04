import { z } from "zod";
import { optionalDate, optionalText } from "./coercers";

// Artwork <-> party edges (migration 0019, renamed from artwork_ownerships/0016).
// One row = one party attached to one work in one named role, over an open
// interval. Vocab arrays + z.enum + *_LABELS records follow the party.ts /
// interest.ts convention.

export const artworkPartyRoles = [
  "owner",
  "consignor",
  "advisor",
  "gallery",
  "agent",
  "custodian",
  "conservator",
  "lender",
  "other",
] as const;
export const artworkPartyRole = z.enum(artworkPartyRoles);
export type ArtworkPartyRole = (typeof artworkPartyRoles)[number];

// The ONE role that means title. Anything reporting an "owner" — this app's UI,
// the Registrar chat, a future provenance view — must filter on exactly this and
// nothing else, or an advisor silently becomes an owner. Exported as a constant
// so the rule is greppable rather than a string literal sprinkled around.
export const TITLE_ROLE: ArtworkPartyRole = "owner";

// Kept in lockstep with artwork_parties_source_check / _confidence_check (0016,
// renamed in 0019). Deliberately the same vocabulary as collector_interests'
// source/confidence so a consumer can weight both signals the same way.
export const artworkPartySources = [
  "stated",
  "provenance",
  "inferred_from_conversation",
  "public_record",
  "other",
] as const;
export const artworkPartySource = z.enum(artworkPartySources);
export type ArtworkPartySource = (typeof artworkPartySources)[number];

export const artworkPartyConfidences = ["confirmed", "likely", "tentative"] as const;
export const artworkPartyConfidence = z.enum(artworkPartyConfidences);
export type ArtworkPartyConfidence = (typeof artworkPartyConfidences)[number];

// The superRefine mirrors artwork_parties_interval_check one-to-one; the parity
// test asserts the two never drift (collector_interests precedent).
export const artworkPartySchema = z
  .object({
    artwork_id: z.string().uuid("Pick an artwork"),
    role: artworkPartyRole.default("owner"),
    source: artworkPartySource.default("stated"),
    confidence: artworkPartyConfidence.default("confirmed"),
    started_on: optionalDate,
    ended_on: optionalDate,
    // .default(null) matters: optionalText only maps "" -> null, so an ABSENT
    // key would otherwise be rejected — and { artwork_id } alone (this feature's
    // primary case: "she owns this") has to be a valid link.
    notes: optionalText.default(null),
  })
  .superRefine((v, ctx) => {
    // ISO YYYY-MM-DD sorts lexicographically, so a string compare is the date
    // compare. Matches the DB's `ended_on >= started_on`, which is likewise a
    // no-op when either side is null.
    if (v.started_on && v.ended_on && v.ended_on < v.started_on) {
      ctx.addIssue({
        code: "custom",
        path: ["ended_on"],
        message: "End date must be on or after the start date",
      });
    }
  });

export type ArtworkPartyFormInput = z.input<typeof artworkPartySchema>;
export type ArtworkPartyInput = z.output<typeof artworkPartySchema>;

// The joined work, as the contact page reads it. Enough for a wall label plus a
// thumbnail — the row links out to /artworks/{id} for everything else.
export type LinkedArtwork = {
  id: string;
  title: string;
  year: number | null;
  medium: string | null;
  edition: string | null;
  status: string;
  record_kind: string;
  price_cents: number | null;
  currency: string;
  primary_image_path: string | null;
  artist_name: string | null;
};

// DB row + the flattened artwork join.
export type ArtworkPartyRow = {
  id: string;
  artwork_id: string;
  party_id: string;
  role: ArtworkPartyRole;
  source: ArtworkPartySource;
  confidence: ArtworkPartyConfidence;
  started_on: string | null;
  ended_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  artwork: LinkedArtwork | null;
};

// Human-facing labels. ROLE_LABELS is the noun used on the row tag; the summary
// sentence needs a verb phrase instead, hence the second record.
export const ARTWORK_PARTY_ROLE_LABELS: Record<ArtworkPartyRole, string> = {
  owner: "Owner",
  consignor: "Consignor",
  advisor: "Advisor",
  gallery: "Gallery",
  agent: "Agent",
  custodian: "Custodian",
  conservator: "Conservator",
  lender: "Lender",
  other: "Other",
};

export const ARTWORK_PARTY_ROLE_HINTS: Record<ArtworkPartyRole, string> = {
  owner: "Holds title",
  consignor: "Placed the work with the gallery",
  advisor: "Advises on the work",
  gallery: "Gallery handling the work",
  agent: "Acts for the owner",
  custodian: "Holds the work, not the title",
  conservator: "Has the work for treatment",
  lender: "Lent the work out",
  other: "Anything else — say what in the note",
};

export const ARTWORK_PARTY_SOURCE_LABELS: Record<ArtworkPartySource, string> = {
  stated: "Stated",
  provenance: "Provenance",
  inferred_from_conversation: "Inferred from conversation",
  public_record: "Public record",
  other: "Other",
};

export const ARTWORK_PARTY_CONFIDENCE_LABELS: Record<ArtworkPartyConfidence, string> = {
  confirmed: "Confirmed",
  likely: "Likely",
  tentative: "Tentative",
};
