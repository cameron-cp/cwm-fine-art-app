import { getServerEnv } from "@/lib/env";
import type { AuthorityCandidate } from "@/lib/schemas/authority";

// Wikidata source. Two keyless public endpoints:
//   * wbsearchentities (Action API) — typeahead search.
//   * SPARQL (query.wikidata.org) — structured facts by QID.
// Network functions return { data } | { error } and never throw on an expected
// upstream failure (mirrors src/lib/email). The parser is pure and unit-tested.

type Result<T> = { data: T } | { error: string };
// Resolve failures carry a kind so the API route maps them to a status without
// string-matching the message: not_found → 422, upstream → 502.
export type WikidataError = { error: string; kind: "not_found" | "upstream" };

const SEARCH_URL = "https://www.wikidata.org/w/api.php";
const SPARQL_URL = "https://query.wikidata.org/sparql";
const SEARCH_TIMEOUT_MS = 5000;
const SPARQL_TIMEOUT_MS = 8000;

// Wikimedia Commons is the only host we accept a P18 image from (X8). Authority
// images are never shown on tearsheets; this guard keeps a spoofed P18 value from
// even being stored.
const COMMONS_HOSTS = new Set(["commons.wikimedia.org", "upload.wikimedia.org"]);

function userAgent(): string {
  // Wikimedia etiquette requires a descriptive UA. Overridable via env; safe default.
  return (
    getServerEnv().AUTHORITY_USER_AGENT ??
    "art-app-authority-resolver/1.0 (https://chloewaddington.com)"
  );
}

// --- SPARQL query (kept in one place so the live query and the fixtures match) ---

export function buildArtistSparql(qid: string): string {
  return `SELECT ?nameLabel ?birth ?death ?genderLabel ?ulan ?viaf ?image (GROUP_CONCAT(DISTINCT ?iso; separator="|") AS ?isoCodes) (GROUP_CONCAT(DISTINCT ?occ; separator="|") AS ?occupations) WHERE { OPTIONAL { wd:${qid} rdfs:label ?nameLabel. FILTER(lang(?nameLabel)="en") } OPTIONAL { wd:${qid} wdt:P569 ?birth. } OPTIONAL { wd:${qid} wdt:P570 ?death. } OPTIONAL { wd:${qid} wdt:P21 ?g. ?g rdfs:label ?genderLabel. FILTER(lang(?genderLabel)="en") } OPTIONAL { wd:${qid} wdt:P27 ?c. ?c wdt:P297 ?iso. } OPTIONAL { wd:${qid} wdt:P106 ?o. ?o rdfs:label ?occ. FILTER(lang(?occ)="en") } OPTIONAL { wd:${qid} wdt:P245 ?ulan. } OPTIONAL { wd:${qid} wdt:P214 ?viaf. } OPTIONAL { wd:${qid} wdt:P18 ?image. } } GROUP BY ?nameLabel ?birth ?death ?genderLabel ?ulan ?viaf ?image`;
}

// --- Pure parser (deterministic → unit-tested, not a model call) ---

export type WikidataRecord = {
  wikidata_qid: string;
  preferred_name: string | null; // natural display order, from rdfs:label
  birth_year: number | null;
  death_year: number | null;
  nationality_codes: string[]; // ISO alpha-2, SPARQL order preserved, [0] = primary
  gender: string | null;
  roles: string[];
  ulan_id: string | null; // validated ^[0-9]+$ here; a malformed P245 is treated as absent
  viaf_id: string | null;
  image_url: string | null; // only if host ∈ Commons allowlist
};

type SparqlBinding = Record<string, { value: string } | undefined>;
type SparqlResponse = { results?: { bindings?: SparqlBinding[] } };

// "1932-02-09T00:00:00Z" → 1932; "-0500-01-01..." → -500; absent → null.
function yearFromIso(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/^(-?\d+)/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function splitPipes(value: string | undefined): string[] {
  if (!value) return [];
  return value.split("|").map((s) => s.trim()).filter((s) => s.length > 0);
}

function commonsImageOrNull(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const host = new URL(value).hostname;
    return COMMONS_HOSTS.has(host) ? value : null;
  } catch {
    return null;
  }
}

