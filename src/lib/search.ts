// Helpers for URL-backed list search/filter on the server (RSC) side.

/**
 * Sanitize a raw search term for use inside a PostgREST filter value.
 *
 * PostgREST parses `.or()` / `.ilike()` argument strings, so commas and
 * parentheses in the term would break the filter grammar, and `%`/`_` are
 * `LIKE` wildcards the user didn't intend. We strip the grammar-breaking
 * characters and escape the wildcards, then trim. Returns "" when nothing
 * searchable remains (caller should skip filtering in that case).
 */
export function sanitizeSearch(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .replace(/[,()*]/g, " ") // grammar-breaking / glob chars → space
    .replace(/[%_]/g, "\\$&") // escape LIKE wildcards
    .replace(/\s+/g, " ")
    .trim();
}

/** First value when a search param arrives as string | string[] | undefined. */
export function firstParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}
