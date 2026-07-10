import { Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Image from "next/image";
import Link from "next/link";
import { StatusBadge } from "./status-badge";
import type { Artwork } from "@/lib/schemas/artwork";
import { getSupabaseServer } from "@/lib/supabase/server";
import { formatPriceCents, signedArtworkUrls } from "@/lib/supabase/storage";

type Row = Pick<
  Artwork,
  "id" | "title" | "year" | "status" | "price_cents" | "currency" | "primary_image_path"
> & {
  artists: { name: string } | null;
};

export default async function ArtworksPage() {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("artworks")
    .select("id, title, year, status, price_cents, currency, primary_image_path, artists(name)")
    .order("created_at", { ascending: false });

  const artworks = (data ?? []) as unknown as Row[];

  const paths = artworks.map((a) => a.primary_image_path).filter((p): p is string => !!p);
  const signed = await signedArtworkUrls(supabase, paths, 3600);

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="center" mb="5">
        <Heading size="7">Artworks</Heading>
        <Flex gap="2">
          <Button asChild variant="soft">
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
          className="border border-dashed border-[var(--gray-a6)] rounded-3"
        >
          <Text color="gray">No artworks yet.</Text>
          <Button asChild variant="soft">
            <Link href="/artworks/new">Add your first artwork</Link>
          </Button>
        </Flex>
      ) : (
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell></Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Year</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">Price</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {artworks.map((a) => {
              const url = a.primary_image_path ? signed[a.primary_image_path] : null;
              return (
                <Table.Row key={a.id}>
                  <Table.Cell>
                    {url ? (
                      <Image
                        src={url}
                        alt=""
                        width={48}
                        height={48}
                        className="rounded-1 object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-12 h-12 bg-[var(--gray-a3)] rounded-1" />
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Link
                      href={`/artworks/${a.id}`}
                      className="text-[var(--accent-11)] hover:underline"
                    >
                      {a.title}
                    </Link>
                  </Table.Cell>
                  <Table.Cell>{a.artists?.name ?? "—"}</Table.Cell>
                  <Table.Cell>{a.year ?? "—"}</Table.Cell>
                  <Table.Cell>
                    <StatusBadge status={a.status} />
                  </Table.Cell>
                  <Table.Cell align="right">
                    {formatPriceCents(a.price_cents, a.currency)}
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
