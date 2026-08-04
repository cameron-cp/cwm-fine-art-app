"use server";

import { revalidatePath } from "next/cache";
import { artworkPartySchema } from "@/lib/schemas/artwork-party";
import { getSupabaseServer } from "@/lib/supabase/server";

type Result<T> = { data: T } | { error: string };

// Artwork <-> party links, written from the contact page. Granular add/delete
// with no update, matching interests-actions.ts: a correction is delete +
// re-add. History is still recordable on the way in — the form carries both
// interval dates, so "the Hendersons owned it 2001-2009" is one insert.
// Single-table writes, so no RPC (unlike the invoice flow).

export async function linkArtworkToParty(
  partyId: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = artworkPartySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid link" };
  }
  const d = parsed.data;

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("artwork_parties")
    .insert({
      party_id: partyId,
      artwork_id: d.artwork_id,
      role: d.role,
      source: d.source,
      confidence: d.confidence,
      started_on: d.started_on,
      ended_on: d.ended_on,
      notes: d.notes,
    })
    .select("id")
    .single();

  if (error) {
    // artwork_parties_open_uniq — an open link for this (work, party, role)
    // already exists. Surface the rule, not the raw constraint name.
    if (error.code === "23505") {
      return { error: "This contact already has an open link to that work in that role." };
    }
    return { error: error.message };
  }

  revalidatePath(`/contacts/${partyId}`);
  revalidatePath(`/artworks/${d.artwork_id}`);
  return { data };
}

export async function unlinkArtworkFromParty(
  id: string,
  partyId: string,
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  // Read the work first so the delete can revalidate the same two paths the
  // insert does. Without it the artwork page would go stale the moment it grows
  // a parties section.
  const { data: existing } = await supabase
    .from("artwork_parties")
    .select("artwork_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("artwork_parties").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/contacts/${partyId}`);
  if (existing?.artwork_id) revalidatePath(`/artworks/${existing.artwork_id}`);
  return { data: { id } };
}
