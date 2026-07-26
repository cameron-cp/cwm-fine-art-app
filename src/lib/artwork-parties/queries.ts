import type { ArtworkPartyRow, LinkedArtwork } from "@/lib/schemas/artwork-party";

// The contact page's read of artwork_parties, extracted from the page so the
// integration test can execute the REAL select string rather than a copy that
// can drift away from it.

/** Artwork fields the links list needs: enough for a wall label + thumbnail. */
export const LINKED_ARTWORK_SELECT =
  "id, title, year, medium, edition, status, record_kind, price_cents, currency, " +
  "primary_image_path, artist:artists(name)";

/** Every link for one contact — all roles, open and closed. */
export const CONTACT_ARTWORK_LINKS_SELECT = `*, artwork:artworks(${LINKED_ARTWORK_SELECT})`;

// PostgREST returns an embed as an object or a single-element array depending on
// the relationship; tolerate both (artworks/page.tsx precedent).
function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** The shape CONTACT_ARTWORK_LINKS_SELECT actually returns, pre-flattening. */
export type RawArtworkPartyRow = Omit<ArtworkPartyRow, "artwork"> & {
  artwork:
    | (Omit<LinkedArtwork, "artist_name"> & {
        artist: { name: string } | { name: string }[] | null;
      })
    | null;
};

/** Collapse the embedded artist join down to a scalar artist_name. */
export function flattenArtworkPartyRows(rows: RawArtworkPartyRow[]): ArtworkPartyRow[] {
  return rows.map(({ artwork, ...row }) => ({
    ...row,
    artwork: artwork ? { ...artwork, artist_name: one(artwork.artist)?.name ?? null } : null,
  }));
}

/** "Artist — Title (year)", the datalist key for the work picker. Suffixed on
 *  collision so the label → id lookup stays unambiguous. */
export function artworkOptionLabels(
  rows: {
    id: string;
    title: string;
    year: number | null;
    artist: { name: string } | { name: string }[] | null;
  }[],
): { id: string; label: string }[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const artist = one(r.artist)?.name ?? "Unknown artist";
    const base = `${artist} — ${r.title}${r.year ? ` (${r.year})` : ""}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { id: r.id, label: n === 0 ? base : `${base} #${n + 1}` };
  });
}
