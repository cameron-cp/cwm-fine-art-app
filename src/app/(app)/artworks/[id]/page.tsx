import { Box, Container, Flex, Heading, Separator } from "@radix-ui/themes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchAddressOptions } from "../address-options";
import { ArtworkForm } from "../artwork-form";
import { ConditionReports, type ConditionReportWithUrl } from "./condition-reports";
import { GenerateTearsheetButton } from "./generate-tearsheet-button";
import { ImageManager, type ManagedImage } from "./image-manager";
import type { Artwork, ArtworkImage } from "@/lib/schemas/artwork";
import type { ConditionReport } from "@/lib/schemas/condition-report";
import { getSupabaseServer } from "@/lib/supabase/server";
import { signedArtworkUrls } from "@/lib/supabase/storage";

// Condition-report parsing runs an Anthropic (Opus) call inside a server action
// invoked from this route; give it headroom over the default serverless timeout.
export const maxDuration = 60;

export default async function EditArtworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServer();

  const [
    { data: artworkData, error },
    { data: artistsData },
    { data: mediaData },
    { data: imagesData },
    { data: reportsData },
    addressOptions,
  ] = await Promise.all([
    supabase.from("artworks").select("*").eq("id", id).maybeSingle(),
    supabase.from("artists").select("id, name").order("name"),
    supabase.from("artworks").select("medium").not("medium", "is", null),
    supabase
      .from("artwork_images")
      .select("id, storage_path, position")
      .eq("artwork_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("condition_reports")
      .select("*")
      .eq("artwork_id", id)
      .order("created_at", { ascending: false }),
    fetchAddressOptions(supabase),
  ]);

  if (error || !artworkData) notFound();
  const artwork = artworkData as Artwork;
  const artists = artistsData ?? [];
  const images = (imagesData ?? []) as Pick<
    ArtworkImage,
    "id" | "storage_path" | "position"
  >[];
  const reports = (reportsData ?? []) as ConditionReport[];

  const mediumSuggestions = Array.from(
    new Set(
      (mediaData ?? [])
        .map((r) => r.medium as string | null)
        .filter((m): m is string => !!m),
    ),
  ).sort((a, b) => a.localeCompare(b));

  // Sign every storage path we need in one round trip.
  const allPaths = [
    ...images.map((i) => i.storage_path),
    ...reports.map((r) => r.storage_path),
  ];
  const signed = await signedArtworkUrls(supabase, allPaths, 3600);

  const managedImages: ManagedImage[] = images.map((i) => ({
    id: i.id,
    storage_path: i.storage_path,
    url: signed[i.storage_path] ?? null,
  }));

  const reportsWithUrls: ConditionReportWithUrl[] = reports.map((r) => ({
    ...r,
    url: signed[r.storage_path] ?? null,
  }));

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="start" mb="5" gap="4" wrap="wrap">
        <Box>
          <Link
            href="/artworks"
            className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)] hover:text-[var(--ink)]"
          >
            ← All artworks
          </Link>
          <Heading size="8" weight="medium" mt="2">
            {artwork.title}
          </Heading>
        </Box>
        <GenerateTearsheetButton artworkId={artwork.id} title={artwork.title} />
      </Flex>

      <Flex gap="6" align="start" wrap="wrap">
        <Box style={{ flex: "1 1 320px", minWidth: 300 }}>
          <ImageManager
            artworkId={artwork.id}
            images={managedImages}
            primaryPath={artwork.primary_image_path ?? null}
          />
        </Box>

        <Box style={{ flex: "1 1 380px" }}>
          <ArtworkForm
            artwork={artwork}
            artists={artists}
            hasPrimaryImage={!!artwork.primary_image_path}
            mediumSuggestions={mediumSuggestions}
            addressOptions={addressOptions}
          />
        </Box>
      </Flex>

      <Separator size="4" my="6" />

      <ConditionReports artworkId={artwork.id} reports={reportsWithUrls} />
    </Container>
  );
}
