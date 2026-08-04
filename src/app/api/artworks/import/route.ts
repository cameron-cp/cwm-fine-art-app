import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getEffectiveFeatureModel } from "@/lib/ai/settings";
import { getServerEnv } from "@/lib/env";
import {
  ExtractionError,
  extractArtworkFromPdf,
} from "@/lib/import/anthropic";
import type { ImportDraft } from "@/lib/schemas/import-draft";
import { getSupabaseServer } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 5;

export const runtime = "nodejs";
// Anthropic call + PDF processing can take ~10s; default route timeout is fine
// for Pro, but be explicit so this doesn't surprise on Hobby.
export const maxDuration = 60;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = getServerEnv();
  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Couldn't read upload — make sure you sent multipart/form-data." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field." },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File is too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).` },
      { status: 400 },
    );
  }

  const buf = await file.arrayBuffer();

  // Magic-byte check: PDFs start with %PDF (25 50 44 46). MIME alone is spoofable.
  const head = new Uint8Array(buf.slice(0, 4));
  if (
    head[0] !== 0x25 ||
    head[1] !== 0x50 ||
    head[2] !== 0x44 ||
    head[3] !== 0x46
  ) {
    return NextResponse.json(
      { error: "That doesn't look like a PDF." },
      { status: 400 },
    );
  }

  // Best-effort page count via /Type /Page token sniff. Object-stream-compressed
  // PDFs may slip through; size cap + Anthropic max_tokens bound the worst case.
  const pageCount = countPagesHeuristic(buf);
  if (pageCount > MAX_PAGES) {
    return NextResponse.json(
      {
        error: `PDFs over ${MAX_PAGES} pages aren't supported in V1. This PDF appears to have ~${pageCount} pages.`,
      },
      { status: 400 },
    );
  }

  let modelOutput;
  try {
    const { model } = await getEffectiveFeatureModel("import", getSupabaseServer());
    modelOutput = await extractArtworkFromPdf(buf, env.ANTHROPIC_API_KEY, model);
  } catch (e) {
    if (e instanceof ExtractionError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: `Tearsheet extraction failed: ${detail}` },
      { status: 502 },
    );
  }

  const supabase = getSupabaseServer();

  // Artist matching: only attempt when the model identified a name.
  let matched_artist_id: string | null = null;
  let suggested_artist_name: string | null = null;
  let matched_artist_candidates: { id: string; name: string }[] = [];

  if (modelOutput.artist_name) {
    const { data: matches, error: rpcErr } = await supabase.rpc(
      "match_artist_by_name",
      { p_name: modelOutput.artist_name },
    );
    if (rpcErr) {
      return NextResponse.json(
        { error: `Artist match failed: ${rpcErr.message}` },
        { status: 500 },
      );
    }
    const rows = (matches ?? []) as { id: string; name: string }[];
    if (rows.length === 1) {
      matched_artist_id = rows[0].id;
    } else if (rows.length > 1) {
      matched_artist_candidates = rows;
    } else {
      suggested_artist_name = modelOutput.artist_name;
    }
  }

  const draft: ImportDraft = {
    artist_id: null,
    matched_artist_id,
    suggested_artist_name,
    matched_artist_candidates,
    title: modelOutput.title,
    year: modelOutput.year,
    medium: modelOutput.medium,
    signature_details: modelOutput.signature_details,
    height_in: modelOutput.height_in,
    width_in: modelOutput.width_in,
    depth_in: modelOutput.depth_in,
    edition: modelOutput.edition,
    catalogue_raisonne: modelOutput.catalogue_raisonne,
    provenance_lines: modelOutput.provenance_lines,
    literature: modelOutput.literature,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("import_drafts")
    .insert({ payload: draft })
    .select("id")
    .single();

  if (insErr) {
    return NextResponse.json(
      { error: `Couldn't save draft: ${insErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { draftId: inserted.id } });
}

function countPagesHeuristic(buf: ArrayBuffer): number {
  // Count "/Type /Page" sequences (with optional whitespace) in the raw bytes.
  // We look at chunks to avoid scanning the entire buffer as a string for huge
  // PDFs, but for our 10 MB cap a single decode is fine.
  const text = Buffer.from(buf).toString("latin1");
  const matches = text.match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 1;
}
