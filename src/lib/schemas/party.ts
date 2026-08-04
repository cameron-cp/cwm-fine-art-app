import { z } from "zod";
import { optionalDate, optionalText, optionalUrl } from "./coercers";

// Party model (Silverston pattern). A single table for people/organizations/
// households, with standing roles and typed relationships. Buyer/seller/on-behalf
// are per-transaction roles on the invoice, NOT stored here.

export const partyKinds = ["person", "organization", "household"] as const;
export const partyKind = z.enum(partyKinds);
export type PartyKind = (typeof partyKinds)[number];

export const partyRoles = [
  "collector",
  "gallery",
  "auction_house",
  "advisory",
  "collection_manager",
  "studio",
  "artist",
  "museum",
  "dealer",
  "shipper",
  "conservator",
  "institution",
] as const;
export const partyRole = z.enum(partyRoles);
export type PartyRole = (typeof partyRoles)[number];

export const partyRelationshipTypes = [
  "employed_by",
  "advises",
  "manages_collection_of",
  "represents",
  "operated_by",
  "member_of",
] as const;
export const partyRelationshipType = z.enum(partyRelationshipTypes);
export type PartyRelationshipType = (typeof partyRelationshipTypes)[number];

// A LinkedIn URL — an individual profile (/in/…) or a company page (/company/…).
// Restricted to linkedin.com so a mistaken paste (e.g. the plain website) is caught.
function isLinkedInHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "linkedin.com" || h.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}
export const linkedinUrl = optionalUrl.refine(
  (u) => u === null || isLinkedInHost(u),
  "Must be a linkedin.com URL",
);

// Legal structure — a party is not always an LLC. Individuals, trusts, estates,
// and non-US corporate forms all buy and hold art.
export const entityTypes = [
  "individual",
  "sole_proprietor",
  "llc",
  "corporation",
  "ltd",
  "partnership",
  "trust",
  "estate",
  "foundation",
  "nonprofit",
  "gallery",
  "museum",
  "government",
  "other",
] as const;
export const entityType = z.enum(entityTypes);
export type EntityType = (typeof entityTypes)[number];

// Common labels for an address slot. Free text is allowed too (schema below is
// optionalText), but these cover the wealthy-collector cases: a work in the
// Aspen residence, another in a Geneva freeport, billing to the NY office.
export const addressLabelSuggestions = [
  "Residence",
  "Office",
  "Studio",
  "Storage",
  "Freeport",
  "Gallery",
  "Shipping",
  "Billing",
  "Other",
] as const;

export const partyAddressSchema = z.object({
  id: z.string().uuid().optional(),
  label: optionalText,
  line1: z.string().trim().min(1, "Street address is required"),
  line2: optionalText,
  city: optionalText,
  region: optionalText,
  postal_code: optionalText,
  country_code: optionalText,
  is_primary: z.boolean().default(false),
});

export type PartyAddressFormInput = z.input<typeof partyAddressSchema>;
export type PartyAddressInput = z.output<typeof partyAddressSchema>;

export const partySchema = z
  .object({
    kind: partyKind.default("person"),
    display_name: z.string().trim().min(1, "Name is required"),
    legal_name: optionalText,
    entity_type: entityType.nullish(),
    email: optionalText,
    phone: optionalText,
    website_url: optionalUrl,
    linkedin_url: linkedinUrl,
    notes: optionalText,
    // A holder she knows exists but cannot name ("private collectors in Palm
    // Beach", per the advisor). Real row so artwork_parties can point role='owner'
    // at it; flagged so it never reaches a picker that bills, emails, or charges.
    // See migration 0022.
    is_unidentified: z.boolean().default(false),
    roles: z.array(partyRole).default([]),
    addresses: z.array(partyAddressSchema).default([]),
  })
  // Exactly one primary when addresses exist; default to the first so the DB's
  // single-primary index is always satisfied.
  .transform((p) => {
    if (p.addresses.length && !p.addresses.some((a) => a.is_primary)) {
      p.addresses[0].is_primary = true;
    }
    return p;
  });

export type PartyFormInput = z.input<typeof partySchema>;
export type PartyInput = z.output<typeof partySchema>;

// Human-facing labels.
export const PARTY_KIND_LABELS: Record<PartyKind, string> = {
  person: "Person",
  organization: "Organization",
  household: "Household",
};

export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  collector: "Collector",
  gallery: "Gallery",
  auction_house: "Auction house",
  advisory: "Advisory",
  collection_manager: "Collection manager",
  studio: "Studio",
  artist: "Artist",
  museum: "Museum",
  dealer: "Dealer",
  shipper: "Shipper",
  conservator: "Conservator",
  institution: "Institution",
};

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  individual: "Individual",
  sole_proprietor: "Sole proprietor",
  llc: "LLC",
  corporation: "Corporation (Inc.)",
  ltd: "Limited company (Ltd)",
  partnership: "Partnership",
  trust: "Trust",
  estate: "Estate",
  foundation: "Foundation",
  nonprofit: "Nonprofit",
  gallery: "Gallery",
  museum: "Museum",
  government: "Government / institution",
  other: "Other",
};

export const PARTY_RELATIONSHIP_LABELS: Record<PartyRelationshipType, string> = {
  employed_by: "Employed by",
  advises: "Advises",
  manages_collection_of: "Manages collection of",
  represents: "Represents",
  operated_by: "Operated by",
  member_of: "Member of",
};

