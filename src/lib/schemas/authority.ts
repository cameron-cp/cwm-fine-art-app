import { z } from "zod";

// Artist Authority Resolver — shared schemas for the Wikidata + Getty ULAN flow.
// These are the app's trust boundary against crowd-edited authority data: every
// value that reaches the DB upsert or the client is validated here.

// A typeahead hit from Wikidata's wbsearchentities. The picker renders these.
export const authorityCandidateSchema = z.object({
  qid: z.string().regex(/^Q[0-9]+$/),
  label: z.string().min(1),
  description: z.string().nullable(),
});
export type AuthorityCandidate = z.infer<typeof authorityCandidateSchema>;

// The resolve route accepts ONLY a strict QID (X7 — P245/ulan is never a direct
// input; it is derived from Wikidata and re-validated in the parser).
export const resolveInputSchema = z.object({
  qid: z.string().regex(/^Q[0-9]+$/, "Expected a Wikidata QID like Q164351"),
});
export type ResolveInput = z.infer<typeof resolveInputSchema>;

// Getty's contribution status for one resolve, surfaced to the picker so it can
// show the right degraded note. 'ok' = merged, 'no_ulan' = artist has no ULAN,
// 'unavailable' = Getty errored/timed out (resolve still succeeded).
export const gettyStatusSchema = z.enum(["ok", "unavailable", "no_ulan"]);
export type GettyStatus = z.infer<typeof gettyStatusSchema>;

// Per-resolve provenance stored on the canonical row. ulan_conflict is added by
// the DB upsert when two QIDs claim one ULAN (X16); passthrough is allowed.
export const authoritySourcesSchema = z.object({
  wikidata: z.literal("ok"),
  getty: gettyStatusSchema,
  fetched_at: z.string(),
  ulan_conflict: z.string().optional(),
});
export type AuthoritySources = z.infer<typeof authoritySourcesSchema>;

// The merged, ready-to-persist authority record. Shape matches the
// upsert_canonical_artist(jsonb) payload 1:1 so the API route can pass it through.
export const resolvedArtistSchema = z.object({
  wikidata_qid: z.string().regex(/^Q[0-9]+$/).nullable(),
  ulan_id: z
    .string()
    .regex(/^[0-9]+$/)
    .nullable(),
  viaf_id: z.string().min(1).nullable(),
  preferred_name: z.string().trim().min(1),
  sort_name: z.string().trim().min(1),
  birth_year: z.number().int().nullable(),
  death_year: z.number().int().nullable(),
  // ISO 3166-1 alpha-2, ordered, [0] = primary. This is the Zod gate for the
  // nationality array shape the DB CHECK deliberately does not enforce.
  nationality_codes: z.array(z.string().regex(/^[A-Z]{2}$/)),
  gender: z.string().min(1).nullable(),
  roles: z.array(z.string().min(1)),
  bio: z.string().min(1).nullable(),
  image_url: z.string().url().nullable(),
  image_license: z.string().min(1).nullable(),
  image_attribution: z.string().min(1).nullable(),
  sources: authoritySourcesSchema,
});
export type ResolvedArtist = z.infer<typeof resolvedArtistSchema>;

// The subset the client form actually prefills. Emitted alongside the canonical id.
export type ResolvedArtistFields = Pick<
  ResolvedArtist,
  "preferred_name" | "sort_name" | "birth_year" | "death_year" | "nationality_codes" | "bio"
>;
