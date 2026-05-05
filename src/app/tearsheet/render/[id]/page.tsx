import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { GALLERY_NAME } from "@/lib/brand";
import { formatDimensions } from "@/lib/dimensions";
import { publicEnv, getServerEnv } from "@/lib/env";
import type { Artwork } from "@/lib/schemas/artwork";
import "./tearsheet.css";

export const dynamic = "force-dynamic";

type ArtworkRow = Artwork & {
  artists: { name: string } | null;
};

function getServiceClient() {
  const env = getServerEnv();
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ?? publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
}

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
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("artworks")
    .select("*, artists(name)")
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

  const provenance = artwork.provenance_lines ?? [];
  const literatureParagraphs = (artwork.literature ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

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
        <div className="ts-artist">{artwork.artists?.name ?? "Unknown artist"}</div>
        <div className="ts-title">
          <em>{artwork.title}</em>
          {artwork.year ? <>, {artwork.year}</> : null}
        </div>
        {artwork.medium && <div className="ts-line">{artwork.medium}</div>}
        {artwork.signature_details && (
          <div className="ts-line">{artwork.signature_details}</div>
        )}
        {dimensions && <div className="ts-line">{dimensions}</div>}

        {artwork.catalogue_raisonne && (
          <p className="ts-paragraph ts-cr">{artwork.catalogue_raisonne}</p>
        )}
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
