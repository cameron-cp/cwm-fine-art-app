import { NextResponse } from "next/server";
import { resolveRecipient } from "@/lib/rooms/public";
import { throttleToken } from "@/lib/rooms/throttle";
import { checkRecipientToken } from "@/lib/rooms/token";
import { roomEventSchema } from "@/lib/schemas/viewing-room";
import { getRenderServiceClient } from "@/lib/supabase/render-client";

export const dynamic = "force-dynamic";

// Public (logged-out) engagement write. The ONLY public write path in M1. Every
// guarantee is re-checked on EVERY call — not just at page render — so a stale
// open tab can't keep writing after revocation/expiry:
//   1. per-token throttle          (bounds a forged flood)
//   2. token resolves to a recipient (unknown → 404)
//   3. token still valid            (revoked/expired → 403)
//   4. any posted artwork_id belongs to THIS room (else → 400)
// Writes go through the service-role client, scoped to the resolved recipient.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!throttleToken(token).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = getRenderServiceClient();

  const recipient = await resolveRecipient(supabase, token);
  if (!recipient) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!checkRecipientToken(recipient).ok) {
    return NextResponse.json({ error: "Link no longer active" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = roomEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid event" },
      { status: 400 },
    );
  }
  const evt = parsed.data;

  // A posted artwork_id MUST be one of this room's curated works — never trust the
  // client to name an arbitrary artwork.
  if (evt.artwork_id) {
    const { count } = await supabase
      .from("viewing_room_works")
      .select("id", { count: "exact", head: true })
      .eq("room_id", recipient.room_id)
      .eq("artwork_id", evt.artwork_id);
    if (!count || count === 0) {
      return NextResponse.json(
        { error: "Work is not in this room" },
        { status: 400 },
      );
    }
  }

  const { error } = await supabase.from("viewing_room_events").insert({
    recipient_id: recipient.id,
    room_id: recipient.room_id,
    artwork_id: evt.artwork_id ?? null,
    event_type: evt.event_type,
    dwell_ms: evt.dwell_ms ?? null,
    message: evt.message ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Stamp view timestamps on the recipient: last_viewed_at always; first_viewed_at
  // only the first time (so it records the genuine first open).
  const nowIso = new Date().toISOString();
  await supabase
    .from("viewing_room_recipients")
    .update({
      last_viewed_at: nowIso,
      ...(recipient.first_viewed_at ? {} : { first_viewed_at: nowIso }),
    })
    .eq("id", recipient.id);

  return NextResponse.json({ data: { ok: true } });
}
