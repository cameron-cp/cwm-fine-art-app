import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTACT_ARTWORK_LINKS_SELECT } from "@/lib/artwork-parties/queries";
import { isCurrentOwner } from "@/lib/artwork-parties/summarize";
import {
  ARTWORK_DETAIL_SELECT,
  ARTWORK_SEARCH_SELECT,
  PARTY_WORK_LINKS_SELECT,
} from "@/lib/chat/tools";
import {
  artworkPartyConfidences,
  artworkPartyRoles,
  artworkPartySchema,
  artworkPartySources,
} from "@/lib/schemas/artwork-party";

// Integration tests for artwork_parties (migration 0019, renamed from
// artwork_ownerships/0016 and given a `role`). Run against the LOCAL Supabase
// stack (`supabase start`). They verify what a unit test cannot: that the role
// vocabulary in TypeScript and the DB CHECK are the SAME set, that the
// per-role open-link uniqueness rule behaves, that the interval CHECK and the
// Zod superRefine agree in lockstep, and — the load-bearing one — that a
// non-owner edge is never returned by an owner query.
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

// One logical interval case, used to drive BOTH halves of the parity check from
// a single source so the two can never silently describe different rows.
type IntervalCase = {
  name: string;
  valid: boolean;
  started_on: string | null;
  ended_on: string | null;
};

const INTERVAL_CASES: IntervalCase[] = [
  { name: "no dates", valid: true, started_on: null, ended_on: null },
  { name: "start only (open)", valid: true, started_on: "2001-01-01", ended_on: null },
  { name: "end only", valid: true, started_on: null, ended_on: "2009-01-01" },
  { name: "start before end", valid: true, started_on: "2001-01-01", ended_on: "2009-01-01" },
  { name: "same day", valid: true, started_on: "2001-01-01", ended_on: "2001-01-01" },
  { name: "end before start", valid: false, started_on: "2009-01-01", ended_on: "2001-01-01" },
];

