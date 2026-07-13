import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { searchArtists } from "@/lib/authority";

// GET /api/artists/authority/search?q=  → { data: AuthorityCandidate[] }
// Typeahead against Wikidata. Clerk-gated; short queries return an empty list.

const querySchema = z.object({ q: z.string().trim().min(2, "Query too short") });

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = querySchema.safeParse({ q: new URL(req.url).searchParams.get("q") ?? "" });
  if (!parsed.success) {
    // A too-short query is not an error state for a typeahead — return empty.
    return NextResponse.json({ data: [] });
  }

  const result = await searchArtists(parsed.data.q);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json(
    { data: result.data },
    // Brief cache: identical keystrokes within a few seconds hit the edge, not Wikidata.
    { headers: { "Cache-Control": "private, max-age=10" } },
  );
}
