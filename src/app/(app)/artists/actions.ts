"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateArtistBio as runBioGeneration, type BioResult } from "@/lib/artist/bio";
import { formatNationalities } from "@/lib/countries";
import { getServerEnv } from "@/lib/env";
import { artistSchema, deriveSortName, type ArtistInput } from "@/lib/schemas/artist";
import { getSupabaseServer } from "@/lib/supabase/server";

type Result<T> = { data: T } | { error: string };
type SupabaseServer = ReturnType<typeof getSupabaseServer>;

// The `artists` row columns (sort_name filled in, nationalities live in the join).
function artistRow(input: ArtistInput) {
  return {
    name: input.name,
    birth_year: input.birth_year,
    death_year: input.death_year,
    bio: input.bio,
    sort_name: input.sort_name?.trim() || deriveSortName(input.name),
  };
}

// Replace an artist's nationality rows with the ordered list from the form.
async function writeNationalities(
  supabase: SupabaseServer,
  artistId: string,
  codes: string[],
): Promise<string | null> {
  const { error: delError } = await supabase
    .from("artist_nationalities")
    .delete()
    .eq("artist_id", artistId);
  if (delError) return delError.message;

  if (codes.length === 0) return null;

  const rows = codes.map((code, position) => ({ artist_id: artistId, country_code: code, position }));
  const { error: insError } = await supabase.from("artist_nationalities").insert(rows);
  return insError?.message ?? null;
}

export async function createArtist(input: ArtistInput): Promise<Result<{ id: string }>> {
  const parsed = artistSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("artists")
    .insert(artistRow(parsed.data))
    .select("id")
    .single();

  if (error) return { error: error.message };

  const natError = await writeNationalities(supabase, data.id, parsed.data.nationalities);
  if (natError) return { error: natError };

  revalidatePath("/artists");
  return { data };
}

export async function updateArtist(id: string, input: ArtistInput): Promise<Result<{ id: string }>> {
  const parsed = artistSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("artists")
    .update(artistRow(parsed.data))
    .eq("id", id)
    .select("id")
    .single();

  if (error) return { error: error.message };

  const natError = await writeNationalities(supabase, id, parsed.data.nationalities);
  if (natError) return { error: natError };

  revalidatePath("/artists");
  revalidatePath(`/artists/${id}`);
  return { data };
}

// Draft a bio with Claude from the artist's on-screen facts + their inventory.
// The result is returned for review — it is NOT persisted here; the dealer edits
// and saves it via updateArtist, keeping a human in the loop on published copy.
const bioRequestSchema = z.object({
  name: z.string().trim().min(1, "Enter the artist's name first"),
  birth_year: z.number().int().nullable(),
  death_year: z.number().int().nullable(),
  nationalities: z.array(z.string()).default([]),
  artistId: z.string().uuid().nullable().optional(),
});

export type BioRequest = z.input<typeof bioRequestSchema>;

export async function generateArtistBio(input: BioRequest): Promise<Result<BioResult>> {
  const parsed = bioRequestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, birth_year, death_year, nationalities, artistId } = parsed.data;

  const env = getServerEnv();
  if (!env.ANTHROPIC_API_KEY) return { error: "ANTHROPIC_API_KEY is not configured" };

  // Ground the model in the works already in inventory (reduces hallucination and
  // keeps the bio relevant to what she's actually selling).
  let works: { title: string; year: number | null; medium: string | null }[] = [];
  if (artistId) {
    const supabase = getSupabaseServer();
    const { data } = await supabase
      .from("artworks")
      .select("title, year, medium")
      .eq("artist_id", artistId)
      .order("year", { ascending: true })
      .limit(40);
    works = data ?? [];
  }

  const lifeLabel =
    birth_year && death_year
      ? `${birth_year}–${death_year}`
      : birth_year
        ? `b. ${birth_year}`
        : death_year
          ? `d. ${death_year}`
          : "";

  try {
    const result = await runBioGeneration(
      { name, nationalityLabel: formatNationalities(nationalities), lifeLabel, works },
      env.ANTHROPIC_API_KEY,
    );
    return { data: result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Bio generation failed" };
  }
}

export async function deleteArtist(id: string): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  const { error } = await supabase.from("artists").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/artists");
  return { data: { id } };
}
