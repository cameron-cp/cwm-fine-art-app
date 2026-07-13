// Artist Authority Resolver — Wikidata + Getty ULAN. Import from here.
export { searchArtists } from "./wikidata";
export { resolveCandidate, mergeAuthorityRecords, normalizeToDisplayName } from "./resolve";
export { parseWikidataArtist, parseSearchResults } from "./wikidata";
export { parseGettyRecord } from "./getty";
export type { WikidataRecord } from "./wikidata";
export type { GettyRecord } from "./getty";
