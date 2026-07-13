import { deriveSortName } from "@/lib/schemas/artist";
import type { ResolvedArtist } from "@/lib/schemas/authority";
import { fetchUlanRecord, type GettyRecord } from "./getty";
import { fetchWikidataArtist, type WikidataError, type WikidataRecord } from "./wikidata";

// Inverse of deriveSortName: "Richter, Gerhard" → "Gerhard Richter". Used only to
// rescue a display name from Getty's inverted form when Wikidata has none — so an
// inverted term NEVER lands in preferred_name (C1). Mononyms (no comma) pass through.
export function normalizeToDisplayName(s: string): string {
  const name = s.trim().replace(/\s+/g, " ");
  const comma = name.indexOf(",");
  if (comma === -1) return name;
  const surname = name.slice(0, comma).trim();
  const given = name.slice(comma + 1).trim();
  if (!given) return surname;
  return `${given} ${surname}`;
}

// Precedence, explicit (C1):
//   * preferred_name (display) = Wikidata's natural-order label. Only if Wikidata
//     lacks one do we normalize Getty's inverted pref label to natural order.
//   * sort_name = Getty's inverted pref label if present, else deriveSortName(name).
//   * dates / nationality / gender / roles / image / ids = Wikidata.
//   * bio = Getty (Wikidata SPARQL carries no biography here) — Getty fills the gap.
export function mergeAuthorityRecords(
  wd: WikidataRecord,
  getty: GettyRecord | null,
  gettyStatus: "ok" | "unavailable" | "no_ulan",
): ResolvedArtist {
  const preferred_name =
    wd.preferred_name ??
    (getty?.pref_label ? normalizeToDisplayName(getty.pref_label) : "");

  const sort_name = getty?.pref_label?.trim() || deriveSortName(preferred_name);

  return {
    wikidata_qid: wd.wikidata_qid,
    ulan_id: wd.ulan_id,
    viaf_id: wd.viaf_id,
    preferred_name,
    sort_name,
    birth_year: wd.birth_year,
    death_year: wd.death_year,
    nationality_codes: wd.nationality_codes,
    gender: wd.gender,
    roles: wd.roles,
    bio: getty?.bio ?? null,
    image_url: wd.image_url,
    // License is unknown from P18 alone (each Commons file has its own); we store
    // only a generic attribution. Authority images are never shown on tearsheets.
    image_license: null,
    image_attribution: wd.image_url ? "Wikimedia Commons" : null,
    sources: {
      wikidata: "ok",
      getty: gettyStatus,
      fetched_at: new Date().toISOString(),
    },
  };
}

// Orchestrate a full resolve for one Wikidata QID. Wikidata is required (its
// failure → { error } → 502 at the route). Getty is best-effort: any failure
// degrades to a Wikidata-only record with sources.getty = 'unavailable'.
// The Wikidata→Getty order is a real data dependency (Getty needs the P245 ULAN
// from Wikidata), so the chain is intentionally sequential.
export async function resolveCandidate(
  qid: string,
): Promise<{ data: ResolvedArtist } | WikidataError> {
  const wd = await fetchWikidataArtist(qid);
  if ("error" in wd) return wd;

  if (!wd.data.ulan_id) {
    return { data: mergeAuthorityRecords(wd.data, null, "no_ulan") };
  }

  const getty = await fetchUlanRecord(wd.data.ulan_id);
  if ("error" in getty) {
    return { data: mergeAuthorityRecords(wd.data, null, "unavailable") };
  }
  return { data: mergeAuthorityRecords(wd.data, getty.data, "ok") };
}
