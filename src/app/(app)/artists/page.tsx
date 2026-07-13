import { Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { formatNationalities } from "@/lib/countries";
import { getSupabaseServer } from "@/lib/supabase/server";

type ArtistRow = {
  id: string;
  name: string;
  birth_year: number | null;
  death_year: number | null;
  artist_nationalities: { country_code: string; position: number }[];
};

// Column-header treatment: letterspaced uppercase micro-caps (design system).
// On a <span> so Tailwind wins over Radix's unlayered cell styles.
const HEAD = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]";

export default async function ArtistsPage() {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("artists")
    .select("id, name, birth_year, death_year, artist_nationalities(country_code, position)")
    .order("sort_name");

  const artists = (data ?? []) as ArtistRow[];

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="end" mb="6">
        <Heading size="8" weight="medium">
          Artists
        </Heading>
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
          className="border border-[var(--rule)]"
        >
          <Text style={{ color: "var(--ink-3)" }}>No artists yet.</Text>
          <Button asChild variant="outline" color="gray">
            <Link href="/artists/new">Add your first artist</Link>
          </Button>
        </Flex>
      ) : (
        <Table.Root variant="ghost">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>
                <span className={HEAD}>Name</span>
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                <span className={HEAD}>Years</span>
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                <span className={HEAD}>Nationality</span>
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {artists.map((a) => {
              const nationality = formatNationalities(orderedCodes(a.artist_nationalities));
              return (
                <Table.Row key={a.id} align="center">
                  <Table.Cell>
                    <Link
                      href={`/artists/${a.id}`}
                      className="font-serif text-[17px] font-semibold text-[var(--ink)] hover:underline"
                    >
                      {a.name}
                    </Link>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="num text-[13px] text-[var(--ink-3)]">
                      {formatYears(a.birth_year, a.death_year)}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    {nationality ? (
                      <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                        {nationality}
                      </span>
                    ) : (
                      <span className="text-[var(--ink-3)]">—</span>
                    )}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      )}
    </Container>
  );
}

// Sort embedded nationality rows by position and return bare codes, primary first.
function orderedCodes(rows: { country_code: string; position: number }[]): string[] {
  return [...rows].sort((a, b) => a.position - b.position).map((r) => r.country_code);
}

function formatYears(birth: number | null, death: number | null): string {
  if (!birth && !death) return "—";
  if (birth && death) return `${birth}–${death}`;
  if (birth) return `b. ${birth}`;
  return `d. ${death}`;
}
