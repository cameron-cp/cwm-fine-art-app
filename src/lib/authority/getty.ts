import { getServerEnv } from "@/lib/env";

// Getty ULAN source (keyless public SPARQL). Getty is a SECONDARY source: it fills
// gaps and supplies the inverted filing name. Its failure must NEVER fail a
// resolve (Getty ULAN's SPARQL endpoint returns "Service temporarily degraded"
// under load — observed live), so every path here degrades to null, and the
// orchestrator records sources.getty = 'unavailable'.

type Result<T> = { data: T } | { error: string };

const GETTY_SPARQL_URL = "https://vocab.getty.edu/sparql.json";
// Tight timeout: Getty is best-effort and sits on the resolve's critical path.
const GETTY_TIMEOUT_MS = 5000;

function userAgent(): string {
  return (
    getServerEnv().AUTHORITY_USER_AGENT ??
    "art-app-authority-resolver/1.0 (https://chloewaddington.com)"
  );
}

export function buildGettySparql(ulanId: string): string {
  const subject = `<http://vocab.getty.edu/ulan/${ulanId}>`;
  return `PREFIX gvp: <http://vocab.getty.edu/ontology#> PREFIX xl: <http://www.w3.org/2008/05/skos-xl#> PREFIX foaf: <http://xmlns.com/foaf/0.1/> PREFIX schema: <http://schema.org/> SELECT ?prefLabel (GROUP_CONCAT(DISTINCT ?alt; separator="||") AS ?altLabels) ?bio WHERE { OPTIONAL { ${subject} gvp:prefLabelGVP/xl:literalForm ?prefLabel. } OPTIONAL { ${subject} xl:altLabel/xl:literalForm ?alt. } OPTIONAL { ${subject} foaf:focus/gvp:biographyPreferred/schema:description ?bio. } } GROUP BY ?prefLabel ?bio`;
}

// --- Pure parser ---

export type GettyRecord = {
  // Getty's preferred label is the INVERTED filing form ("Richter, Gerhard").
  pref_label: string | null;
  alt_labels: string[];
  bio: string | null;
};

type SparqlBinding = Record<string, { value: string } | undefined>;
type SparqlResponse = { results?: { bindings?: SparqlBinding[] } };

export function parseGettyRecord(sparql: SparqlResponse): GettyRecord {
  const b = sparql.results?.bindings?.[0] ?? {};
  const alt = b.altLabels?.value
    ? b.altLabels.value.split("||").map((s) => s.trim()).filter((s) => s.length > 0)
    : [];
  return {
    pref_label: b.prefLabel?.value?.trim() || null,
    alt_labels: alt,
    bio: b.bio?.value?.trim() || null,
  };
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

export async function fetchUlanRecord(ulanId: string): Promise<Result<GettyRecord>> {
  if (!/^[0-9]+$/.test(ulanId)) return { error: "Invalid ULAN id" };
  const params = new URLSearchParams({ query: buildGettySparql(ulanId) });
  try {
    const res = await fetchWithTimeout(`${GETTY_SPARQL_URL}?${params}`, GETTY_TIMEOUT_MS);
    // Getty returns a 200 with a plain-text "Service temporarily degraded" body
    // when overloaded, so a non-JSON body is an expected failure, not a crash.
    const text = await res.text();
    if (!res.ok) return { error: `Getty query failed (${res.status})` };
    let json: SparqlResponse;
    try {
      json = JSON.parse(text) as SparqlResponse;
    } catch {
      return { error: "Getty returned a non-JSON response (degraded)" };
    }
    return { data: parseGettyRecord(json) };
  } catch {
    return { error: "Getty is unavailable" };
  }
}
