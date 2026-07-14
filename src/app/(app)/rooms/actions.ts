"use server";

import { revalidatePath } from "next/cache";
import { publicEnv, getServerEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { renderPdfBytesViaBrowserless } from "@/lib/pdf/browserless";
import { buildInviteEmail } from "@/lib/rooms/invite-email";
import { generateRoomToken } from "@/lib/rooms/token";
import {
  recipientSchema,
  roomSchema,
  roomWorkSchema,
} from "@/lib/schemas/viewing-room";
import { getSupabaseServer } from "@/lib/supabase/server";

type Result<T> = { data: T } | { error: string };

// --- Rooms -------------------------------------------------------------------

export async function createRoom(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = roomSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid room" };

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("viewing_rooms")
    .insert({
      title: parsed.data.title,
      intro_note: parsed.data.intro_note,
      price_visibility: parsed.data.price_visibility,
      status: parsed.data.status,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/rooms");
  return { data };
}

// Presentation settings + status. Stamps published_at the first time a room is
// published (never clears it — closing a room keeps its publish history).
export async function setRoomSettings(
  id: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = roomSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid room" };

  const supabase = getSupabaseServer();
  const { data: existing } = await supabase
    .from("viewing_rooms")
    .select("published_at")
    .eq("id", id)
    .maybeSingle();

  const nowPublishing =
    parsed.data.status === "published" && !existing?.published_at;

  const { error } = await supabase
    .from("viewing_rooms")
    .update({
      title: parsed.data.title,
      intro_note: parsed.data.intro_note,
      price_visibility: parsed.data.price_visibility,
      status: parsed.data.status,
      ...(nowPublishing ? { published_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/rooms");
  revalidatePath(`/rooms/${id}`);
  return { data: { id } };
}

export async function deleteRoom(id: string): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  const { error } = await supabase.from("viewing_rooms").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/rooms");
  return { data: { id } };
}

// --- Works (the curated selection) ------------------------------------------

export async function addWorkToRoom(
  roomId: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = roomWorkSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid work" };

  const supabase = getSupabaseServer();

  // Append at the end. max(position)+1, tolerant of gaps from prior removals.
  const { data: last } = await supabase
    .from("viewing_room_works")
    .select("position")
    .eq("room_id", roomId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = last ? last.position + 1 : 0;

  const { data, error } = await supabase
    .from("viewing_room_works")
    .insert({
      room_id: roomId,
      artwork_id: parsed.data.artwork_id,
      caption: parsed.data.caption,
      position,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "That work is already in this room." };
    // 23514 = the inventory-only trigger (a 'tracked' market work).
    if (error.code === "23514" || /inventory works/.test(error.message)) {
      return { error: "Only inventory works can be added to a viewing room." };
    }
    return { error: error.message };
  }

  revalidatePath(`/rooms/${roomId}`);
  return { data };
}

export async function removeWork(
  roomWorkId: string,
  roomId: string,
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  const { error } = await supabase
    .from("viewing_room_works")
    .delete()
    .eq("id", roomWorkId);
  if (error) return { error: error.message };
  revalidatePath(`/rooms/${roomId}`);
  return { data: { id: roomWorkId } };
}

export async function setWorkCaption(
  roomWorkId: string,
  roomId: string,
  caption: string | null,
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  const clean = caption && caption.trim() !== "" ? caption.trim() : null;
  const { error } = await supabase
    .from("viewing_room_works")
    .update({ caption: clean })
    .eq("id", roomWorkId);
  if (error) return { error: error.message };
  revalidatePath(`/rooms/${roomId}`);
  return { data: { id: roomWorkId } };
}

export async function reorderWorks(
  roomId: string,
  orderedRoomWorkIds: string[],
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  for (let i = 0; i < orderedRoomWorkIds.length; i++) {
    const { error } = await supabase
      .from("viewing_room_works")
      .update({ position: i })
      .eq("id", orderedRoomWorkIds[i])
      .eq("room_id", roomId);
    if (error) return { error: error.message };
  }
  revalidatePath(`/rooms/${roomId}`);
  return { data: { id: roomId } };
}

// --- Recipients (per-collector tokenized links) -----------------------------

export async function generateRecipient(
  roomId: string,
  input: unknown,
): Promise<Result<{ id: string; token: string }>> {
  const parsed = recipientSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid recipient" };

  const supabase = getSupabaseServer();
  const token = generateRoomToken();
  const { data, error } = await supabase
    .from("viewing_room_recipients")
    .insert({
      room_id: roomId,
      party_id: parsed.data.party_id,
      label: parsed.data.label,
      token,
      expires_at: parsed.data.expires_at,
    })
    .select("id, token")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/rooms/${roomId}`);
  return { data };
}

export async function revokeRecipient(
  recipientId: string,
  roomId: string,
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  const { error } = await supabase
    .from("viewing_room_recipients")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", recipientId)
    .is("revoked_at", null); // idempotent: keep the first revocation time
  if (error) return { error: error.message };
  revalidatePath(`/rooms/${roomId}`);
  return { data: { id: recipientId } };
}

// --- Invite email (first real sendEmail caller) ------------------------------

// Sends the room link to the recipient's CRM contact email. Attaches the PDF
// leave-behind when Browserless + the render secret are configured; otherwise
// sends link-only (best-effort — a PDF failure must not block the invite).
export async function sendInvite(
  recipientId: string,
): Promise<Result<{ id: string }>> {
  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return { error: "NEXT_PUBLIC_APP_URL is not configured." };

  const supabase = getSupabaseServer();
  const { data: recipient } = await supabase
    .from("viewing_room_recipients")
    .select("id, token, room_id, revoked_at, party:parties(display_name, email)")
    .eq("id", recipientId)
    .maybeSingle();
  if (!recipient) return { error: "Recipient not found." };
  if (recipient.revoked_at) return { error: "This link has been revoked." };

  const party = Array.isArray(recipient.party) ? recipient.party[0] : recipient.party;
  const toEmail = party?.email as string | undefined;
  if (!toEmail) return { error: "This contact has no email address on file." };

  const { data: room } = await supabase
    .from("viewing_rooms")
    .select("title, intro_note")
    .eq("id", recipient.room_id)
    .maybeSingle();
  if (!room) return { error: "Room not found." };

  const link = `${appUrl}/room/${recipient.token}`;

  // Best-effort PDF attachment.
  let pdf: { filename: string; bytes: Uint8Array<ArrayBuffer> } | null = null;
  const env = getServerEnv();
  if (env.VIEWING_ROOM_RENDER_SECRET && env.BROWSERLESS_API_KEY) {
    const renderUrl = `${appUrl}/room/render/${recipient.room_id}?token=${encodeURIComponent(
      env.VIEWING_ROOM_RENDER_SECRET,
    )}`;
    const res = await renderPdfBytesViaBrowserless({ renderUrl });
    if ("data" in res) {
      pdf = { filename: "viewing-room.pdf", bytes: res.data };
    }
  }

  const result = await sendEmail(
    buildInviteEmail({
      toEmail,
      toName: (party?.display_name as string | undefined) ?? null,
      roomTitle: room.title as string,
      introNote: (room.intro_note as string | undefined) ?? null,
      link,
      pdf,
    }),
  );
  if ("error" in result) return { error: result.error };

  revalidatePath(`/rooms/${recipient.room_id}`);
  return { data: { id: recipientId } };
}
