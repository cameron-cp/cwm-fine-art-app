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

// Design system: the work sits in a passe-partout mount (a mat inside a hairline
// frame) — depth from the mat, not a drop shadow — with the museum wall label beneath.
export function ArtworkCard({ artwork }: { artwork: ArtworkCardData }) {
  return (
    <div className="group flex flex-col gap-4">
      <Link href={`/artworks/${artwork.id}`} className="block">
        <div className="border border-[var(--rule)] bg-[var(--paper-2)] p-3">
          <div
            className="flex items-center justify-center border border-[var(--rule)] bg-[var(--paper)] p-4"
            style={{ aspectRatio: "4 / 5" }}
          >
            {artwork.imageUrl ? (
              <Image
                src={artwork.imageUrl}
                alt={artwork.title}
                width={480}
                height={600}
                className="max-h-full w-auto object-contain"
                unoptimized
              />
            ) : (
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                No image
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/artworks/${artwork.id}`}
            className="font-serif text-[16px] leading-snug text-[var(--ink)] hover:underline"
          >
            <span className="italic">{artwork.title}</span>
            {artwork.year ? <span className="not-italic">, {artwork.year}</span> : null}
          </Link>
          <div className="mt-[3px] shrink-0">
            <StatusBadge status={artwork.status} />
          </div>
        </div>
        {artwork.medium && (
          <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
            {artwork.medium}
          </div>
        )}
        <div className="num text-[14px] text-[var(--ink)]">
          {formatPriceCents(artwork.price_cents, artwork.currency)}
        </div>
      </div>

      <GenerateTearsheetButton artworkId={artwork.id} size="2" variant="outline" />
    </div>
  );
}
