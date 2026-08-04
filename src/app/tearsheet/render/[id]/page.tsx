import { notFound } from "next/navigation";
import { MuseumWallLabel } from "@/components/museum-wall-label";
import { GALLERY_NAME } from "@/lib/brand";
import { formatNationalities } from "@/lib/countries";
import { formatDimensions } from "@/lib/dimensions";
import { getServerEnv } from "@/lib/env";
import { getRenderServiceClient } from "@/lib/supabase/render-client";
import type { Artwork } from "@/lib/schemas/artwork";
import "./tearsheet.css";

export const dynamic = "force-dynamic";

type ArtworkRow = Artwork & {
  artists:
    | {
        name: string;
        birth_year: number | null;
        death_year: number | null;
        artist_nationalities: { country_code: string; position: number }[];
      }
    | null;
};

export default async function TearsheetRenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const env = getServerEnv();
  const expected = env.TEARSHEET_RENDER_SECRET;
  if (!expected) {
    return (
      <div className="render-error">TEARSHEET_RENDER_SECRET is not configured.</div>
    );
  }

  const { token } = await searchParams;
  if (token !== expected) notFound();

  const { id } = await params;
  const supabase = getRenderServiceClient();

  const { data, error } = await supabase
    .from("artworks")
    .select("*, artists(name, birth_year, death_year, artist_nationalities(country_code, position))")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();
  const artwork = data as ArtworkRow;

  let imageUrl: string | null = null;
  if (artwork.primary_image_path) {
    const { data: signed } = await supabase.storage
      .from("artworks")
      .createSignedUrl(artwork.primary_image_path, 600);
    imageUrl = signed?.signedUrl ?? null;
  }

  const dimensions = formatDimensions(
    artwork.height_in,
    artwork.width_in,
    artwork.depth_in,
  );

  // "American, 1955" — nationality (demonyms, primary first) + life years.
  const artist = artwork.artists;
  const nationality = formatNationalities(
    [...(artist?.artist_nationalities ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((n) => n.country_code),
  );
  const years =
    artist?.birth_year && artist?.death_year
      ? `${artist.birth_year}–${artist.death_year}`
      : artist?.birth_year
        ? `b. ${artist.birth_year}`
        : artist?.death_year
          ? `d. ${artist.death_year}`
          : "";
  const artistByline = [nationality, years].filter(Boolean).join(", ");

  const provenance = artwork.provenance_lines ?? [];
  const exhibitedParagraphs = splitParagraphs(artwork.exhibited);
  const literatureParagraphs = splitParagraphs(artwork.literature);

  return (
    <div className="ts-page">
      <header className="ts-header">{GALLERY_NAME}</header>

      {imageUrl ? (
        <div className="ts-image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={artwork.title} className="ts-image" />
        </div>
      ) : (
        <div className="ts-image-wrap">
          <div className="ts-image-empty">No image</div>
        </div>
      )}

      <section className="ts-meta">
        {/* The shared museum-wall-label (design system's binding signature),
            reused by the viewing-room PDF. Price/status intentionally omitted
            here so the tearsheet output is unchanged. */}
        <MuseumWallLabel
          artistName={artist?.name ?? "Unknown artist"}
          byline={artistByline}
          title={artwork.title}
          year={artwork.year}
          medium={artwork.medium}
          signatureDetails={artwork.signature_details}
          dimensions={dimensions}
          catalogueRaisonne={artwork.catalogue_raisonne}
        />
      </section>

      {provenance.length > 0 && (
        <section className="ts-section">
          <h3 className="ts-section-heading">Provenance</h3>
          {provenance.map((entry, i) => (
            <div key={i} className="ts-line">
              {entry}
            </div>
          ))}
        </section>
      )}

      {/* Provenance → Exhibited → Literature: the order a dealer factsheet and
          an auction catalogue both use. */}
      {exhibitedParagraphs.length > 0 && (
        <section className="ts-section">
          <h3 className="ts-section-heading">Exhibited</h3>
          {exhibitedParagraphs.map((p, i) => (
            <p key={i} className="ts-paragraph">
              {p}
            </p>
          ))}
        </section>
      )}

      {literatureParagraphs.length > 0 && (
        <section className="ts-section">
          <h3 className="ts-section-heading">Literature</h3>
          {literatureParagraphs.map((p, i) => (
            <p key={i} className="ts-paragraph">
              {p}
            </p>
          ))}
        </section>
      )}

      <footer className="ts-footer">{GALLERY_NAME}</footer>
    </div>
  );
}

// Blank-line-separated entries → one <p> each. Shared by Exhibited + Literature,
// which are both stored as free text with a paragraph per entry.
function splitParagraphs(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
