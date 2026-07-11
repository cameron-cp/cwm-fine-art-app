import { z } from "zod";
import { COUNTRY_CODES } from "@/lib/countries";

const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().min(1).nullable(),
);

const optionalYear = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().min(1).max(3000).nullable(),
);

// Derive a filing key from a display name: "Pablo Picasso" -> "Picasso, Pablo".
// Naive by design — last whitespace token is treated as the surname, the rest as
// given names. This is correct for most Western names and for hyphenated compound
// surnames ("Felix Gonzalez-Torres" -> "Gonzalez-Torres, Felix"), and it leaves
// mononyms untouched ("KAWS" -> "KAWS"). It is wrong for collectives ("Guerrilla
// Girls") and family-name-first cultures, which is why sort_name is always editable.
export function deriveSortName(displayName: string): string {
  const name = displayName.trim().replace(/\s+/g, " ");
  if (!name) return "";
  const lastSpace = name.lastIndexOf(" ");
  if (lastSpace === -1) return name;
  const surname = name.slice(lastSpace + 1);
  const given = name.slice(0, lastSpace);
  return `${surname}, ${given}`;
}

export const artistSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  // Optional in the form: blank means "derive from name" (handled server-side).
  sort_name: optionalText,
  birth_year: optionalYear,
  death_year: optionalYear,
  // Ordered ISO 3166-1 alpha-2 codes; index 0 is the primary nationality. The
  // adjective byline ("Cuban-American") is rendered from this order.
  nationalities: z.array(z.enum(COUNTRY_CODES)).default([]),
  bio: optionalText,
});

export type ArtistFormInput = z.input<typeof artistSchema>;
export type ArtistInput = z.output<typeof artistSchema>;

export type Artist = Omit<ArtistInput, "nationalities"> & {
  id: string;
  sort_name: string;
  nationalities: string[];
  created_at: string;
  updated_at: string;
};
