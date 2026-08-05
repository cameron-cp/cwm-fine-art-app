import { notFound } from "next/navigation";
import { MuseumWallLabel, type WallLabelStatus } from "@/components/museum-wall-label";
import { GALLERY_NAME } from "@/lib/brand";
import { getServerEnv } from "@/lib/env";
import { loadRoomWorks, resolveRoomPrice } from "@/lib/rooms/public";
import { ARTWORK_STATUS_META } from "@/lib/schemas/artwork";
import type { RoomRow } from "@/lib/schemas/viewing-room";
import { getRenderServiceClient } from "@/lib/supabase/render-client";
import { formatPriceCents } from "@/lib/supabase/storage";
import "./room-print.css";

export const dynamic = "force-dynamic";

// The viewing-room PDF leave-behind. Token-gated (VIEWING_ROOM_RENDER_SECRET),
// rendered to PDF by Browserless via /api/rooms/[id]/pdf. One work per page, using
// the SHARED museum-wall-label component + the room_public_artworks whitelist +
// batch image signing — the same public read path as the on-screen room.

// Label + tone come from the shared status meta; widened to Record<string, …>
// because the public view hands back status as plain text.
const STATUS_META: Record<string, WallLabelStatus> = ARTWORK_STATUS_META;

export default async function RoomRenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const env = getServerEnv();
  const expected = env.VIEWING_ROOM_RENDER_SECRET;
  if (!expected) {
    return <div className="render-error">VIEWING_ROOM_RENDER_SECRET is not configured.</div>;
  }
  const { token } = await searchParams;
  if (token !== expected) notFound();

  const { id } = await params;
  const supabase = getRenderServiceClient();

  const { data: roomData } = await supabase
    .from("viewing_rooms")
    .select("id, title, intro_note, price_visibility, status, created_at, updated_at, published_at")
    .eq("id", id)
    .maybeSingle();
  if (!roomData) notFound();
  const room = roomData as RoomRow;

  const works = await loadRoomWorks(supabase, room.id, { signImages: true });

  return (
    <div className="rp-doc">
      <span className="rp-footer-src" aria-hidden="true">
        {GALLERY_NAME} · {room.title}
      </span>

      <section className="rp-cover">
        <div className="rp-gallery">{GALLERY_NAME}</div>
        <h1 className="rp-title">{room.title}</h1>
        {room.intro_note && <p className="rp-intro">{room.intro_note}</p>}
      </section>

      {works.map((w) => {
        const price = resolveRoomPrice(
          room.price_visibility,
          formatPriceCents(w.price_cents, w.currency),
        );
        return (
          <section className="rp-work" key={w.id}>
            <div className="rp-image-wrap">
              {w.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.image_url} alt={w.title} className="rp-image" />
              ) : (
                <div className="rp-image-empty">No image</div>
              )}
            </div>
            {w.caption && <p className="rp-caption">{w.caption}</p>}
            <MuseumWallLabel
              artistName={w.artist_name}
              byline={w.artist_byline}
              title={w.title}
              year={w.year}
              medium={w.medium}
              signatureDetails={w.signature_details}
              dimensions={w.dimensions}
              catalogueRaisonne={w.catalogue_raisonne}
              price={price}
              status={STATUS_META[w.status] ?? null}
            />
          </section>
        );
      })}
    </div>
  );
}
