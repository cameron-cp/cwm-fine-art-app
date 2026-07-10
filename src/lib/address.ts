import { countryName } from "./countries";

// Structured address → flattened lines. Used to (a) render addresses in the UI
// and (b) snapshot the chosen address onto an invoice as immutable text (0007
// stores bill_to_address / ship_to as plain text). Generic, international-safe
// ordering: street, then locality line (city, region postal), then country.

export type AddressParts = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
};

export function addressLines(a: AddressParts): string[] {
  const lines: string[] = [];
  if (a.line1?.trim()) lines.push(a.line1.trim());
  if (a.line2?.trim()) lines.push(a.line2.trim());

  // "City, Region Postal" — join only the parts that exist.
  const locality = [a.city?.trim(), a.region?.trim()].filter(Boolean).join(", ");
  const localityLine = [locality, a.postal_code?.trim()].filter(Boolean).join(" ");
  if (localityLine) lines.push(localityLine);

  const country = countryName(a.country_code);
  if (country) lines.push(country);

  return lines;
}

// Newline-joined form for text snapshots / <TextArea> defaults.
export function formatAddress(a: AddressParts): string {
  return addressLines(a).join("\n");
}
