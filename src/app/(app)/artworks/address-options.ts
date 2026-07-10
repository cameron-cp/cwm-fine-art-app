import { addressLines } from "@/lib/address";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { AddressOption } from "./artwork-form";

// party_addresses joined to its owning party, shaped for the artwork location picker.
// (Untyped Supabase client — the embed comes back as `party` object or array.)
type AddressRow = {
  id: string;
  label: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  party: { display_name: string } | { display_name: string }[] | null;
};

export async function fetchAddressOptions(
  supabase: ReturnType<typeof getSupabaseServer>,
): Promise<AddressOption[]> {
  const { data } = await supabase
    .from("party_addresses")
    .select(
      "id, label, line1, line2, city, region, postal_code, country_code, party:parties(display_name)",
    )
    .order("party_id")
    .order("position");

  const rows = (data ?? []) as unknown as AddressRow[];
  return rows.map((r) => {
    const party = Array.isArray(r.party) ? r.party[0] : r.party;
    return {
      id: r.id,
      partyName: party?.display_name ?? "—",
      label: r.label ?? "Address",
      oneLine: addressLines(r).join(", "),
    };
  });
}
