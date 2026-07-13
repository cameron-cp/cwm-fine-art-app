import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { resolveCandidate } from "@/lib/authority";
import {
  resolveInputSchema,
  resolvedArtistSchema,
  type ResolvedArtistFields,
} from "@/lib/schemas/authority";
import { getSupabaseServer } from "@/lib/supabase/server";

// POST /api/artists/authority/resolve  body { qid }
//   → { data: { canonicalArtistId, fields, getty } }
// Resolves a Wikidata QID (+ Getty ULAN when present), upserts the shared
// canonical_artists row, and returns the fields the form prefills.
//
// Status grading:
//   400 bad qid · 401 unauth · 422 Wikidata has no such artist ·
//   500 DB/validation · 502 Wikidata upstream down.
// Getty failure NEVER changes the status — it degrades inside the payload
// (data.getty = 'unavailable').

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = resolveInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const resolved = await resolveCandidate(parsed.data.qid);
  if ("error" in resolved) {
    const status = resolved.kind === "not_found" ? 422 : 502;
    return NextResponse.json({ error: resolved.error }, { status });
  }

  // Re-validate the merged record at the trust boundary before it hits the DB.
  const validated = resolvedArtistSchema.safeParse(resolved.data);
  if (!validated.success) {
    return NextResponse.json(
      { error: `Resolved record failed validation: ${validated.error.issues[0]?.message}` },
      { status: 500 },
    );
  }

  const supabase = getSupabaseServer();
  const { data: canonicalArtistId, error } = await supabase.rpc("upsert_canonical_artist", {
    p: validated.data,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fields: ResolvedArtistFields = {
    preferred_name: validated.data.preferred_name,
    sort_name: validated.data.sort_name,
    birth_year: validated.data.birth_year,
    death_year: validated.data.death_year,
    nationality_codes: validated.data.nationality_codes,
    bio: validated.data.bio,
  };

  return NextResponse.json({
    data: { canonicalArtistId, fields, getty: validated.data.sources.getty },
  });
}
