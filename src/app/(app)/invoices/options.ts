import { formatDimensions } from "@/lib/dimensions";
import { onlyContactableParties } from "@/lib/parties/contactable";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { ArtworkOption, PartyOption } from "./invoice-form";

// Shared loader for the invoice form's artwork + party option lists.
export async function getInvoiceFormOptions(): Promise<{
  artworkOptions: ArtworkOption[];
  partyOptions: PartyOption[];
}> {
  const supabase = getSupabaseServer();
  const [{ data: artworks }, { data: parties }] = await Promise.all([
    supabase
      .from("artworks")
      .select(
        "id, title, year, medium, edition, signature_details, catalogue_raisonne, provenance_lines, price_cents, currency, height_in, width_in, depth_in, artists(name)",
      )
      .order("title"),
    // An unidentified holder (0022) has no real bill-to; never offer it as a buyer.
    onlyContactableParties(
      supabase
        .from("parties")
        .select(
          "id, display_name, legal_name, email, party_addresses(id, label, line1, line2, city, region, postal_code, country_code, is_primary, position)",
        ),
    ).order("display_name"),
  ]);

  const artworkOptions: ArtworkOption[] = (artworks ?? []).map((a) => {
    const artists = a.artists as { name: string } | { name: string }[] | null;
    const artistName = Array.isArray(artists)
      ? (artists[0]?.name ?? null)
      : (artists?.name ?? null);
    return {
      id: a.id as string,
      title: a.title as string,
      year: a.year as number | null,
      medium: a.medium as string | null,
      edition: a.edition as string | null,
      signature_details: a.signature_details as string | null,
      catalogue_raisonne: a.catalogue_raisonne as string | null,
      provenance_lines: (a.provenance_lines as string[] | null) ?? [],
      price_cents: a.price_cents as number | null,
      currency: (a.currency as string) ?? "USD",
      artist_name: artistName,
      dimensions_text: formatDimensions(
        a.height_in as number | null,
        a.width_in as number | null,
        a.depth_in as number | null,
      ),
    };
  });

  const partyOptions: PartyOption[] = (parties ?? []).map((p) => {
    const rows = (p.party_addresses ?? []) as PartyOption["addresses"];
    return {
      id: p.id as string,
      display_name: p.display_name as string,
      legal_name: p.legal_name as string | null,
      email: p.email as string | null,
      // Primary first, then by saved position.
      addresses: [...rows].sort(
        (a, b) =>
          Number(b.is_primary) - Number(a.is_primary) || a.position - b.position,
      ),
    };
  });

  return { artworkOptions, partyOptions };
}
