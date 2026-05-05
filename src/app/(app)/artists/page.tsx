import { Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Artist } from "@/lib/schemas/artist";

export default async function ArtistsPage() {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("artists")
    .select("id, name, birth_year, death_year, nationality")
    .order("name");

  const artists = (data ?? []) as Pick<
    Artist,
    "id" | "name" | "birth_year" | "death_year" | "nationality"
  >[];

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="center" mb="5">
        <Heading size="7">Artists</Heading>
        <Button asChild>
          <Link href="/artists/new">New artist</Link>
        </Button>
      </Flex>

      {error && (
        <Text color="red" size="2">
          {error.message}
        </Text>
      )}

      {artists.length === 0 ? (
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap="3"
          py="9"
          className="border border-dashed border-[var(--gray-a6)] rounded-3"
        >
          <Text color="gray">No artists yet.</Text>
          <Button asChild variant="soft">
            <Link href="/artists/new">Add your first artist</Link>
          </Button>
        </Flex>
      ) : (
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Years</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Nationality</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {artists.map((a) => (
              <Table.Row key={a.id}>
                <Table.Cell>
                  <Link href={`/artists/${a.id}`} className="text-[var(--accent-11)] hover:underline">
                    {a.name}
                  </Link>
                </Table.Cell>
                <Table.Cell>{formatYears(a.birth_year, a.death_year)}</Table.Cell>
                <Table.Cell>{a.nationality ?? "—"}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Container>
  );
}

function formatYears(birth: number | null, death: number | null): string {
  if (!birth && !death) return "—";
  if (birth && death) return `${birth}–${death}`;
  if (birth) return `b. ${birth}`;
  return `d. ${death}`;
}
