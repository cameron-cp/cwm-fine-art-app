"use server";

import { revalidatePath } from "next/cache";
import { partySchema } from "@/lib/schemas/party";
import { getSupabaseServer } from "@/lib/supabase/server";

type Result<T> = { data: T } | { error: string };

function partyColumns(data: ReturnType<typeof partySchema.parse>) {
  return {
    kind: data.kind,
    display_name: data.display_name,
    legal_name: data.legal_name,
    email: data.email,
    phone: data.phone,
    address: data.address,
    notes: data.notes,
  };
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
