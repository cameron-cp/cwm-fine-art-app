import { Box, Button, Container, Flex, Grid, Heading, Separator, Text } from "@radix-ui/themes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArtistForm } from "../artist-form";
import { ArtworkCard, type ArtworkCardData } from "../../artworks/artwork-card";
import { formatNationalities } from "@/lib/countries";
import type { Artist } from "@/lib/schemas/artist";
import type { ArtworkStatus } from "@/lib/schemas/artwork";
import { getSupabaseServer } from "@/lib/supabase/server";
import { signedArtworkUrls } from "@/lib/supabase/storage";

type WorkRow = {
  id: string;
  title: string;
  year: number | null;
  medium: string | null;
  status: ArtworkStatus;
  price_cents: number | null;
  currency: string;
  primary_image_path: string | null;
};

export default async function EditArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServer();

  const [{ data, error }, { data: worksData }] = await Promise.all([
    supabase
      .from("artists")
      .select("*, artist_nationalities(country_code, position)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("artworks")
      .select("id, title, year, medium, status, price_cents, currency, primary_image_path")
      .eq("artist_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (error || !data) notFound();
  const natRows = ((data.artist_nationalities ?? []) as { country_code: string; position: number }[])
    .sort((a, b) => a.position - b.position);
  const nationalities = natRows.map((r) => r.country_code);
  const artist = { ...data, nationalities } as Artist;
  const works = (worksData ?? []) as WorkRow[];

  const paths = works.map((w) => w.primary_image_path).filter((p): p is string => !!p);
  const signed = await signedArtworkUrls(supabase, paths, 3600);

  const cards: ArtworkCardData[] = works.map((w) => ({
    id: w.id,
    title: w.title,
    year: w.year,
    medium: w.medium,
    status: w.status,
    price_cents: w.price_cents,
    currency: w.currency,
    imageUrl: w.primary_image_path ? signed[w.primary_image_path] ?? null : null,
  }));

  return (
    <Container size="4" py="6">
      <Box mb="5">
        <Text size="2" color="gray">
          <Link href="/artists" className="hover:underline">
            ← All artists
          </Link>
        </Text>
        <Heading size="7" mt="1">
          {artist.name}
        </Heading>
        <Text size="2" color="gray">
          {formatByline(formatNationalities(nationalities), artist.birth_year, artist.death_year)}
        </Text>
      </Box>

      <ArtistForm artist={artist} />

      <Separator size="4" my="6" />

      <Flex justify="between" align="center" mb="4">
        <Heading size="5">
          Works{" "}
          <Text size="3" color="gray" weight="regular">
            ({works.length})
          </Text>
        </Heading>
        <Button asChild>
          <Link href={`/artworks/new?artist=${artist.id}`}>Add artwork</Link>
        </Button>
      </Flex>

      {cards.length === 0 ? (
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap="3"
          py="8"
          className="border border-dashed border-[var(--gray-a6)] rounded-3"
        >
          <Text color="gray">No works for this artist yet.</Text>
          <Button asChild variant="soft">
            <Link href={`/artworks/new?artist=${artist.id}`}>Add the first work</Link>
          </Button>
        </Flex>
      ) : (
        <Grid columns={{ initial: "1", xs: "2", md: "3" }} gap="4">
          {cards.map((c) => (
            <ArtworkCard key={c.id} artwork={c} />
          ))}
        </Grid>
      )}
    </Container>
  );
}

// "American, 1913–1980" — the standard art-world byline.
function formatByline(nationality: string, birth: number | null, death: number | null): string {
  const years =
    birth && death ? `${birth}–${death}` : birth ? `b. ${birth}` : death ? `d. ${death}` : "";
  return [nationality, years].filter(Boolean).join(", ");
}
