import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integration tests for upsert_canonical_artist, run against the LOCAL Supabase
// stack (`supabase start`). They verify the two properties a unit test can't:
// upsert idempotency (the shared authority cache must not duplicate rows) and the
// negative-authz guarantee (anon cannot call the SECURITY DEFINER RPC — proves the
// revoke-from-public,anon fix, which migration 0004 omitted for its own function).
//
// Skipped (not failed) when no local stack is reachable, so CI stays green.
// Mirrors invoice-rpc.test.ts.

type LocalEnv = { url: string; anon: string; service: string } | null;

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
    if (vars.API_URL && vars.ANON_KEY && vars.SERVICE_ROLE_KEY) {
      return { url: vars.API_URL, anon: vars.ANON_KEY, service: vars.SERVICE_ROLE_KEY };
    }
    return null;
  } catch {
    return null;
  }
}

const local = readLocalEnv();
const d = local ? describe : describe.skip;

const TEST_QID = "Q900000001";
const TEST_ULAN = "900000002";

function richterPayload(overrides: Record<string, unknown> = {}) {
  return {
    wikidata_qid: TEST_QID,
    ulan_id: TEST_ULAN,
    viaf_id: "98149412",
    preferred_name: "Test Richter",
    sort_name: "Richter, Test",
    birth_year: 1932,
    death_year: null,
    nationality_codes: ["DE"],
    gender: "male",
    roles: ["painter"],
    bio: "German painter",
    image_url: null,
    image_license: null,
    image_attribution: null,
    sources: { wikidata: "ok", getty: "ok" },
    ...overrides,
  };
}

d("upsert_canonical_artist (local Supabase)", () => {
  let service: SupabaseClient;
  let anon: SupabaseClient;

  beforeAll(() => {
    service = createClient(local!.url, local!.service, { auth: { persistSession: false } });
    anon = createClient(local!.url, local!.anon, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    await service
      .from("canonical_artists")
      .delete()
      .in("wikidata_qid", [TEST_QID, "Q900000003"]);
    await service.from("canonical_artists").delete().eq("ulan_id", "900000099");
  });

  it("is idempotent by QID: re-resolving the same artist returns the same row, not a duplicate", async () => {
    const first = await service.rpc("upsert_canonical_artist", { p: richterPayload() });
    expect(first.error).toBeNull();
    const second = await service.rpc("upsert_canonical_artist", {
      p: richterPayload({ bio: "German painter, updated" }),
    });
    expect(second.error).toBeNull();
    // Same primary key both times — the cache updated in place.
    expect(second.data).toBe(first.data);

    const { data: rows } = await service
      .from("canonical_artists")
      .select("id, bio")
      .eq("wikidata_qid", TEST_QID);
    expect(rows).toHaveLength(1);
    // The second call's fields won (update-in-place, not insert-ignore).
    expect(rows?.[0]?.bio).toBe("German painter, updated");
  });

  it("is idempotent by ULAN when there is no QID", async () => {
    const p = { ulan_id: "900000099", preferred_name: "Ulan Only", sort_name: "Only, Ulan" };
    const first = await service.rpc("upsert_canonical_artist", { p });
    expect(first.error).toBeNull();
    const second = await service.rpc("upsert_canonical_artist", { p });
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);

    const { count } = await service
      .from("canonical_artists")
      .select("*", { count: "exact", head: true })
      .eq("ulan_id", "900000099");
    expect(count).toBe(1);
  });

  it("does not raise a unique violation when a second QID carries the same ULAN (X16)", async () => {
    // The first writer keeps the ULAN; the second records sources.ulan_conflict and
    // still succeeds — a real Wikidata data-quality case must not break the resolve.
    const dup = await service.rpc("upsert_canonical_artist", {
      p: richterPayload({ wikidata_qid: "Q900000003", ulan_id: TEST_ULAN }),
    });
    expect(dup.error).toBeNull();
    const { data } = await service
      .from("canonical_artists")
      .select("ulan_id, sources")
      .eq("wikidata_qid", "Q900000003")
      .single();
    expect(data?.ulan_id).toBeNull();
    expect((data?.sources as { ulan_conflict?: string })?.ulan_conflict).toBe(TEST_ULAN);
  });

  it("a ULAN-only write does NOT overwrite a richer QID-owned row (F5)", async () => {
    // Seed a QID-owned row that also holds a ULAN.
    const seedUlan = "900000200";
    await service.rpc("upsert_canonical_artist", {
      p: richterPayload({ wikidata_qid: "Q900000200", ulan_id: seedUlan, preferred_name: "Rich Wikidata Name" }),
    });
    // Now a ULAN-only write hits the same ULAN with a sparser name.
    const res = await service.rpc("upsert_canonical_artist", {
      p: { ulan_id: seedUlan, preferred_name: "Sparse Getty Name", sort_name: "Getty, Sparse" },
    });
    expect(res.error).toBeNull();
    const { data } = await service
      .from("canonical_artists")
      .select("preferred_name, wikidata_qid")
      .eq("ulan_id", seedUlan)
      .single();
    // The QID-owned name must survive — a ULAN-only write cannot degrade it.
    expect(data?.preferred_name).toBe("Rich Wikidata Name");
    expect(data?.wikidata_qid).toBe("Q900000200");
    await service.from("canonical_artists").delete().eq("wikidata_qid", "Q900000200");
  });

  it("rejects upsert_canonical_artist from an anon client (negative authz — the 0004 revoke gap fixed)", async () => {
    const res = await anon.rpc("upsert_canonical_artist", { p: richterPayload() });
    expect(res.data).toBeNull();
    // Assert the REASON, not just "some error": Postgres raises 42501
    // (insufficient_privilege) → PostgREST surfaces code 42501 / "permission denied".
    // A looser check would pass on an unrelated failure and hide a real grant leak.
    expect(res.error).not.toBeNull();
    const reason = `${res.error?.code ?? ""} ${res.error?.message ?? ""}`.toLowerCase();
    expect(reason).toMatch(/42501|permission denied/);
  });
});
