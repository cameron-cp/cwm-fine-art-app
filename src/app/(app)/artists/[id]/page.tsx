import { Container, Heading } from "@radix-ui/themes";
import { notFound } from "next/navigation";
import { ArtistForm } from "../artist-form";
import type { Artist } from "@/lib/schemas/artist";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function EditArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServer();
  const { data, error } = await supabase.from("artists").select("*").eq("id", id).maybeSingle();

  if (error || !data) notFound();
  const artist = data as Artist;

  return (
    <Container size="3" py="6">
      <Heading size="7" mb="5">
        {artist.name}
      </Heading>
      <ArtistForm artist={artist} />
    </Container>
  );
}
