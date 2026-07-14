import { z } from "zod";
import { optionalText } from "./coercers";

// Viewing rooms (migration 0017). A room is a curated, per-recipient online
// presentation of inventory works. Vocab arrays + z.enum + *_LABELS records follow
// the interest.ts / party.ts convention; coercers are the shared ones so empty
// form strings collapse to null identically everywhere.

// --- Enums (mirror the DB CHECK constraints in 0017) -------------------------

export const priceVisibilities = ["show", "on_request", "hidden"] as const;
export const priceVisibility = z.enum(priceVisibilities);
export type PriceVisibility = (typeof priceVisibilities)[number];

export const PRICE_VISIBILITY_LABELS: Record<PriceVisibility, string> = {
  show: "Show price",
  on_request: "Price on request",
  hidden: "Hide price entirely",
};

export const roomStatuses = ["draft", "published", "closed"] as const;
export const roomStatus = z.enum(roomStatuses);
export type RoomStatus = (typeof roomStatuses)[number];

// Full event vocabulary matches the DB CHECK. M1 fires only room_open + work_view
// (client beacon); the rest (work_dwell/work_zoom/image_open/inquiry) land in M1b
// but are accepted here so the schema is the single source of truth for the enum.
export const roomEventTypes = [
  "room_open",
  "work_view",
  "work_dwell",
  "work_zoom",
  "image_open",
  "inquiry",
] as const;
export const roomEventType = z.enum(roomEventTypes);
export type RoomEventType = (typeof roomEventTypes)[number];

// --- Write schemas -----------------------------------------------------------

// Create / edit a room's presentation metadata.
export const roomSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  intro_note: optionalText,
  price_visibility: priceVisibility.default("on_request"),
  status: roomStatus.default("draft"),
});
export type RoomFormInput = z.input<typeof roomSchema>;
export type RoomInput = z.output<typeof roomSchema>;

// Add a work to a room (artwork_id) or edit its shown caption.
export const roomWorkSchema = z.object({
  artwork_id: z.string().uuid("Pick a work"),
  caption: optionalText,
});
export type RoomWorkInput = z.output<typeof roomWorkSchema>;

// Mint a recipient link. party_id is REQUIRED (every recipient is a CRM contact —
// the NOT NULL + restrict FK in 0017). expires_at is an optional ISO datetime.
export const recipientSchema = z.object({
  party_id: z.string().uuid("Pick a contact"),
  label: optionalText,
  expires_at: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.string().datetime({ offset: true }).nullable(),
  ),
});
export type RecipientInput = z.output<typeof recipientSchema>;

// The public event beacon payload. Zod-validated on every POST. dwell_ms is bounded
// to 6h so a runaway/forged client can't write an absurd number; message is length-
// capped (inquiry, M1b). artwork_id is optional (null = a room-level event).
export const roomEventSchema = z.object({
  event_type: roomEventType,
  artwork_id: z.string().uuid().nullish(),
  dwell_ms: z.number().int().min(0).max(6 * 60 * 60 * 1000).nullish(),
  message: z.string().trim().min(1).max(4000).nullish(),
});
export type RoomEventInput = z.output<typeof roomEventSchema>;

// --- DB row shapes (read side) -----------------------------------------------

export type RoomRow = {
  id: string;
  title: string;
  intro_note: string | null;
  price_visibility: PriceVisibility;
  status: RoomStatus;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type RecipientRow = {
  id: string;
  room_id: string;
  party_id: string;
  label: string | null;
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  created_at: string;
};

// One row of the room_public_artworks VIEW joined with its slot's position/caption.
// This is the ONLY artwork shape the public route ever sees — no notes/condition/
// cost/location/edition/literature exist on it (the view omits them structurally).
export type RoomPublicWork = {
  id: string;
  artist_id: string | null;
  title: string;
  year: number | null;
  medium: string | null;
  signature_details: string | null;
  height_in: number | null;
  width_in: number | null;
  depth_in: number | null;
  catalogue_raisonne: string | null;
  provenance_lines: string[];
  price_cents: number | null;
  currency: string;
  status: string;
  primary_image_path: string | null;
  // From the viewing_room_works slot:
  position: number;
  caption: string | null;
};