d("artwork_parties (local Supabase)", () => {
  let service: SupabaseClient;
  let partyId: string;
  let artistId: string;
  let artworkId: string;
  const cleanupLinkIds: string[] = [];

  beforeAll(async () => {
    service = createClient(local!.url, local!.service, { auth: { persistSession: false } });

    const { data: party, error: pErr } = await service
      .from("parties")
      .insert({ kind: "person", display_name: "Link Test Collector" })
      .select("id")
      .single();
    if (pErr) throw pErr;
    partyId = party!.id;

    const { data: artist, error: aErr } = await service
      .from("artists")
      .insert({ name: "Link Test Artist", sort_name: "Artist, Link Test" })
      .select("id")
      .single();
    if (aErr) throw aErr;
    artistId = artist!.id;

    const { data: artwork, error: wErr } = await service
      .from("artworks")
      .insert({ artist_id: artistId, title: "Link Test Work" })
      .select("id")
      .single();
    if (wErr) throw wErr;
    artworkId = artwork!.id;
  });

  afterAll(async () => {
    if (cleanupLinkIds.length)
      await service.from("artwork_parties").delete().in("id", cleanupLinkIds);
    await service.from("artwork_parties").delete().eq("party_id", partyId);
    if (artworkId) await service.from("artworks").delete().eq("id", artworkId);
    if (partyId) await service.from("parties").delete().eq("id", partyId);
    if (artistId) await service.from("artists").delete().eq("id", artistId);
  });

  it("the TS role vocabulary and the DB CHECK are the same set", async () => {
    // Two sources of truth for the vocabulary; this is what keeps them equal.
    // A role added to the DB but not to TS would be unusable from the app; a
    // role added to TS but not the DB would fail on insert at runtime.
    for (const role of artworkPartyRoles) {
      const { data, error } = await service
        .from("artwork_parties")
        .insert({ artwork_id: artworkId, party_id: partyId, role, ended_on: "2000-01-01" })
        .select("id")
        .maybeSingle();
      expect(error, `[db] role '${role}' rejected: ${error?.message}`).toBeNull();
      if (data?.id) cleanupLinkIds.push(data.id);
    }

    const bogus = await service
      .from("artwork_parties")
      .insert({ artwork_id: artworkId, party_id: partyId, role: "landlord" })
      .select("id")
      .maybeSingle();
    expect(bogus.error?.code).toBe("23514"); // check_violation
    expect(artworkPartySchema.safeParse({ artwork_id: artworkId, role: "landlord" }).success).toBe(
      false,
    );
  });

  it("the TS source/confidence vocabularies match the DB CHECKs", async () => {
    for (const source of artworkPartySources) {
      const { data, error } = await service
        .from("artwork_parties")
        .insert({
          artwork_id: artworkId,
          party_id: partyId,
          role: "other",
          source,
          ended_on: "2000-02-01",
        })
        .select("id")
        .maybeSingle();
      expect(error, `[db] source '${source}': ${error?.message}`).toBeNull();
      if (data?.id) cleanupLinkIds.push(data.id);
    }
    for (const confidence of artworkPartyConfidences) {
      const { data, error } = await service
        .from("artwork_parties")
        .insert({
          artwork_id: artworkId,
          party_id: partyId,
          role: "other",
          confidence,
          ended_on: "2000-03-01",
        })
        .select("id")
        .maybeSingle();
      expect(error, `[db] confidence '${confidence}': ${error?.message}`).toBeNull();
      if (data?.id) cleanupLinkIds.push(data.id);
    }
  });

  it("accepts the minimal link — just a work, defaulting to owner", () => {
    // The feature's primary case ("she owns this") must not require a note, a
    // date, or an explicit role.
    const parsed = artworkPartySchema.safeParse({ artwork_id: artworkId });
    expect(parsed.success, parsed.error?.issues[0]?.message).toBe(true);
    expect(parsed.data).toMatchObject({
      role: "owner",
      source: "stated",
      confidence: "confirmed",
      started_on: null,
      ended_on: null,
      notes: null,
    });
  });

  it("DB interval CHECK and Zod superRefine agree in lockstep", async () => {
    for (const c of INTERVAL_CASES) {
      const zod = artworkPartySchema.safeParse({
        artwork_id: artworkId,
        role: "owner",
        started_on: c.started_on ?? "",
        ended_on: c.ended_on ?? "",
      });
      expect(zod.success, `[zod] ${c.name}`).toBe(c.valid);

      const { data, error } = await service
        .from("artwork_parties")
        .insert({
          artwork_id: artworkId,
          party_id: partyId,
          // 'lender' keeps these probes off the owner rows the other tests use.
          role: "lender",
          started_on: c.started_on,
          ended_on: c.ended_on,
        })
        .select("id")
        .maybeSingle();
      expect(!error, `[db] ${c.name}: ${error?.message ?? "accepted"}`).toBe(c.valid);
      if (data?.id) await service.from("artwork_parties").delete().eq("id", data.id);
    }
  });

  it("allows one party two roles on a work, but not the same open role twice", async () => {
    const owner = await service
      .from("artwork_parties")
      .insert({ artwork_id: artworkId, party_id: partyId, role: "owner" })
      .select("id")
      .single();
    expect(owner.error).toBeNull();
    cleanupLinkIds.push(owner.data!.id);

    // A collector who owns a work AND advises the gallery on it is a real case.
    const advisor = await service
      .from("artwork_parties")
      .insert({ artwork_id: artworkId, party_id: partyId, role: "advisor" })
      .select("id")
      .single();
    expect(advisor.error).toBeNull();
    cleanupLinkIds.push(advisor.data!.id);

    // The same open (work, party, role) twice is an accidental double-entry.
    const dup = await service
      .from("artwork_parties")
      .insert({ artwork_id: artworkId, party_id: partyId, role: "owner" })
      .select("id")
      .maybeSingle();
    expect(dup.error?.code).toBe("23505");

    // ...but a CLOSED owner row alongside the open one is title history.
    const past = await service
      .from("artwork_parties")
      .insert({
        artwork_id: artworkId,
        party_id: partyId,
        role: "owner",
        started_on: "1990-01-01",
        ended_on: "1995-01-01",
      })
      .select("id")
      .single();
    expect(past.error).toBeNull();
    cleanupLinkIds.push(past.data!.id);
  });

  it("an owner query never returns a non-owner link", async () => {
    // The bug this whole test file exists to prevent: telling the dealer a
    // collector owns a work they merely advise on. Seed a work whose ONLY link
    // is an advisor, then run the exact owner projection the app uses.
    const { data: work } = await service
      .from("artworks")
      .insert({ artist_id: artistId, title: "Advisor-Only Work" })
      .select("id")
      .single();
    const { data: link } = await service
      .from("artwork_parties")
      .insert({ artwork_id: work!.id, party_id: partyId, role: "advisor" })
      .select("id")
      .single();

    const { data: owners, error } = await service
      .from("artwork_parties")
      .select("role, ended_on")
      .eq("artwork_id", work!.id)
      .eq("role", "owner")
      .is("ended_on", null);
    expect(error).toBeNull();
    expect(owners).toEqual([]);

    // And the shared predicate agrees with the SQL filter.
    const { data: all } = await service
      .from("artwork_parties")
      .select("role, ended_on")
      .eq("artwork_id", work!.id);
    expect(all).toHaveLength(1);
    expect(all!.filter((r) => isCurrentOwner(r as never))).toEqual([]);

    await service.from("artwork_parties").delete().eq("id", link!.id);
    await service.from("artworks").delete().eq("id", work!.id);
  });

  it("every real select string the app ships actually runs, and keeps roles distinct", async () => {
    // These are the ACTUAL constants the contact page and the chat tools use,
    // imported not copied. The risky bit is `parties:artwork_parties(… party:
    // parties(…))` — an alias that shadows a real table name. A PostgREST parse
    // failure here would take out chat and the contact page at runtime with
    // nothing at build time to catch it.
    const { data: work } = await service
      .from("artworks")
      .insert({ artist_id: artistId, title: "Select Probe Work" })
      .select("id")
      .single();
    const { data: advisorParty } = await service
      .from("parties")
      .insert({ kind: "person", display_name: "Select Probe Advisor" })
      .select("id")
      .single();
    await service.from("artwork_parties").insert([
      { artwork_id: work!.id, party_id: partyId, role: "owner" },
      { artwork_id: work!.id, party_id: advisorParty!.id, role: "advisor" },
    ]);

    const search = await service
      .from("artworks")
      .select(ARTWORK_SEARCH_SELECT)
      .eq("id", work!.id)
      .single();
    expect(search.error?.message ?? null).toBeNull();
    const embedded = (search.data as unknown as { parties: { role: string }[] }).parties;
    expect(embedded.map((p) => p.role).sort()).toEqual(["advisor", "owner"]);

    const detail = await service
      .from("artworks")
      .select(ARTWORK_DETAIL_SELECT)
      .eq("id", work!.id)
      .single();
    expect(detail.error?.message ?? null).toBeNull();

    // get_party's read, from the ADVISOR's side: it must come back tagged
    // 'advisor', which is what stops the tool reporting it under currently_owns.
    const partyLinks = await service
      .from("artwork_parties")
      .select(PARTY_WORK_LINKS_SELECT)
      .eq("party_id", advisorParty!.id)
      .is("ended_on", null);
    expect(partyLinks.error?.message ?? null).toBeNull();
    expect(partyLinks.data).toHaveLength(1);
    expect((partyLinks.data![0] as { role: string }).role).toBe("advisor");

    const pageRead = await service
      .from("artwork_parties")
      .select(CONTACT_ARTWORK_LINKS_SELECT)
      .eq("party_id", partyId)
      .eq("artwork_id", work!.id);
    expect(pageRead.error?.message ?? null).toBeNull();
    expect(pageRead.data).toHaveLength(1);
    const linked = pageRead.data![0] as { role: string; artwork: { title: string } };
    expect(linked.role).toBe("owner");
    expect(linked.artwork.title).toBe("Select Probe Work");

    await service.from("artworks").delete().eq("id", work!.id);
    await service.from("parties").delete().eq("id", advisorParty!.id);
  });

  it("blocks deleting a party that still holds a link, and cascades on artwork delete", async () => {
    const { data: work } = await service
      .from("artworks")
      .insert({ artist_id: artistId, title: "Cascade Test Work" })
      .select("id")
      .single();
    const { data: victim } = await service
      .from("parties")
      .insert({ kind: "person", display_name: "Deletable Linked Party" })
      .select("id")
      .single();
    await service
      .from("artwork_parties")
      .insert({ artwork_id: work!.id, party_id: victim!.id, role: "owner" });

    // Title history must survive a careless contact delete (on delete restrict).
    const blocked = await service.from("parties").delete().eq("id", victim!.id);
    expect(blocked.error?.code).toBe("23503"); // foreign_key_violation

    // Deleting the WORK does take its links with it (on delete cascade).
    await service.from("artworks").delete().eq("id", work!.id);
    const { data: left } = await service
      .from("artwork_parties")
      .select("id")
      .eq("party_id", victim!.id);
    expect(left).toEqual([]);

    const ok = await service.from("parties").delete().eq("id", victim!.id);
    expect(ok.error).toBeNull();
  });
});
