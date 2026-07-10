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

export const partySchema = z.object({
  kind: partyKind.default("person"),
  display_name: z.string().trim().min(1, "Name is required"),
  legal_name: optionalText,
  email: optionalText,
  phone: optionalText,
  address: optionalText,
  notes: optionalText,
  roles: z.array(partyRole).default([]),
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
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PartyRoleRow = {
  party_id: string;
  role: PartyRole;
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
