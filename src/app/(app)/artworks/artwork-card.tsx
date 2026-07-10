import { Box, Card, Flex, Text } from "@radix-ui/themes";
import Image from "next/image";
import Link from "next/link";
import { GenerateTearsheetButton } from "./[id]/generate-tearsheet-button";
import { StatusBadge } from "./status-badge";
import type { ArtworkStatus } from "@/lib/schemas/artwork";
import { formatPriceCents } from "@/lib/supabase/storage";

export type ArtworkCardData = {
  id: string;
  title: string;
  year: number | null;
  medium: string | null;
  status: ArtworkStatus;
  price_cents: number | null;
  currency: string;
  imageUrl: string | null;
};

export function ArtworkCard({ artwork }: { artwork: ArtworkCardData }) {
  return (
    <Card>
      <Flex direction="column" gap="3">
        <Link href={`/artworks/${artwork.id}`}>
          {artwork.imageUrl ? (
            <Image
              src={artwork.imageUrl}
              alt={artwork.title}
              width={480}
              height={360}
              className="rounded-2 object-cover w-full bg-[var(--gray-a2)]"
              style={{ aspectRatio: "4 / 3" }}
              unoptimized
            />
          ) : (
            <Box
              className="rounded-2 bg-[var(--gray-a3)] flex items-center justify-center w-full"
              style={{ aspectRatio: "4 / 3" }}
            >
              <Text color="gray" size="1">
                No image
              </Text>
            </Box>
          )}
        </Link>

        <Flex direction="column" gap="1">
          <Flex justify="between" align="center" gap="2">
            <Link
              href={`/artworks/${artwork.id}`}
              className="text-[var(--accent-11)] hover:underline"
            >
              <Text weight="medium" size="2">
                {artwork.title}
                {artwork.year ? `, ${artwork.year}` : ""}
              </Text>
            </Link>
            <StatusBadge status={artwork.status} />
          </Flex>
          {artwork.medium && (
            <Text size="1" color="gray">
              {artwork.medium}
            </Text>
          )}
          <Text size="2">{formatPriceCents(artwork.price_cents, artwork.currency)}</Text>
        </Flex>

        <GenerateTearsheetButton
          artworkId={artwork.id}
          title={artwork.title}
          size="2"
          variant="soft"
        />
      </Flex>
    </Card>
  );
}
