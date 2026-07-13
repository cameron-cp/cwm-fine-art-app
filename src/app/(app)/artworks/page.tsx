import { Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Image from "next/image";
import Link from "next/link";
import { StatusBadge } from "./status-badge";
import type { Artwork } from "@/lib/schemas/artwork";
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

export default async function ArtworksPage() {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("artworks")
    .select(
      "id, title, year, status, price_cents, currency, primary_image_path, artists(name), current_party_address:party_addresses!artworks_current_party_address_id_fkey(label, party:parties(display_name))",
    )
    .order("created_at", { ascending: false });

  const artworks = (data ?? []) as unknown as Row[];

  const paths = artworks.map((a) => a.primary_image_path).filter((p): p is string => !!p);
  const signed = await signedArtworkUrls(supabase, paths, 3600);

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="end" mb="6">
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

      {error && (
        <Text color="red" size="2">
          {error.message}
        </Text>
      )}

      {artworks.length === 0 ? (
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap="3"
          py="9"
          className="border border-[var(--rule)]"
        >
          <Text style={{ color: "var(--ink-3)" }}>No artworks yet.</Text>
          <Button asChild variant="outline" color="gray">
            <Link href="/artworks/new">Add your first artwork</Link>
          </Button>
        </Flex>
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
