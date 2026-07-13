import { Callout, Container, Heading } from "@radix-ui/themes";
import Link from "next/link";
import { fetchAddressOptions } from "../address-options";
import { ArtworkForm } from "../artwork-form";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function NewArtworkPage({
  searchParams,
}: {
  searchParams: Promise<{ artist?: string }>;
}) {
  const { artist: artistParam } = await searchParams;
  const supabase = getSupabaseServer();
  const [{ data: artistsData }, { data: mediaData }, addressOptions] =
    await Promise.all([
      supabase.from("artists").select("id, name").order("name"),
      supabase.from("artworks").select("medium").not("medium", "is", null),
      fetchAddressOptions(supabase),
    ]);
  const artists = artistsData ?? [];
  const mediumSuggestions = uniqueSorted(
    (mediaData ?? []).map((r) => r.medium as string | null).filter((m): m is string => !!m),
  );

  return (
    <Container size="3" py="6">
      <Heading size="7" mb="5">
        New artwork
      </Heading>

      {artists.length === 0 ? (
        <Callout.Root>
          <Callout.Text>
            Add an{" "}
            <Link href="/artists/new" className="text-[var(--ink)] underline">
              artist
            </Link>{" "}
            first — every artwork belongs to one.
          </Callout.Text>
        </Callout.Root>
      ) : (
        <ArtworkForm
          artists={artists}
          hasPrimaryImage={false}
          mediumSuggestions={mediumSuggestions}
          addressOptions={addressOptions}
          defaultArtistId={
            artistParam && artists.some((a) => a.id === artistParam)
              ? artistParam
              : undefined
          }
        />
      )}
    </Container>
  );
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}
