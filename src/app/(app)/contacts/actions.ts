"use server";

import { revalidatePath } from "next/cache";
import { partySchema } from "@/lib/schemas/party";
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
    notes: data.notes,
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
  const { error } = await supabase.from("parties").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/contacts");
  return { data: { id } };
}
