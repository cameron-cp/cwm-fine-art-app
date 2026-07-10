"use server";

import { revalidatePath } from "next/cache";
import { extractConditionReport } from "@/lib/condition/anthropic";
import { getServerEnv } from "@/lib/env";
import { artworkSchema, type ArtworkInput } from "@/lib/schemas/artwork";
import { getSupabaseServer } from "@/lib/supabase/server";

type Result<T> = { data: T } | { error: string };

const BUCKET = "artworks";

// DB-shaped row: provenance_lines is text[] in postgres. primary_image_path is
// intentionally NOT written here — it's owned exclusively by the image actions
// (recordArtworkImage / setPrimaryImage / deleteArtworkImage). Writing it from
// the content form would clobber an independently-changed hero on the next save.
type ArtworkDbRow = Omit<ArtworkInput, "provenance_lines" | "primary_image_path"> & {
  provenance_lines: string[];
};

function toDbRow(input: ArtworkInput): ArtworkDbRow {
  // Strip primary_image_path via rest-omit so it never reaches the DB write.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { provenance_lines, primary_image_path, ...rest } = input;
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
  revalidatePath(`/artists/${parsed.data.artist_id}`);
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

  const [{ data: images }, { data: reports }] = await Promise.all([
    supabase.from("artwork_images").select("storage_path").eq("artwork_id", id),
    supabase.from("condition_reports").select("storage_path").eq("artwork_id", id),
  ]);

  const paths = [
    ...(images ?? []).map((i) => i.storage_path),
    ...(reports ?? []).map((r) => r.storage_path),
  ];
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

  // Use max(position)+1, not count: a prior delete leaves gaps, so count would
  // collide with an existing position and make .order("position") ambiguous.
  const { data: last } = await supabase
    .from("artwork_images")
    .select("position")
    .eq("artwork_id", artworkId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = last ? last.position + 1 : 0;

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

// --- Image gallery management -------------------------------------------------

// Promote an existing image to the tearsheet hero (denormalized onto artworks).
export async function setPrimaryImage(
  artworkId: string,
  storagePath: string,
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  const { error } = await supabase
    .from("artworks")
    .update({ primary_image_path: storagePath })
    .eq("id", artworkId);
  if (error) return { error: error.message };
  revalidatePath(`/artworks/${artworkId}`);
  return { data: { id: artworkId } };
}

// Delete one image: remove the storage object, the row, and — if it was the
// hero — repoint primary_image_path to the next remaining image (or null).
export async function deleteArtworkImage(
  artworkId: string,
  imageId: string,
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();

  const { data: image, error: fetchErr } = await supabase
    .from("artwork_images")
    .select("storage_path")
    .eq("id", imageId)
    .eq("artwork_id", artworkId)
    .maybeSingle();
  if (fetchErr) return { error: fetchErr.message };
  if (!image) return { error: "Image not found" };

  const { error: delErr } = await supabase
    .from("artwork_images")
    .delete()
    .eq("id", imageId);
  if (delErr) return { error: delErr.message };

  await supabase.storage.from(BUCKET).remove([image.storage_path]);

  // If we just removed the hero, promote the next remaining image by position.
  const { data: artwork } = await supabase
    .from("artworks")
    .select("primary_image_path")
    .eq("id", artworkId)
    .maybeSingle();

  if (artwork?.primary_image_path === image.storage_path) {
    const { data: next } = await supabase
      .from("artwork_images")
      .select("storage_path")
      .eq("artwork_id", artworkId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    const { error: updErr } = await supabase
      .from("artworks")
      .update({ primary_image_path: next?.storage_path ?? null })
      .eq("id", artworkId);
    if (updErr) return { error: updErr.message };
  }

  revalidatePath(`/artworks/${artworkId}`);
  return { data: { id: imageId } };
}

// Persist a new ordering. `orderedImageIds` is the full set of this artwork's
// image ids in the desired order; position becomes the array index.
export async function reorderArtworkImages(
  artworkId: string,
  orderedImageIds: string[],
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  for (let i = 0; i < orderedImageIds.length; i++) {
    const { error } = await supabase
      .from("artwork_images")
      .update({ position: i })
      .eq("id", orderedImageIds[i])
      .eq("artwork_id", artworkId);
    if (error) return { error: error.message };
  }
  revalidatePath(`/artworks/${artworkId}`);
  return { data: { id: artworkId } };
}

// --- Condition reports --------------------------------------------------------

// Best-effort AI parse of a stored condition-report file. Never throws: on any
// failure it records parse_status='failed' so the file stays attached.
async function parseAndStore(reportId: string): Promise<void> {
  const supabase = getSupabaseServer();

  const { data: report } = await supabase
    .from("condition_reports")
    .select("storage_path, mime_type")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return;

  const fail = async (message: string) => {
    await supabase
      .from("condition_reports")
      .update({ parse_status: "failed", parse_error: message })
      .eq("id", reportId);
  };

  const env = getServerEnv();
  if (!env.ANTHROPIC_API_KEY) {
    await fail("ANTHROPIC_API_KEY is not configured");
    return;
  }

  const { data: file, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(report.storage_path);
  if (dlErr || !file) {
    await fail(`Couldn't read the uploaded file: ${dlErr?.message ?? "unknown"}`);
    return;
  }

  try {
    const bytes = await file.arrayBuffer();
    const parsed = await extractConditionReport(
      bytes,
      report.mime_type,
      env.ANTHROPIC_API_KEY,
    );
    await supabase
      .from("condition_reports")
      .update({ parse_status: "parsed", parse_error: null, parsed })
      .eq("id", reportId);
  } catch (e) {
    await fail(e instanceof Error ? e.message : "Parsing failed");
  }
}

// Attach an already-uploaded file (browser uploaded to storage) and parse it.
export async function addConditionReport(
  artworkId: string,
  storagePath: string,
  fileName: string,
  mimeType: string,
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("condition_reports")
    .insert({
      artwork_id: artworkId,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      parse_status: "pending",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await parseAndStore(data.id);
  revalidatePath(`/artworks/${artworkId}`);
  return { data };
}

export async function reparseConditionReport(
  artworkId: string,
  reportId: string,
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  const { error } = await supabase
    .from("condition_reports")
    .update({ parse_status: "pending", parse_error: null })
    .eq("id", reportId);
  if (error) return { error: error.message };

  await parseAndStore(reportId);
  revalidatePath(`/artworks/${artworkId}`);
  return { data: { id: reportId } };
}

export async function deleteConditionReport(
  artworkId: string,
  reportId: string,
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();

  const { data: report } = await supabase
    .from("condition_reports")
    .select("storage_path")
    .eq("id", reportId)
    .eq("artwork_id", artworkId)
    .maybeSingle();

  const { error } = await supabase
    .from("condition_reports")
    .delete()
    .eq("id", reportId);
  if (error) return { error: error.message };

  if (report?.storage_path) {
    await supabase.storage.from(BUCKET).remove([report.storage_path]);
  }

  revalidatePath(`/artworks/${artworkId}`);
  return { data: { id: reportId } };
}
