import { z } from "zod";
import { optionalText } from "./coercers";

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
    notes: optionalText,
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
  notes: string | null;
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
