import { Box, Container, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArtworkForm } from "../artwork-form";
import { GenerateTearsheetButton } from "./generate-tearsheet-button";
import type { Artwork } from "@/lib/schemas/artwork";
import { getSupabaseServer } from "@/lib/supabase/server";
import { signedArtworkUrl } from "@/lib/supabase/storage";

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
  ] = await Promise.all([
    supabase.from("artworks").select("*").eq("id", id).maybeSingle(),
    supabase.from("artists").select("id, name").order("name"),
    supabase.from("artworks").select("medium").not("medium", "is", null),
  ]);

  if (error || !artworkData) notFound();
  const artwork = artworkData as Artwork;
  const artists = artistsData ?? [];
  const mediumSuggestions = Array.from(
    new Set(
      (mediaData ?? [])
        .map((r) => r.medium as string | null)
        .filter((m): m is string => !!m),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const previewUrl = await signedArtworkUrl(supabase, artwork.primary_image_path, 3600);

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="start" mb="5" gap="4" wrap="wrap">
        <Box>
          <Text size="2" color="gray">
            <Link href="/artworks" className="hover:underline">
              ← All artworks
            </Link>
          </Text>
          <Heading size="7" mt="1">
            {artwork.title}
          </Heading>
        </Box>
        <GenerateTearsheetButton artworkId={artwork.id} title={artwork.title} />
      </Flex>

      <Flex gap="6" align="start" wrap="wrap">
        <Box style={{ flex: "0 0 280px" }}>
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt={artwork.title}
              width={560}
              height={560}
              className="rounded-3 object-contain w-full h-auto bg-[var(--gray-a2)]"
              unoptimized
            />
          ) : (
            <Box
              className="rounded-3 bg-[var(--gray-a3)] flex items-center justify-center"
              style={{ width: "100%", aspectRatio: "1", minHeight: 280 }}
            >
              <Text color="gray" size="2">
                No image yet
              </Text>
            </Box>
          )}
        </Box>

        <Box style={{ flex: "1 1 380px" }}>
          <ArtworkForm
            artwork={artwork}
            artists={artists}
            hasPrimaryImage={!!artwork.primary_image_path}
            mediumSuggestions={mediumSuggestions}
          />
        </Box>
      </Flex>

      <Separator size="4" my="6" />
    </Container>
  );
}
