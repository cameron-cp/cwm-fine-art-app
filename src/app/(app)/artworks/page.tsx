import { Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Image from "next/image";
import Link from "next/link";
import { StatusBadge } from "./status-badge";
import { ClearFilters, FilterSelect, SearchInput } from "@/components/list-controls";
import { firstParam, sanitizeSearch } from "@/lib/search";
import { ARTWORK_STATUS_META, artworkStatus, type Artwork } from "@/lib/schemas/artwork";
import { getSupabaseServer } from "@/lib/supabase/server";
import { formatPriceCents, signedArtworkUrls } from "@/lib/supabase/storage";

type PartyRef = { display_name: string };
type AddressRef = { label: string | null; party: PartyRef | PartyRef[] | null };

type Row = Pick<
  Artwork,
  "id" | "title" | "year" | "status" | "price_cents" | "currency" | "primary_image_path"
> & {
  artists: { name: string } | null;
  current_party_address: AddressRef | AddressRef[] | null;
};

// "Party — label" for the current location, or "—". Tolerates the untyped embed
// coming back as either an object or a single-element array.
function locationLabel(row: Row): string {
  const pa = Array.isArray(row.current_party_address)
    ? row.current_party_address[0]
    : row.current_party_address;
  if (!pa) return "—";
  const party = Array.isArray(pa.party) ? pa.party[0] : pa.party;
  const label = pa.label ?? "Address";
  return party?.display_name ? `${party.display_name} — ${label}` : label;
}

// Column-header treatment: letterspaced uppercase micro-caps (design system).
// Wrapped on a <span> so Tailwind wins over Radix's unlayered cell styles.
const HEAD = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]";

export default async function ArtworksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; artist?: string }>;
}) {
  const sp = await searchParams;
  const q = sanitizeSearch(sp.q);
  const status = artworkStatus.safeParse(firstParam(sp.status)).success
    ? firstParam(sp.status)
    : "";
  const artistId = firstParam(sp.artist);
  const hasFilters = !!(sp.q?.trim() || status || artistId);

  const supabase = getSupabaseServer();

  // Artist list for the filter select — also lets us resolve a search term
  // against artist names (search matches title OR artist).
  const { data: artistRows } = await supabase
    .from("artists")
    .select("id, name")
    .order("sort_name");
  const artistOptions = (artistRows ?? []).map((a) => ({
    value: a.id as string,
    label: a.name as string,
  }));

  let matchingArtistIds: string[] = [];
  if (q) {
    const needle = q.toLowerCase();
    matchingArtistIds = (artistRows ?? [])
      .filter((a) => (a.name as string).toLowerCase().includes(needle))
      .map((a) => a.id as string);
  }

  let query = supabase
    .from("artworks")
    .select(
      "id, title, year, status, price_cents, currency, primary_image_path, artists(name), current_party_address:party_addresses!artworks_current_party_address_id_fkey(label, party:parties(display_name))",
    )
    .order("created_at", { ascending: false });

  if (q) {
    const parts = [`title.ilike.%${q}%`];
    if (matchingArtistIds.length) parts.push(`artist_id.in.(${matchingArtistIds.join(",")})`);
    query = query.or(parts.join(","));
  }
  if (status) query = query.eq("status", status);
  if (artistId) query = query.eq("artist_id", artistId);

  const { data, error } = await query;
  const artworks = (data ?? []) as unknown as Row[];

  const paths = artworks.map((a) => a.primary_image_path).filter((p): p is string => !!p);
  const signed = await signedArtworkUrls(supabase, paths, 3600);

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="end" mb="5">
        <Heading size="8" weight="medium">
          Artworks
        </Heading>
        <Flex gap="3" align="center">
          <Button asChild variant="ghost" color="gray">
            <Link href="/artworks/import">Import PDF</Link>
          </Button>
          <Button asChild>
            <Link href="/artworks/new">New artwork</Link>
          </Button>
        </Flex>
      </Flex>

      <Flex align="end" gap="4" mb="4" wrap="wrap">
        <SearchInput placeholder="Search title or artist…" />
        <FilterSelect
          paramKey="status"
          label="Status"
          allLabel="All statuses"
          options={artworkStatus.options.map((s) => ({
            value: s,
            label: ARTWORK_STATUS_META[s].label,
          }))}
        />
        <FilterSelect
          paramKey="artist"
          label="Artist"
          allLabel="All artists"
          options={artistOptions}
        />
        {hasFilters && <ClearFilters href="/artworks" />}
        <Text size="1" className="self-end num text-[var(--ink-3)]" ml="auto">
          {artworks.length} {artworks.length === 1 ? "work" : "works"}
        </Text>
      </Flex>

      {error && (
        <Text color="red" size="2">
          {error.message}
        </Text>
      )}

      {artworks.length === 0 ? (
        <EmptyState filtered={hasFilters} />
      ) : (
        <Table.Root variant="ghost">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell></Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                <span className={HEAD}>Artist / Work</span>
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                <span className={HEAD}>Year</span>
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                <span className={HEAD}>Status</span>
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                <span className={HEAD}>Location</span>
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">
                <span className={HEAD}>Price</span>
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {artworks.map((a) => {
              const url = a.primary_image_path ? signed[a.primary_image_path] : null;
              const loc = locationLabel(a);
              return (
                <Table.Row key={a.id} align="center">
                  <Table.Cell>
                    {url ? (
                      <Image
                        src={url}
                        alt=""
                        width={44}
                        height={44}
                        className="h-11 w-11 border border-[var(--rule)] object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="h-11 w-11 border border-[var(--rule)] bg-[var(--paper-3)]" />
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {/* Wall label: artist in Garamond, italic title beneath. */}
                    <Link href={`/artworks/${a.id}`} className="group block">
                      <div className="font-serif text-[16px] font-semibold leading-tight text-[var(--ink)]">
                        {a.artists?.name ?? "—"}
                      </div>
                      <div className="font-serif text-[14px] italic leading-snug text-[var(--ink-2)] group-hover:text-[var(--ink)] group-hover:underline">
                        {a.title}
                      </div>
                    </Link>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="num text-[13px] text-[var(--ink-3)]">{a.year ?? "—"}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge status={a.status} />
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" style={{ color: loc === "—" ? "var(--ink-3)" : "var(--ink-2)" }}>
                      {loc}
                    </Text>
                  </Table.Cell>
                  <Table.Cell align="right">
                    <span className="num text-[14px] text-[var(--ink)]">
                      {formatPriceCents(a.price_cents, a.currency)}
                    </span>
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
          <Text style={{ color: "var(--ink-3)" }}>No artworks match these filters.</Text>
          <Button asChild variant="outline" color="gray">
            <Link href="/artworks">Clear filters</Link>
          </Button>
        </>
      ) : (
        <>
          <Text style={{ color: "var(--ink-3)" }}>No artworks yet.</Text>
          <Button asChild variant="outline" color="gray">
            <Link href="/artworks/new">Add your first artwork</Link>
          </Button>
        </>
      )}
    </Flex>
  );
}
