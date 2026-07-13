"use server";

import { revalidatePath } from "next/cache";
import { interestSchema } from "@/lib/schemas/interest";
import { getSupabaseServer } from "@/lib/supabase/server";

type Result<T> = { data: T } | { error: string };

// Collector interests accrete one at a time across many conversations, so the
// write surface is granular add/delete (no bulk save, no update — a correction is
// delete + re-add). Single-table writes, so no RPC (unlike the invoice flow).

export async function addInterest(
  partyId: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = interestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid interest" };
  }
  const d = parsed.data;

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("collector_interests")
    .insert({
      party_id: partyId,
      dimension: d.dimension,
      sentiment: d.sentiment,
      source: d.source,
      confidence: d.confidence,
      artist_id: d.artist_id,
      value: d.value,
      price_min_cents: d.price_min_cents,
      price_max_cents: d.price_max_cents,
      qualifier: d.qualifier,
    })
    .select("id")
    .single();

  if (error) {
    // Unique partial index (party, artist|value, sentiment) — a true same-sentiment
    // duplicate. Surface a friendly message, not the raw Postgres constraint text.
    if (error.code === "23505") {
      return { error: "That interest is already recorded." };
    }
    return { error: error.message };
  }

  revalidatePath(`/contacts/${partyId}`);
  return { data };
}

export async function deleteInterest(
  id: string,
  partyId: string,
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  const { error } = await supabase
    .from("collector_interests")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/contacts/${partyId}`);
  return { data: { id } };
}
