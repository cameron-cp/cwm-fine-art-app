import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onlyContactableParties } from "@/lib/parties/contactable";
import { partySchema } from "@/lib/schemas/party";

// Integration tests for parties.is_unidentified (migration 0022) against the
// LOCAL Supabase stack (`supabase start`). Skipped, not failed, when no local
// stack is reachable — the artwork-parties.test.ts convention.
//
// The business rule under test: an unidentified party is a holder the dealer
// knows exists but cannot name. It must stay a first-class node in the ownership
// graph (that's the whole reason it's a row and not a free-text note) while being
// structurally incapable of reaching an OUTWARD action — an invoice bill-to, a
// viewing-room invite email, a retainer charge. Those three read paths selected
// every party unconditionally before 0022, so a placeholder was billable and
// emailable; if a future edit drops one of these `.eq("is_unidentified", false)`
// filters, the picker assertions below fail.

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

d("parties.is_unidentified (local Supabase)", () => {
  let service: SupabaseClient;
  let namedId: string;
  let anonId: string;
  let artistId: string;
  let artworkId: string;

  beforeAll(async () => {
    service = createClient(local!.url, local!.service, { auth: { persistSession: false } });

    // The advisor: a real, contactable contact. This is the party she can act on.
    const { data: named, error: nErr } = await service
      .from("parties")
      .insert({
        kind: "organization",
        display_name: "Unident Test Advisory",
        email: "advisor@unident.test",
      })
      .select("id")
      .single();
    if (nErr) throw nErr;
    namedId = named!.id;

    // The holder behind them, per the advisor: geography only, no name.
    const { data: anon, error: aErr } = await service
      .from("parties")
      .insert({
        kind: "household",
        display_name: "Unident Test Private collection (Palm Beach, FL)",
        is_unidentified: true,
      })
      .select("id")
      .single();
    if (aErr) throw aErr;
    anonId = anon!.id;

    const { data: artist, error: arErr } = await service
      .from("artists")
      .insert({ name: "Unident Test Artist", sort_name: "Artist, Unident Test" })
      .select("id")
      .single();
    if (arErr) throw arErr;
    artistId = artist!.id;

    const { data: artwork, error: wErr } = await service
      .from("artworks")
      .insert({ artist_id: artistId, title: "Unident Test Work", record_kind: "tracked" })
      .select("id")
      .single();
    if (wErr) throw wErr;
    artworkId = artwork!.id;
  });

  afterAll(async () => {
    if (artworkId) {
      await service.from("artwork_parties").delete().eq("artwork_id", artworkId);
      await service.from("artworks").delete().eq("id", artworkId);
    }
    if (artistId) await service.from("artists").delete().eq("id", artistId);
    if (anonId) await service.from("parties").delete().eq("id", anonId);
    if (namedId) await service.from("parties").delete().eq("id", namedId);
  });

  it("defaults to false so every pre-0022 contact stays a normal, billable contact", async () => {
    const { data } = await service
      .from("parties")
      .select("is_unidentified")
      .eq("id", namedId)
      .single();
    expect(data!.is_unidentified).toBe(false);
  });

  // partySchema's optionalText fields require the key to be PRESENT (null is fine,
  // undefined is not), which is what the form always submits — so a realistic
  // payload, not a bare object.
  function formPayload(over: Record<string, unknown> = {}) {
    return {
      display_name: "Someone",
      legal_name: null,
      email: null,
      phone: null,
      website_url: null,
      linkedin_url: null,
      notes: null,
      ...over,
    };
  }

  it("carries the flag through Zod with the same false default as the DB", () => {
    // Omitting the key entirely must yield false, or an existing contact edited
    // through an older form payload would silently become unidentified.
    expect(partySchema.parse(formPayload()).is_unidentified).toBe(false);
    expect(
      partySchema.parse(formPayload({ is_unidentified: true })).is_unidentified,
    ).toBe(true);
  });

  // The payoff clause: this is why it's a row and not a note. Both edges hang off
  // real party ids, so the advisor is reachable AND the anonymous owner is a node
  // that later works and interests can attach to.
  it("can hold title (role='owner') alongside a named advisor on the same work", async () => {
    // Both rows spell out `confidence`: a PostgREST batch insert unions the keys
    // across rows and sends NULL for any a row omits, which defeats the column
    // DEFAULT and trips the NOT NULL. Not a schema problem — a client quirk.
    const { error } = await service.from("artwork_parties").insert([
      { artwork_id: artworkId, party_id: anonId, role: "owner", confidence: "tentative" },
      { artwork_id: artworkId, party_id: namedId, role: "advisor", confidence: "confirmed" },
    ]);
    expect(error).toBeNull();

    const { data: owners } = await service
      .from("artwork_parties")
      .select("party_id")
      .eq("artwork_id", artworkId)
      .eq("role", "owner")
      .is("ended_on", null);
    expect(owners!.map((o) => o.party_id)).toEqual([anonId]);
  });

  it("is barred from holding a Stripe customer, so it can never be charged", async () => {
    const { error } = await service
      .from("parties")
      .update({ stripe_customer_id: "cus_unident_test" })
      .eq("id", anonId);
    // parties_unidentified_no_stripe_customer — 23514 is check_violation.
    expect(error?.code).toBe("23514");
  });

  it("blocks flagging a contact that already has payment rails", async () => {
    const { error: setupErr } = await service
      .from("parties")
      .update({ stripe_customer_id: "cus_unident_named" })
      .eq("id", namedId);
    expect(setupErr).toBeNull();

    const { error } = await service
      .from("parties")
      .update({ is_unidentified: true })
      .eq("id", namedId);
    expect(error?.code).toBe("23514");

    await service.from("parties").update({ stripe_customer_id: null }).eq("id", namedId);
  });

  // --- The outward-action filter ---------------------------------------------

  // Exercises the SAME helper the three pickers call, so gutting
  // onlyContactableParties fails here. The companion source assertion below is
  // what catches a picker that stops calling it at all.
  it("is excluded by onlyContactableParties, while the named advisor survives", async () => {
    const { data } = await onlyContactableParties(
      service.from("parties").select("id"),
    ).in("id", [namedId, anonId]);
    expect(data!.map((p) => p.id)).toEqual([namedId]);
  });

  // The three pickers that select a party for an action with a real-world
  // consequence — bill, email, charge. A new picker of that kind belongs in this
  // list. Reading the source is the only way to assert the call site exists: these
  // are server components needing a Clerk-authed client, so they can't be invoked
  // from vitest.
  it.each([
    ["invoice buyer", "src/app/(app)/invoices/options.ts"],
    ["viewing-room recipient", "src/app/(app)/rooms/[id]/page.tsx"],
    ["retainer subscriber", "src/app/(app)/retainers/new/page.tsx"],
  ])("the %s picker routes its party query through the filter", (_label, file) => {
    const src = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(src).toContain("onlyContactableParties(");
    // No second, unfiltered read of parties hiding in the same file.
    expect(src.match(/\.from\("parties"\)/g)).toHaveLength(1);
  });

  // The counterpart: the CRM list and the Registrar chat deliberately do NOT
  // filter. If a future "tidy up Contacts" change starts hiding these rows, the
  // dealer loses the only surface that can rename them once she learns the name.
  it("stays visible to the Contacts list and the chat's party search", async () => {
    const { data } = await service
      .from("parties")
      .select("id, is_unidentified")
      .ilike("display_name", "%Palm Beach%");
    expect(data!.map((p) => p.id)).toContain(anonId);
  });
});
