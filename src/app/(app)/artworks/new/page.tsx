import { Callout, Container, Heading } from "@radix-ui/themes";
import Link from "next/link";
import { ArtworkForm } from "../artwork-form";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function NewArtworkPage() {
  const supabase = getSupabaseServer();
  const [{ data: artistsData }, { data: mediaData }] = await Promise.all([
    supabase.from("artists").select("id, name").order("name"),
    supabase.from("artworks").select("medium").not("medium", "is", null),
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
            <Link href="/artists/new" className="text-[var(--accent-11)] underline">
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
        />
      )}
    </Container>
  );
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}
