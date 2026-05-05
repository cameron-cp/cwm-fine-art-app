"use server";

import { revalidatePath } from "next/cache";
import { artistSchema, type ArtistInput } from "@/lib/schemas/artist";
import { getSupabaseServer } from "@/lib/supabase/server";

type Result<T> = { data: T } | { error: string };

export async function createArtist(input: ArtistInput): Promise<Result<{ id: string }>> {
  const parsed = artistSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("artists")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/artists");
  return { data };
}

export async function updateArtist(id: string, input: ArtistInput): Promise<Result<{ id: string }>> {
  const parsed = artistSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("artists")
    .update(parsed.data)
    .eq("id", id)
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/artists");
  revalidatePath(`/artists/${id}`);
  return { data };
}

export async function deleteArtist(id: string): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  const { error } = await supabase.from("artists").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/artists");
  return { data: { id } };
}