export function parseWikidataArtist(sparql: SparqlResponse, qid: string): WikidataRecord {
  // A multi-statement artist (e.g. two P569 dates, or the P27×P106 cross-product)
  // returns MORE THAN ONE binding. Aggregate across all of them deterministically
  // rather than trusting bindings[0]'s arbitrary order (F3):
  //   * single-valued fields → first non-empty value in binding order
  //   * birth → earliest year, death → latest year (stable, precision-agnostic)
  //   * nationality / roles → order-preserving union across bindings
  const bindings = sparql.results?.bindings ?? [];

  const pick = (key: string): string | undefined => {
    for (const b of bindings) {
      const v = b[key]?.value?.trim();
      if (v) return v;
    }
    return undefined;
  };

  const years = (key: string): number[] =>
    bindings
      .map((b) => yearFromIso(b[key]?.value))
      .filter((n): n is number => n !== null);
  const births = years("birth");
  const deaths = years("death");

  const unionPipes = (key: string): string[] => {
    const seen: string[] = [];
    for (const b of bindings) {
      for (const raw of splitPipes(b[key]?.value)) {
        if (!seen.includes(raw)) seen.push(raw);
      }
    }
    return seen;
  };

  // P245 (ULAN) is crowd-edited/untrusted — validate its shape HERE, before it is
  // ever used to build a Getty query (X7-residual). A malformed value = no ULAN.
  const rawUlan = pick("ulan");
  const ulan_id = rawUlan && /^[0-9]+$/.test(rawUlan) ? rawUlan : null;

  return {
    wikidata_qid: qid,
    preferred_name: pick("nameLabel") ?? null,
    birth_year: births.length ? Math.min(...births) : null,
    death_year: deaths.length ? Math.max(...deaths) : null,
    // Uppercase + keep only well-formed alpha-2 codes; preserve first-seen order (C3).
    nationality_codes: unionPipes("isoCodes")
      .map((c) => c.toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c)),
    gender: pick("genderLabel") ?? null,
    roles: unionPipes("occupations"),
    ulan_id,
    viaf_id: pick("viaf") ?? null,
    image_url: commonsImageOrNull(pick("image")),
  };
}

// Pure transform for the typeahead response (extracted so it is unit-testable
// against the captured search fixture, F2).
export function parseSearchResults(json: {
  search?: { id: string; label?: string; description?: string }[];
}): AuthorityCandidate[] {
  return (json.search ?? [])
    .filter((s) => /^Q[0-9]+$/.test(s.id) && Boolean(s.label))
    .map((s) => ({ qid: s.id, label: s.label as string, description: s.description ?? null }));
}

// --- Network ---

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": userAgent(), Accept: "application/sparql-results+json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function searchArtists(query: string): Promise<Result<AuthorityCandidate[]>> {
  const q = query.trim();
  if (q.length < 2) return { data: [] };
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: q,
    language: "en",
    uselang: "en",
    type: "item",
    limit: "8",
    format: "json",
  });
  try {
    const res = await fetchWithTimeout(`${SEARCH_URL}?${params}`, SEARCH_TIMEOUT_MS);
    if (!res.ok) return { error: `Wikidata search failed (${res.status})` };
    const json = (await res.json()) as {
      search?: { id: string; label?: string; description?: string }[];
    };
    return { data: parseSearchResults(json) };
  } catch {
    return { error: "Wikidata search is unavailable" };
  }
}

export async function fetchWikidataArtist(
  qid: string,
): Promise<{ data: WikidataRecord } | WikidataError> {
  // Re-validate at the network boundary (defense-in-depth, mirroring Getty's ULAN
  // guard): qid is interpolated into the SPARQL string, so a malformed value must
  // never reach the query builder even if a future caller skips the route's Zod gate.
  if (!/^Q[0-9]+$/.test(qid)) return { error: "Invalid Wikidata QID", kind: "not_found" };
  const params = new URLSearchParams({ query: buildArtistSparql(qid), format: "json" });
  try {
    const res = await fetchWithTimeout(`${SPARQL_URL}?${params}`, SPARQL_TIMEOUT_MS);
    if (!res.ok) return { error: `Wikidata query failed (${res.status})`, kind: "upstream" };
    const json = (await res.json()) as SparqlResponse;
    const record = parseWikidataArtist(json, qid);
    // No English label at all → the QID isn't a usable artist record.
    if (!record.preferred_name) return { error: "No Wikidata record for that id", kind: "not_found" };
    return { data: record };
  } catch {
    return { error: "Wikidata is unavailable", kind: "upstream" };
  }
}
