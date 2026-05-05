import { z } from "zod";

const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().min(1).nullable(),
);

const optionalYear = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().min(1).max(3000).nullable(),
);

export const artistSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  birth_year: optionalYear,
  death_year: optionalYear,
  nationality: optionalText,
  bio: optionalText,
});

export type ArtistFormInput = z.input<typeof artistSchema>;
export type ArtistInput = z.output<typeof artistSchema>;

export type Artist = ArtistInput & {
  id: string;
  created_at: string;
  updated_at: string;
};