// DB row shapes.
export type Party = {
  id: string;
  kind: PartyKind;
  display_name: string;
  legal_name: string | null;
  entity_type: EntityType | null;
  email: string | null;
  phone: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  notes: string | null;
  // Known to exist, not nameable (migration 0022). Excluded from every
  // outward-action picker; a DB CHECK also bars it from holding a Stripe customer.
  is_unidentified: boolean;
  // Stripe Customer id (migration 0013), created lazily. null until a payment
  // method or checkout first needs a customer.
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PartyRoleRow = {
  party_id: string;
  role: PartyRole;
};

export type PartyAddressRow = {
  id: string;
  party_id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  is_primary: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export type PartyRelationshipRow = {
  id: string;
  from_party_id: string;
  to_party_id: string;
  type: PartyRelationshipType;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
  created_at: string;
};

// A relationship row joined to both endpoints' display names — what the contact
// page fetches and the relationships editor renders. Lifted here (was a local
// `RelRow` in contacts/[id]/page.tsx) so the page and the client component share
// one type. The two nested objects can be null if an embedded join misses.
export type PartyRelationshipWithParties = {
  id: string;
  type: PartyRelationshipType;
  from_party_id: string;
  to_party_id: string;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
  from_party: { display_name: string } | null;
  to_party: { display_name: string } | null;
};

// Write schema for a single relationship. `id` present = editing an existing row.
// Directional: from_party_id is the subject, to_party_id the object of `type`.
export const partyRelationshipSchema = z
  .object({
    id: z.string().uuid().optional(),
    from_party_id: z.string().uuid("Pick a contact"),
    to_party_id: z.string().uuid("Pick a contact"),
    type: partyRelationshipType,
    valid_from: optionalDate,
    valid_to: optionalDate,
    notes: optionalText,
  })
  .refine((r) => r.from_party_id !== r.to_party_id, {
    message: "A contact can't have a relationship to itself",
    path: ["to_party_id"],
  });

export type PartyRelationshipFormInput = z.input<typeof partyRelationshipSchema>;
export type PartyRelationshipInput = z.output<typeof partyRelationshipSchema>;

// --- Directional phrasing + option mapping (single source of truth) ----------
//
// A relationship edge is directional (from → to), but the UI is always anchored on
// the contact whose page you're viewing. `contactIsFrom` = the current contact fills
// the `from` (subject) side. All four helpers below live here — not inline in the
// client component — so the picker labels, the rendered rows, and the add/edit
// mapping can never disagree about which direction an edge points, and so the mapping
// is unit-testable against the real functions the component runs.

// Render one directed edge as a short phrase anchored on the current contact.
// Matches the wording the read-only contact page used before this feature:
//   relationshipPhrase("advises", true,  "Bob", "Jane") → "Advises Bob"
//   relationshipPhrase("advises", false, "Bob", "Jane") → "Bob — Advises Jane"
// Used verbatim for picker option labels too (with otherName = "…"), so a label
// can never point the arrow the opposite way from the row it produces.
export function relationshipPhrase(
  type: PartyRelationshipType,
  contactIsFrom: boolean,
  otherName: string,
  contactName = "this contact",
): string {
  const label = PARTY_RELATIONSHIP_LABELS[type];
  return contactIsFrom
    ? `${label} ${otherName}`
    : `${otherName} — ${label} ${contactName}`;
}

export type DirectedRelationshipOption = {
  value: string; // `${type}:${"from"|"to"}` — encodes type AND direction
  label: string;
  type: PartyRelationshipType;
  contactIsFrom: boolean;
};

// The 12 picker options (6 types × 2 directions), phrased with the current contact
// as the anchor. Built from relationshipPhrase so labels and rows share wording.
export function directedRelationshipOptions(
  contactName: string,
): DirectedRelationshipOption[] {
  return partyRelationshipTypes.flatMap((type) =>
    [true, false].map((contactIsFrom) => ({
      value: `${type}:${contactIsFrom ? "from" : "to"}`,
      label: relationshipPhrase(type, contactIsFrom, "…", contactName),
      type,
      contactIsFrom,
    })),
  );
}

// Add-path mapping: a chosen option value + the picked other party → a DB row's
// directional ids + type. Inverse of prefillDirectedOptionKey.
export function buildRelationshipInput(
  contactId: string,
  optionValue: string,
  otherPartyId: string,
): {
  from_party_id: string;
  to_party_id: string;
  type: PartyRelationshipType;
} {
  const [type, direction] = optionValue.split(":");
  const contactIsFrom = direction === "from";
  return {
    from_party_id: contactIsFrom ? contactId : otherPartyId,
    to_party_id: contactIsFrom ? otherPartyId : contactId,
    type: type as PartyRelationshipType,
  };
}

// Edit-path mapping: an existing row (relative to the current contact) → the option
// value to preselect. Inverse of buildRelationshipInput.
export function prefillDirectedOptionKey(
  row: Pick<PartyRelationshipRow, "from_party_id" | "to_party_id" | "type">,
  contactId: string,
): string {
  const contactIsFrom = row.from_party_id === contactId;
  return `${row.type}:${contactIsFrom ? "from" : "to"}`;
}
