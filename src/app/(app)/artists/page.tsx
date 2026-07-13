import { Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { ClearFilters, FilterSelect, SearchInput } from "@/components/list-controls";
import { countryName, formatNationalities } from "@/lib/countries";
import { firstParam, sanitizeSearch } from "@/lib/search";
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

export default async function ArtistsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; nationality?: string }>;
}) {
  const sp = await searchParams;
  const q = sanitizeSearch(sp.q);
  const nationality = firstParam(sp.nationality);
  const hasFilters = !!(sp.q?.trim() || nationality);

  const supabase = getSupabaseServer();

  // Nationality is a many-to-many join; filter parents by first resolving the
  // matching artist ids, then constraining the main query.
  let idFilter: string[] | null = null;
  if (nationality) {
    const { data: nat } = await supabase
      .from("artist_nationalities")
      .select("artist_id")
      .eq("country_code", nationality);
    idFilter = (nat ?? []).map((r) => r.artist_id as string);
  }

  let query = supabase
    .from("artists")
    .select("id, name, birth_year, death_year, artist_nationalities(country_code, position)")
    .order("sort_name");

  if (q) query = query.or(`name.ilike.%${q}%,sort_name.ilike.%${q}%`);
  if (idFilter) query = query.in("id", idFilter.length ? idFilter : ["00000000-0000-0000-0000-000000000000"]);

  const { data, error } = await query;
  const artists = (data ?? []) as ArtistRow[];

  // Nationality options: every country present across all artists, name-sorted.
  const { data: allNats } = await supabase
    .from("artist_nationalities")
    .select("country_code");
  const natOptions = Array.from(
    new Set((allNats ?? []).map((r) => r.country_code as string)),
  )
    .map((code) => ({ value: code, label: countryName(code) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="end" mb="5">
        <Heading size="8" weight="medium">
          Artists
        </Heading>
        <Button asChild>
          <Link href="/artists/new">New artist</Link>
        </Button>
      </Flex>

      <Flex align="end" gap="4" mb="4" wrap="wrap">
        <SearchInput placeholder="Search artists…" />
        <FilterSelect
          paramKey="nationality"
          label="Nationality"
          allLabel="All nationalities"
          options={natOptions}
        />
        {hasFilters && <ClearFilters href="/artists" />}
        <Text size="1" className="self-end num text-[var(--ink-3)]" ml="auto">
          {artists.length} {artists.length === 1 ? "artist" : "artists"}
        </Text>
      </Flex>

      {error && (
        <Text color="red" size="2">
          {error.message}
        </Text>
      )}

      {artists.length === 0 ? (
        <EmptyState filtered={hasFilters} />
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
              const natLabel = formatNationalities(orderedCodes(a.artist_nationalities));
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
                    {natLabel ? (
                      <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                        {natLabel}
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

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="3"
      py="9"
      className="border border-[var(--rule)]"
    >
      {filtered ? (
        <>
          <Text style={{ color: "var(--ink-3)" }}>No artists match these filters.</Text>
          <Button asChild variant="outline" color="gray">
            <Link href="/artists">Clear filters</Link>
          </Button>
        </>
      ) : (
        <>
          <Text style={{ color: "var(--ink-3)" }}>No artists yet.</Text>
          <Button asChild variant="outline" color="gray">
            <Link href="/artists/new">Add your first artist</Link>
          </Button>
        </>
      )}
    </Flex>
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
