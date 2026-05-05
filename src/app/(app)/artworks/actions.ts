"use server";

import { revalidatePath } from "next/cache";
import { artworkSchema, type ArtworkInput } from "@/lib/schemas/artwork";
import { getSupabaseServer } from "@/lib/supabase/server";

type Result<T> = { data: T } | { error: string };

// DB-shaped row: provenance_lines is text[] in postgres.
type ArtworkDbRow = Omit<ArtworkInput, "provenance_lines"> & {
  provenance_lines: string[];
};

function toDbRow(input: ArtworkInput): ArtworkDbRow {
  const { provenance_lines, ...rest } = input;
  return {
    ...rest,
    provenance_lines: provenance_lines.map((p) => p.value),
  };
}

export async function createArtwork(input: ArtworkInput): Promise<Result<{ id: string }>> {
  const parsed = artworkSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("artworks")
    .insert(toDbRow(parsed.data))
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/artworks");
  return { data };
}

export async function updateArtwork(id: string, input: ArtworkInput): Promise<Result<{ id: string }>> {
  const parsed = artworkSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("artworks")
    .update(toDbRow(parsed.data))
    .eq("id", id)
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/artworks");
  revalidatePath(`/artworks/${id}`);
  return { data };
}

export async function deleteArtwork(id: string): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();

  const { data: images } = await supabase
    .from("artwork_images")
    .select("storage_path")
    .eq("artwork_id", id);

  const paths = (images ?? []).map((i) => i.storage_path);
  if (paths.length > 0) {
    await supabase.storage.from("artworks").remove(paths);
  }

  const { error } = await supabase.from("artworks").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/artworks");
  return { data: { id } };
}

export async function recordArtworkImage(
  artworkId: string,
  storagePath: string,
  setAsPrimary: boolean,
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();

  const { count } = await supabase
    .from("artwork_images")
    .select("id", { count: "exact", head: true })
    .eq("artwork_id", artworkId);

  const position = count ?? 0;

  const { data, error } = await supabase
    .from("artwork_images")
    .insert({ artwork_id: artworkId, storage_path: storagePath, position })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (setAsPrimary) {
    const { error: updErr } = await supabase
      .from("artworks")
      .update({ primary_image_path: storagePath })
      .eq("id", artworkId);
    if (updErr) return { error: updErr.message };
  }

  revalidatePath(`/artworks/${artworkId}`);
  return { data };
}
