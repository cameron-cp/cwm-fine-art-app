import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  ARTWORK_SEARCH_PAGE_SIZE,
  artworkRef,
  buildArtworkSearchQuery,
  markAmbiguous,
  type ArtworkPickerItem,
  type ArtworkSearchResult,
} from "@/lib/artwork-search";
import { artworkStatus } from "@/lib/schemas/artwork";
import { formatDimensions } from "@/lib/dimensions";
import { getSupabaseServer } from "@/lib/supabase/server";
import { signedArtworkUrls } from "@/lib/supabase/storage";

// GET /api/artworks/search?q=&artist=&status=&limit=&offset=
//   → { data: ArtworkSearchResult }
//
// Backs the invoice line-item picker. Clerk-gated; runs through the user-JWT
// client so the search_artworks() RPC (SECURITY INVOKER) is still subject to RLS.

const querySchema = z.object({
  q: z.string().max(200).optional().default(""),
  artist: z.uuid().optional(),
  status: artworkStatus.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(ARTWORK_SEARCH_PAGE_SIZE),
  // Deep paging past this is not a thing anyone does in a typeahead; the pool cap
  // in the RPC means rows beyond it do not exist to page into anyway.
  offset: z.coerce.number().int().min(0).max(2000).default(0),
});

type SearchRow = {
  id: string;
  artist_id: string;
  artist_name: string | null;
  title: string;
  year: number | null;
  medium: string | null;
  edition: string | null;
  signature_details: string | null;
  catalogue_raisonne: string | null;
  provenance_lines: string[] | null;
  height_in: number | null;
  width_in: number | null;
  depth_in: number | null;
  price_cents: number | null;
  currency: string | null;
  status: string;
  primary_image_path: string | null;
  total_count: number;
  total_capped: boolean;
};

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    artist: url.searchParams.get("artist") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid search parameters" }, { status: 400 });
  }
  const { q, artist, status, limit, offset } = parsed.data;

  const { patterns, rank, searchable } = buildArtworkSearchQuery(q);

  // A one-character query with no artist scope would return an arbitrary slice of
  // the whole inventory. Say nothing instead of saying something meaningless.
  if (!searchable && !artist && !status) {
    const empty: ArtworkSearchResult = { items: [], total: 0, capped: false, limit, offset };
    return NextResponse.json({ data: empty });
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase.rpc("search_artworks", {
    p_patterns: searchable ? patterns : null,
    p_rank: searchable ? rank : null,
    p_artist_id: artist ?? null,
    p_status: status ?? null,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as SearchRow[];
  const paths = rows
    .map((r) => r.primary_image_path)
    .filter((p): p is string => !!p);
  const signed = await signedArtworkUrls(supabase, paths, 3600);

  const items = markAmbiguous(
    rows.map((r) => ({
      id: r.id,
      artist_id: r.artist_id,
      artist_name: r.artist_name,
      title: r.title,
      year: r.year,
      medium: r.medium,
      edition: r.edition,
      signature_details: r.signature_details,
      catalogue_raisonne: r.catalogue_raisonne,
      provenance_lines: r.provenance_lines ?? [],
      price_cents: r.price_cents,
      currency: r.currency ?? "USD",
      status: artworkStatus.parse(r.status),
      dimensions_text: formatDimensions(r.height_in, r.width_in, r.depth_in),
      image_url: r.primary_image_path ? (signed[r.primary_image_path] ?? null) : null,
      ref: artworkRef(r.id),
    })),
  ) satisfies ArtworkPickerItem[];

  const result: ArtworkSearchResult = {
    items,
    total: rows[0]?.total_count ?? 0,
    capped: rows[0]?.total_capped ?? false,
    limit,
    offset,
  };

  return NextResponse.json(
    { data: result },
    // Brief private cache: repeated keystrokes and a re-opened picker within a few
    // seconds do not need to hit Postgres again.
    { headers: { "Cache-Control": "private, max-age=10" } },
  );
}
