import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { interestSchema } from "@/lib/schemas/interest";

// Integration tests for collector_interests (migration 0014), run against the LOCAL
// Supabase stack (`supabase start`). They verify the things a unit test cannot: the
// XOR CHECK, the sentiment-inclusive unique indexes, artist-delete RESTRICT, and —
// the load-bearing one — that the DB CHECK and the Zod superRefine agree on row
// shape in LOCKSTEP (the two-sources-of-truth risk the review flagged).
//
// Skipped (not failed) when no local stack is reachable, so CI stays green.

type LocalEnv = { url: string; service: string } | null;

function readLocalEnv(): LocalEnv {
  try {
    const out = execSync("supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const vars: Record<string, string> = {};
    for (const line of out.split("\n")) {
      const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
      if (m) vars[m[1]] = m[2];
    }
    if (vars.API_URL && vars.SERVICE_ROLE_KEY) {
      return { url: vars.API_URL, service: vars.SERVICE_ROLE_KEY };
    }
    return null;
  } catch {
    return null;
  }
}

const local = readLocalEnv();
const d = local ? describe : describe.skip;

// A single logical shape-case. The DB row and the Zod input are DERIVED from the
// same object (see zodInputFromRow) so the two halves of the parity test can never
// silently describe different cases. Nationality cases use a real ISO code so the
// app-only country-code check doesn't diverge from the shape-only DB CHECK.
type ShapeCase = {
  name: string;
  valid: boolean;
  dimension: string;
  useArtist?: boolean; // fill artist_id with the real seeded artist
  value?: string | null;
  price_min_cents?: number | null;
  price_max_cents?: number | null;
};

function zodInputFromRow(c: ShapeCase, artistId: string) {
  return {
    dimension: c.dimension,
    sentiment: "seeking",
    source: "stated",
    confidence: "confirmed",
    artist_id: c.useArtist ? artistId : "",
    value: c.value ?? "",
    // DB stores cents; the schema input is dollars → divide back so both sides mean
    // the same money.
    price_min_cents: c.price_min_cents == null ? "" : String(c.price_min_cents / 100),
    price_max_cents: c.price_max_cents == null ? "" : String(c.price_max_cents / 100),
    qualifier: "",
  };
}

function dbRow(c: ShapeCase, partyId: string, artistId: string) {
  return {
    party_id: partyId,
    dimension: c.dimension,
    sentiment: "seeking",
    artist_id: c.useArtist ? artistId : null,
    value: c.value ?? null,
    price_min_cents: c.price_min_cents ?? null,
    price_max_cents: c.price_max_cents ?? null,
  };
}

const CASES: ShapeCase[] = [
  { name: "artist ok", valid: true, dimension: "artist", useArtist: true },
  { name: "artist missing id", valid: false, dimension: "artist" },
  { name: "artist with value", valid: false, dimension: "artist", useArtist: true, value: "x" },
  { name: "medium ok", valid: true, dimension: "medium", value: "Oil on canvas" },
  { name: "medium with artist", valid: false, dimension: "medium", useArtist: true, value: "Oil" },
  { name: "medium empty", valid: false, dimension: "medium", value: null },
  { name: "nationality ok", valid: true, dimension: "nationality", value: "US" },
  { name: "price min+max ok", valid: true, dimension: "price_band", price_min_cents: 100_000, price_max_cents: 500_000 },
  { name: "price min only ok", valid: true, dimension: "price_band", price_min_cents: 100_000 },
  { name: "price none", valid: false, dimension: "price_band" },
  { name: "price max<min", valid: false, dimension: "price_band", price_min_cents: 500_000, price_max_cents: 100_000 },
  { name: "price with value", valid: false, dimension: "price_band", price_min_cents: 100_000, value: "x" },
];

d("collector_interests (local Supabase)", () => {
  let service: SupabaseClient;
  let partyId: string;
  let artistId: string;
  const cleanupInterestIds: string[] = [];

  beforeAll(async () => {
    service = createClient(local!.url, local!.service, {
      auth: { persistSession: false },
    });
    const { data: party, error: pErr } = await service
      .from("parties")
      .insert({ kind: "person", display_name: "Interest Test Collector" })
      .select("id")
      .single();
    if (pErr) throw pErr;
    partyId = party!.id;

    const { data: artist, error: aErr } = await service
      .from("artists")
      .insert({ name: "Interest Test Artist", sort_name: "Artist, Interest Test" })
      .select("id")
      .single();
    if (aErr) throw aErr;
    artistId = artist!.id;
  });

  afterAll(async () => {
    if (cleanupInterestIds.length)
      await service.from("collector_interests").delete().in("id", cleanupInterestIds);
    await service.from("collector_interests").delete().eq("party_id", partyId);
    if (partyId) await service.from("parties").delete().eq("id", partyId);
    if (artistId) await service.from("artists").delete().eq("id", artistId);
  });

  it("DB CHECK and Zod superRefine agree on row shape in lockstep", async () => {
    for (const c of CASES) {
      const zod = interestSchema.safeParse(zodInputFromRow(c, artistId));
      expect(zod.success, `[zod] ${c.name}`).toBe(c.valid);

      const { data, error } = await service
        .from("collector_interests")
        .insert(dbRow(c, partyId, artistId))
        .select("id")
        .maybeSingle();
      const dbAccepted = !error;
      expect(dbAccepted, `[db] ${c.name}: ${error?.message ?? "accepted"}`).toBe(c.valid);
      if (data?.id) await service.from("collector_interests").delete().eq("id", data.id);
    }
  });

  it("blocks same-sentiment duplicates but allows multi-sentiment + distinct values", async () => {
    const artistSeeking = () =>
      service
        .from("collector_interests")
        .insert({ party_id: partyId, dimension: "artist", sentiment: "seeking", artist_id: artistId })
        .select("id")
        .single();

    const first = await artistSeeking();
    expect(first.error).toBeNull();
    cleanupInterestIds.push(first.data!.id);

    // Same (party, artist, sentiment) — a true accidental duplicate → blocked.
    const dup = await artistSeeking();
    expect(dup.error?.code).toBe("23505");

    // Same artist, DIFFERENT sentiment — the "owns 2 + seeking more" case → allowed.
    const owns = await service
      .from("collector_interests")
      .insert({ party_id: partyId, dimension: "artist", sentiment: "owns", artist_id: artistId })
      .select("id")
      .single();
    expect(owns.error).toBeNull();
    cleanupInterestIds.push(owns.data!.id);

    // Two DIFFERENT eras coexist; the same era twice (same sentiment) is blocked.
    const era1 = await service
      .from("collector_interests")
      .insert({ party_id: partyId, dimension: "era", sentiment: "seeking", value: "Baroque" })
      .select("id")
      .single();
    expect(era1.error).toBeNull();
    cleanupInterestIds.push(era1.data!.id);

    const era2 = await service
      .from("collector_interests")
      .insert({ party_id: partyId, dimension: "era", sentiment: "seeking", value: "Rococo" })
      .select("id")
      .single();
    expect(era2.error).toBeNull();
    cleanupInterestIds.push(era2.data!.id);

    const eraDup = await service
      .from("collector_interests")
      .insert({ party_id: partyId, dimension: "era", sentiment: "seeking", value: "Baroque" })
      .select("id")
      .single();
    expect(eraDup.error?.code).toBe("23505");
  });

  it("blocks deleting an artist that a collector interest references (on delete restrict)", async () => {
    // Dedicated throwaway artist so the block test doesn't disturb the shared one.
    const { data: victim } = await service
      .from("artists")
      .insert({ name: "Deletable Artist", sort_name: "Artist, Deletable" })
      .select("id")
      .single();
    const { data: interest } = await service
      .from("collector_interests")
      .insert({ party_id: partyId, dimension: "artist", sentiment: "watching", artist_id: victim!.id })
      .select("id")
      .single();

    const blocked = await service.from("artists").delete().eq("id", victim!.id);
    expect(blocked.error?.code).toBe("23503"); // foreign_key_violation

    // Remove the interest, then the artist is deletable again.
    await service.from("collector_interests").delete().eq("id", interest!.id);
    const ok = await service.from("artists").delete().eq("id", victim!.id);
    expect(ok.error).toBeNull();
  });
});
