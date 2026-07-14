import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoomTracker } from "./room-tracker";
import { GALLERY_NAME } from "@/lib/brand";
import { checkRecipientToken } from "@/lib/rooms/token";
import { throttleToken } from "@/lib/rooms/throttle";
import { loadRoomWorks, resolveRecipient, resolveRoomPrice, type RoomWorkView } from "@/lib/rooms/public";
import type { RoomRow } from "@/lib/schemas/viewing-room";
import { getRenderServiceClient } from "@/lib/supabase/render-client";
import { formatPriceCents } from "@/lib/supabase/storage";
import "./room.css";

export const dynamic = "force-dynamic";

// A viewing room is private, per-recipient content: never index it, even if a
// token leaks to a crawler. Paired with the X-Robots-Tag header (next.config.ts).
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function ViewingRoomPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = getRenderServiceClient();

  // 1. Resolve + validate the capability token. Unknown / revoked / expired all
  //    look identical to a collector: a 404 (no oracle for which links exist).
  const recipient = await resolveRecipient(supabase, token);
  if (!recipient) notFound();
  if (!checkRecipientToken(recipient).ok) notFound();

  // 2. Per-token throttle on the page GET too — it issues signed URLs + does
  //    service-role reads. Over the limit → a quiet holding page, no heavy work.
  if (!throttleToken(token).ok) {
    return (
      <main className="vr-shell">
        <p className="vr-note">One moment — please refresh shortly.</p>
      </main>
    );
  }

  // 3. Load room + works. Works come from the room_public_artworks VIEW only.
  const { data: roomData } = await supabase
    .from("viewing_rooms")
    .select("id, title, intro_note, price_visibility, status, created_at, updated_at, published_at")
    .eq("id", recipient.room_id)
    .maybeSingle();
  if (!roomData) notFound();
  const room = roomData as RoomRow;

  const works = await loadRoomWorks(supabase, room.id, { signImages: true });

  return (
    <main className="vr-shell">
      <RoomTracker token={token} />

      <header className="vr-header">
        <div className="vr-gallery">{GALLERY_NAME}</div>
        <h1 className="vr-title">{room.title}</h1>
        {room.intro_note && <p className="vr-intro">{room.intro_note}</p>}
      </header>

      {works.length === 0 ? (
        <p className="vr-note">This viewing room is being prepared.</p>
      ) : (
        <div className="vr-works">
          {works.map((w) => (
            <Work key={w.id} work={w} priceVisibility={room.price_visibility} />
          ))}
        </div>
      )}

      <footer className="vr-footer">{GALLERY_NAME}</footer>
    </main>
  );
}

function Work({
  work,
  priceVisibility,
}: {
  work: RoomWorkView;
  priceVisibility: RoomRow["price_visibility"];
}) {
  const isSold = work.status === "sold";
  const price = resolveRoomPrice(
    priceVisibility,
    formatPriceCents(work.price_cents, work.currency),
  );
  // medium · dimensions · edition — the letterspaced uppercase caption line.
  const specLine = [work.medium, work.dimensions].filter(Boolean).join(" · ");

  return (
    <figure className="vr-work" data-artwork-id={work.id}>
      <div className="vr-frame">
        {work.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={work.image_url} alt={work.title} className="vr-image" />
        ) : (
          <div className="vr-image-empty">No image</div>
        )}
      </div>

      <figcaption className="vr-label">
        <div className="vr-artist">{work.artist_name}</div>
        {work.artist_byline && <div className="vr-byline num">{work.artist_byline}</div>}
        <div className="vr-worktitle">
          <em>{work.title}</em>
          {work.year ? <>, {work.year}</> : null}
        </div>
        {specLine && <div className="vr-spec">{specLine}</div>}
        {work.caption && <p className="vr-caption">{work.caption}</p>}
        <div className="vr-meta">
          {isSold ? (
            <span className="vr-status vr-sold">
              <span className="vr-dot" />
              Sold
            </span>
          ) : (
            price && <span className="vr-price num">{price}</span>
          )}
        </div>
      </figcaption>
    </figure>
  );
}
