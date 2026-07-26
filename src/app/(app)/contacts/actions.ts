"use server";

import { revalidatePath } from "next/cache";
import {
  partyRelationshipSchema,
  partySchema,
  type Party,
} from "@/lib/schemas/party";
import { publicEnv } from "@/lib/env";
import {
  createBillingPortalSession,
  createSetupCheckoutSession,
} from "@/lib/stripe/customers";
import { resolveStripeContext } from "@/lib/stripe/context";
import { getSupabaseServer } from "@/lib/supabase/server";

type Result<T> = { data: T } | { error: string };

type ParsedParty = ReturnType<typeof partySchema.parse>;

function partyColumns(data: ParsedParty) {
  return {
    kind: data.kind,
    display_name: data.display_name,
    legal_name: data.legal_name,
    entity_type: data.entity_type ?? null,
    email: data.email,
    phone: data.phone,
    website_url: data.website_url,
    linkedin_url: data.linkedin_url,
    notes: data.notes,
    is_unidentified: data.is_unidentified,
  };
}

// Sync a party's addresses while KEEPING existing rows' ids stable. This is the
// load-bearing guarantee behind artworks.current_party_address_id: the old
// delete-all-then-reinsert minted new uuids every save, which (via on delete set null)
// would null every artwork FK pointing at this party on any contact edit. Here we
// delete only removed rows, update the rest in place, and insert genuinely new ones.
// Positions are recomputed from array order for every row so reordering/removal stays
// consistent with the `.order("position")` reads.
async function syncAddresses(
  supabase: ReturnType<typeof getSupabaseServer>,
  partyId: string,
  addresses: ParsedParty["addresses"],
): Promise<{ error: string } | null> {
  const rows = addresses.map((a, position) => ({
    id: a.id,
    party_id: partyId,
    label: a.label,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    region: a.region,
    postal_code: a.postal_code,
    country_code: a.country_code,
    is_primary: a.is_primary,
    position,
  }));

  // Delete rows that existed before but are no longer submitted.
  const { data: existing, error: exErr } = await supabase
    .from("party_addresses")
    .select("id")
    .eq("party_id", partyId);
  if (exErr) return { error: exErr.message };

  const submittedIds = new Set(
    rows.map((r) => r.id).filter((id): id is string => Boolean(id)),
  );
  const toDelete = (existing ?? [])
    .map((r) => r.id as string)
    .filter((id) => !submittedIds.has(id));
  if (toDelete.length) {
    const { error } = await supabase.from("party_addresses").delete().in("id", toDelete);
    if (error) return { error: error.message };
  }

  // Clear all primaries first, so flipping the primary between two surviving rows can't
  // trip the partial unique index (party_addresses_one_primary_idx) mid-statement.
  const { error: clearErr } = await supabase
    .from("party_addresses")
    .update({ is_primary: false })
    .eq("party_id", partyId);
  if (clearErr) return { error: clearErr.message };

  // Update rows that carry an id (id preserved); insert rows without one.
  const updates = rows.filter((r) => r.id);
  const inserts = rows
    .filter((r) => !r.id)
    .map(({ id: _drop, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars

  if (updates.length) {
    const { error } = await supabase.from("party_addresses").upsert(updates);
    if (error) return { error: error.message };
  }
  if (inserts.length) {
    const { error } = await supabase.from("party_addresses").insert(inserts);
    if (error) return { error: error.message };
  }
  return null;
}

export async function createParty(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = partySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid contact" };
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("parties")
    .insert(partyColumns(parsed.data))
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (parsed.data.roles.length) {
    const { error: roleErr } = await supabase
      .from("party_roles")
      .insert(parsed.data.roles.map((role) => ({ party_id: data.id, role })));
    if (roleErr) return { error: roleErr.message };
  }

  const addrErr = await syncAddresses(supabase, data.id, parsed.data.addresses);
  if (addrErr) return addrErr;

  revalidatePath("/contacts");
  return { data };
}

export async function updateParty(
  id: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = partySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid contact" };
  }

  const supabase = getSupabaseServer();

  // parties_unidentified_no_stripe_customer (0022) rejects flagging a contact
  // that already has payment rails. Pre-check so she gets an actionable sentence
  // instead of a raw CHECK-violation string (deleteParty convention, below).
  if (parsed.data.is_unidentified) {
    const { data: existing } = await supabase
      .from("parties")
      .select("stripe_customer_id")
      .eq("id", id)
      .maybeSingle();
    if (existing?.stripe_customer_id) {
      return {
        error:
          "This contact has a saved payment method, so it can't be marked unidentified. Remove the card/bank on file first.",
      };
    }
  }

  const { error } = await supabase
    .from("parties")
    .update(partyColumns(parsed.data))
    .eq("id", id);
  if (error) return { error: error.message };

  // Replace the role set (roles are a small standing set per party).
  const { error: delErr } = await supabase
    .from("party_roles")
    .delete()
    .eq("party_id", id);
  if (delErr) return { error: delErr.message };
  if (parsed.data.roles.length) {
    const { error: roleErr } = await supabase
      .from("party_roles")
      .insert(parsed.data.roles.map((role) => ({ party_id: id, role })));
    if (roleErr) return { error: roleErr.message };
  }

  const addrErr = await syncAddresses(supabase, id, parsed.data.addresses);
  if (addrErr) return addrErr;

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  return { data: { id } };
}

export async function deleteParty(id: string): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();

  // A viewing-room recipient's party_id FK is `on delete restrict` (0017): every
  // recipient must stay attributable to a real contact. The raw FK error would be
  // an ugly Postgres string, so pre-check and surface a friendly, actionable
  // message instead — mirroring the addInterest / relationship-dup convention.
  const { count } = await supabase
    .from("viewing_room_recipients")
    .select("id", { count: "exact", head: true })
    .eq("party_id", id);
  if (count && count > 0) {
    return {
      error: `Remove this contact from ${count} viewing room${count === 1 ? "" : "s"} first.`,
    };
  }

  const { error } = await supabase.from("parties").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/contacts");
  return { data: { id } };
}

// --- Relationships (party_relationships, migration 0007) -------------------
//
// A directed edge from_party_id → to_party_id. Both parties' detail pages show
// it (the read query .or()s on either side), so every write revalidates BOTH
// endpoints. The table has no DB unique constraint or self-ref CHECK, so those
// guards live here; a future bulk import must route through these actions too.

// Reject an identical edge (same from/to/type). `excludeId` is set on update so a
// row never collides with itself (which would block every dates/notes-only edit).
async function relationshipExists(
  supabase: ReturnType<typeof getSupabaseServer>,
  edge: { from_party_id: string; to_party_id: string; type: string },
  excludeId?: string,
): Promise<{ exists: boolean } | { error: string }> {
  let q = supabase
    .from("party_relationships")
    .select("id")
    .eq("from_party_id", edge.from_party_id)
    .eq("to_party_id", edge.to_party_id)
    .eq("type", edge.type);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q.limit(1);
  if (error) return { error: error.message };
  return { exists: (data ?? []).length > 0 };
}

export async function createRelationship(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = partyRelationshipSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid relationship" };
  }
  const { from_party_id, to_party_id, type, valid_from, valid_to, notes } =
    parsed.data;
  const supabase = getSupabaseServer();

  const dup = await relationshipExists(supabase, {
    from_party_id,
    to_party_id,
    type,
  });
  if ("error" in dup) return { error: dup.error };
  if (dup.exists) return { error: "That relationship already exists." };

  const { data, error } = await supabase
    .from("party_relationships")
    .insert({ from_party_id, to_party_id, type, valid_from, valid_to, notes })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${from_party_id}`);
  revalidatePath(`/contacts/${to_party_id}`);
  return { data };
}

export async function updateRelationship(
  id: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = partyRelationshipSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid relationship" };
  }
  const { from_party_id, to_party_id, type, valid_from, valid_to, notes } =
    parsed.data;
  const supabase = getSupabaseServer();

  const dup = await relationshipExists(
    supabase,
    { from_party_id, to_party_id, type },
    id, // exclude self so a dates/notes-only edit isn't rejected by its own row
  );
  if ("error" in dup) return { error: dup.error };
  if (dup.exists) return { error: "That relationship already exists." };

  const { error } = await supabase
    .from("party_relationships")
    .update({ from_party_id, to_party_id, type, valid_from, valid_to, notes })
    .eq("id", id);
  if (error) return { error: error.message };

  // The edit form fixes the counterparty, so from/to are the same two parties
  // (possibly swapped) — revalidating both submitted ids covers both pages.
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${from_party_id}`);
  revalidatePath(`/contacts/${to_party_id}`);
  return { data: { id } };
}

