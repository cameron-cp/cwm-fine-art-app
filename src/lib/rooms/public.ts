import type { SupabaseClient } from "@supabase/supabase-js";
import { formatNationalities } from "@/lib/countries";
import { formatDimensions } from "@/lib/dimensions";
import { signedArtworkUrls } from "@/lib/supabase/storage";
import type { RecipientRow, RoomPublicWork } from "@/lib/schemas/viewing-room";

// The public (logged-out) read path for a viewing room. Everything here runs
// through the service-role render client and reads artwork fields ONLY from the
// room_public_artworks VIEW — never artworks.* — so no sensitive column
// (notes / condition / cost / location / edition / literature) or tracked work can
// ever reach a collector. Batch-signs images in ONE call (the invoice-render
// precedent), not per work.

export type RoomWorkView = RoomPublicWork & {
  artist_name: string;
  artist_byline: string; // "American, 1912–1956"
  dimensions: string | null;
  image_url: string | null;
};

// Resolve an opaque token to its recipient row (or null if unknown). Validity
// (revoked/expired) is checked by the caller via checkRecipientToken so the same
// rule covers the page render and every event write.
export async function resolveRecipient(
  supabase: SupabaseClient,
  token: string,
): Promise<RecipientRow | null> {
  const { data } = await supabase
    .from("viewing_room_recipients")
    .select(
      "id, room_id, party_id, label, token, expires_at, revoked_at, first_viewed_at, last_viewed_at, created_at",
    )
    .eq("token", token)
    .maybeSingle();
  return (data as RecipientRow | null) ?? null;
}

function bylineFor(artist: {
  birth_year: number | null;
  death_year: number | null;
  artist_nationalities?: { country_code: string; position: number }[] | null;
}): string {
  const nationality = formatNationalities(
    [...(artist.artist_nationalities ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((n) => n.country_code),
  );
  const years =
    artist.birth_year && artist.death_year
      ? `${artist.birth_year}–${artist.death_year}`
      : artist.birth_year
        ? `b. ${artist.birth_year}`
        : artist.death_year
          ? `d. ${artist.death_year}`
          : "";
  return [nationality, years].filter(Boolean).join(", ");
}

// Load a room's ordered works as the collector sees them: from the VIEW, joined to
// each slot's position + caption, enriched with artist name/byline + a signed image
// URL. Works whose id is absent from the view (e.g. a work later flipped to
// 'tracked', or deleted) are dropped — defense in depth atop the DB trigger.
export async function loadRoomWorks(
  supabase: SupabaseClient,
  roomId: string,
  opts: { signImages: boolean } = { signImages: true },
): Promise<RoomWorkView[]> {
  const { data: slots } = await supabase
    .from("viewing_room_works")
    .select("artwork_id, position, caption")
    .eq("room_id", roomId)
    .order("position", { ascending: true });
  const slotRows = (slots ?? []) as {
    artwork_id: string;
    position: number;
    caption: string | null;
  }[];
  if (slotRows.length === 0) return [];

  const ids = slotRows.map((s) => s.artwork_id);

  // The whitelist boundary: SELECT from the view, not artworks.
  const { data: pub } = await supabase
    .from("room_public_artworks")
    .select("*")
    .in("id", ids);
  const pubById = new Map<string, RoomPublicWork>(
    ((pub ?? []) as RoomPublicWork[]).map((w) => [w.id, w]),
  );

  const artistIds = Array.from(
    new Set(
      ((pub ?? []) as RoomPublicWork[])
        .map((w) => w.artist_id)
        .filter((x): x is string => !!x),
    ),
  );
  const artistById = new Map<
    string,
    {
      name: string;
      birth_year: number | null;
      death_year: number | null;
      artist_nationalities: { country_code: string; position: number }[];
    }
  >();
  if (artistIds.length) {
    const { data: artists } = await supabase
      .from("artists")
      .select("id, name, birth_year, death_year, artist_nationalities(country_code, position)")
      .in("id", artistIds);
    for (const a of artists ?? []) {
      artistById.set(a.id as string, a as never);
    }
  }

  let signed: Record<string, string> = {};
  if (opts.signImages) {
    const paths = ((pub ?? []) as RoomPublicWork[])
      .map((w) => w.primary_image_path)
      .filter((p): p is string => !!p);
    signed = await signedArtworkUrls(supabase, paths, 600);
  }

  const out: RoomWorkView[] = [];
  for (const slot of slotRows) {
    const w = pubById.get(slot.artwork_id);
    if (!w) continue; // absent from view → tracked/deleted → never render
    const artist = w.artist_id ? artistById.get(w.artist_id) : undefined;
    out.push({
      ...w,
      position: slot.position,
      caption: slot.caption,
      artist_name: artist?.name ?? "Unknown artist",
      artist_byline: artist ? bylineFor(artist) : "",
      dimensions: formatDimensions(w.height_in, w.width_in, w.depth_in),
      image_url: w.primary_image_path ? (signed[w.primary_image_path] ?? null) : null,
    });
  }
  return out;
}

// Resolve how a price renders under the room's visibility setting.
// 'show' → the formatted price; 'on_request' → the phrase; 'hidden' → null.
export function resolveRoomPrice(
  visibility: "show" | "on_request" | "hidden",
  formattedPrice: string | null,
): string | null {
  if (visibility === "hidden") return null;
  if (visibility === "on_request") return "Price on request";
  return formattedPrice; // 'show'
}
