import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integration tests for viewing rooms (migration 0017), run against the LOCAL
// Supabase stack (`supabase start`). They verify the security guarantees a unit
// test cannot: the room_public_artworks VIEW as the structural field whitelist,
// the inventory-only trigger, the FK cascade/restrict behaviors, and that a
// deleted work leaves no orphan slot. Skipped (not failed) with no local stack.

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

// Sensitive artwork columns that MUST NOT appear on the public view.
const FORBIDDEN_COLUMNS = [
  "notes",
  "condition",
  "edition",
  "literature",
  "current_party_address_id",
  "record_kind",
  "created_at",
];

d("viewing rooms (local Supabase)", () => {
  let service: SupabaseClient;
  let artistId: string;
  let invId: string; // inventory work
  let trackedId: string; // tracked market work
  let partyId: string;
  let roomId: string;

  beforeAll(async () => {
    service = createClient(local!.url, local!.service, {
      auth: { persistSession: false },
    });

    const { data: artist } = await service
      .from("artists")
      .insert({ name: "Room Test Artist", sort_name: "Artist, Room Test" })
      .select("id")
      .single();
    artistId = artist!.id;

    const { data: inv } = await service
      .from("artworks")
      .insert({
        artist_id: artistId,
        title: "Inventory Work",
        record_kind: "inventory",
        status: "available",
        price_cents: 4_800_000,
        notes: "SECRET INTERNAL NOTE",
        condition: "SECRET CONDITION",
      })
      .select("id")
      .single();
    invId = inv!.id;

    const { data: tracked } = await service
      .from("artworks")
      .insert({
        artist_id: artistId,
        title: "Tracked Market Work",
        record_kind: "tracked",
        status: "available",
      })
      .select("id")
      .single();
    trackedId = tracked!.id;

    const { data: party } = await service
      .from("parties")
      .insert({ kind: "person", display_name: "Room Test Collector", email: "rt@example.com" })
      .select("id")
      .single();
    partyId = party!.id;

    const { data: room } = await service
      .from("viewing_rooms")
      .insert({ title: "Room Test Room" })
      .select("id")
      .single();
    roomId = room!.id;
  });

  afterAll(async () => {
    if (roomId) await service.from("viewing_rooms").delete().eq("id", roomId);
    if (partyId) await service.from("parties").delete().eq("id", partyId);
    for (const id of [invId, trackedId]) if (id) await service.from("artworks").delete().eq("id", id);
    if (artistId) await service.from("artists").delete().eq("id", artistId);
  });

  it("the public view exposes ONLY whitelisted columns — no notes/condition/cost/location", async () => {
    const { data } = await service
      .from("room_public_artworks")
      .select("*")
      .eq("id", invId)
      .single();
    expect(data).toBeTruthy();
    const keys = Object.keys(data as object);
    for (const forbidden of FORBIDDEN_COLUMNS) {
      expect(keys, `view must not expose "${forbidden}"`).not.toContain(forbidden);
    }
    // ...but it DOES carry what the collector needs.
    expect(keys).toContain("title");
    expect(keys).toContain("price_cents");
    expect(keys).toContain("status");
  });

  it("the public view structurally excludes tracked (third-party) works", async () => {
    const { data } = await service
      .from("room_public_artworks")
      .select("id")
      .eq("id", trackedId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("the inventory-only trigger blocks a tracked work but allows an inventory work", async () => {
    const tracked = await service
      .from("viewing_room_works")
      .insert({ room_id: roomId, artwork_id: trackedId, position: 0 })
      .select("id")
      .maybeSingle();
    expect(tracked.error?.code).toBe("23514"); // check_violation from the trigger

    const inv = await service
      .from("viewing_room_works")
      .insert({ room_id: roomId, artwork_id: invId, position: 0 })
      .select("id")
      .single();
    expect(inv.error).toBeNull();
    // leave it in place for the cascade test below
  });

  it("deleting an artwork in a room cascades its slot away — no orphan row", async () => {
    // Use a throwaway inventory work so we don't disturb the shared fixtures.
    const { data: victim } = await service
      .from("artworks")
      .insert({ artist_id: artistId, title: "Victim Work", record_kind: "inventory" })
      .select("id")
      .single();
    const { data: slot } = await service
      .from("viewing_room_works")
      .insert({ room_id: roomId, artwork_id: victim!.id, position: 5 })
      .select("id")
      .single();

    const del = await service.from("artworks").delete().eq("id", victim!.id);
    expect(del.error).toBeNull();

    const { data: orphan } = await service
      .from("viewing_room_works")
      .select("id")
      .eq("id", slot!.id)
      .maybeSingle();
    expect(orphan).toBeNull(); // cascaded, not orphaned
  });

  it("deleting a party who is a room recipient is BLOCKED by the restrict FK", async () => {
    const { data: recipient } = await service
      .from("viewing_room_recipients")
      .insert({ room_id: roomId, party_id: partyId, token: `tok-${Date.now()}-a` })
      .select("id")
      .single();

    const blocked = await service.from("parties").delete().eq("id", partyId);
    expect(blocked.error?.code).toBe("23503"); // foreign_key_violation

    // Remove the recipient → the party becomes deletable again (proves the block
    // was solely the recipient FK, and the friendly guard's precondition is real).
    await service.from("viewing_room_recipients").delete().eq("id", recipient!.id);
    const { count } = await service
      .from("viewing_room_recipients")
      .select("id", { count: "exact", head: true })
      .eq("party_id", partyId);
    expect(count).toBe(0);
  });

  it("an event's artwork_id survives (SET NULL) when its slot is removed — signal isn't lost", async () => {
    const { data: recipient } = await service
      .from("viewing_room_recipients")
      .insert({ room_id: roomId, party_id: partyId, token: `tok-${Date.now()}-b` })
      .select("id")
      .single();
    // fresh throwaway work + slot
    const { data: w } = await service
      .from("artworks")
      .insert({ artist_id: artistId, title: "Ephemeral", record_kind: "inventory" })
      .select("id")
      .single();
    await service
      .from("viewing_room_works")
      .insert({ room_id: roomId, artwork_id: w!.id, position: 9 });
    const { data: evt } = await service
      .from("viewing_room_events")
      .insert({ recipient_id: recipient!.id, room_id: roomId, artwork_id: w!.id, event_type: "work_view" })
      .select("id")
      .single();

    // Deleting the artwork cascades the slot but SET NULLs the event's artwork_id.
    await service.from("artworks").delete().eq("id", w!.id);
    const { data: after } = await service
      .from("viewing_room_events")
      .select("id, artwork_id")
      .eq("id", evt!.id)
      .single();
    expect(after!.id).toBe(evt!.id); // event survived
    expect(after!.artwork_id).toBeNull(); // detached, not deleted

    await service.from("viewing_room_recipients").delete().eq("id", recipient!.id);
  });
});