export async function deleteRelationship(
  id: string,
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  // DELETE ... RETURNING both parties so we can revalidate the counterpart's page
  // (the action only receives the row id, not the endpoints).
  const { data, error } = await supabase
    .from("party_relationships")
    .delete()
    .eq("id", id)
    .select("from_party_id, to_party_id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${data.from_party_id}`);
  revalidatePath(`/contacts/${data.to_party_id}`);
  return { data: { id } };
}

// --- Stripe card/bank on file (migration 0013) -----------------------

async function loadPaymentParty(
  id: string,
): Promise<
  | { data: Pick<Party, "id" | "display_name" | "email" | "stripe_customer_id"> }
  | { error: string }
> {
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("parties")
    .select("id, display_name, email, stripe_customer_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { error: "Contact not found." };
  return {
    data: data as Pick<
      Party,
      "id" | "display_name" | "email" | "stripe_customer_id"
    >,
  };
}

// Start a setup-mode Checkout to save a card/bank on file for this contact.
export async function addPaymentMethod(
  id: string,
): Promise<Result<{ url: string }>> {
  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return { error: "NEXT_PUBLIC_APP_URL is not configured." };

  const party = await loadPaymentParty(id);
  if ("error" in party) return { error: party.error };

  const result = await createSetupCheckoutSession({
    party: party.data,
    appUrl,
    returnPath: `/contacts/${id}`,
    ctx: await resolveStripeContext(),
  });
  if ("error" in result) return { error: result.error };

  revalidatePath(`/contacts/${id}`);
  return { data: { url: result.data.url } };
}

// Open the Stripe Billing Portal to manage saved payment methods.
export async function openBillingPortal(
  id: string,
): Promise<Result<{ url: string }>> {
  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return { error: "NEXT_PUBLIC_APP_URL is not configured." };

  const party = await loadPaymentParty(id);
  if ("error" in party) return { error: party.error };

  const result = await createBillingPortalSession({
    party: party.data,
    appUrl,
    returnPath: `/contacts/${id}`,
    ctx: await resolveStripeContext(),
  });
  if ("error" in result) return { error: result.error };
  return { data: { url: result.data.url } };
}
