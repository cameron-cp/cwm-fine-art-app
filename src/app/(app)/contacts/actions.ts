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

// Replace the full address set for a party (delete + reinsert). Positions
// reflect array order; is_primary is normalized by partySchema's transform.
async function replaceAddresses(
  supabase: ReturnType<typeof getSupabaseServer>,
  partyId: string,
  addresses: ParsedParty["addresses"],
): Promise<{ error: string } | null> {
  const { error: delErr } = await supabase
    .from("party_addresses")
    .delete()
    .eq("party_id", partyId);
  if (delErr) return { error: delErr.message };

  if (!addresses.length) return null;

  const { error } = await supabase.from("party_addresses").insert(
    addresses.map((a, position) => ({
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
    })),
  );
  return error ? { error: error.message } : null;
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

  const addrErr = await replaceAddresses(supabase, data.id, parsed.data.addresses);
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

  const addrErr = await replaceAddresses(supabase, id, parsed.data.addresses);
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
