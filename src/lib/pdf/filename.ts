// Download filenames for generated PDFs.
//
// The dealer already files factsheets she receives from other galleries as
// "Picasso, Pablo, Homme au béret basque, 1946 - EBC Fact Sheet + Comps.pdf".
// Ours matches that shape, so an exported tearsheet drops straight into the same
// folder and sorts next to its neighbours by artist:
//
//   Picasso, Pablo, Homme au béret basque, 1946 - Tearsheet.pdf
//
// Diacritics are preserved (the old client-side slug turned "béret" into
// "b-ret"); the ASCII transliteration only exists as the Content-Disposition
// fallback for HTTP header safety.

// Characters that are illegal or awkward in a filename on macOS/Windows, plus
// control characters. Leading dots are stripped separately (hidden files).
const ILLEGAL = /[/\\?%*:|"<>\u0000-\u001f\u007f]/g;

// Bound the name well under the 255-byte filesystem limit, leaving room for the
// suffix and for a browser's " (1)" de-duplication.
const MAX_STEM = 150;

function clean(part: string): string {
  return part.replace(ILLEGAL, " ").replace(/\s+/g, " ").trim();
}

/**
 * "Picasso, Pablo, Homme au béret basque, 1946 - Tearsheet.pdf"
 *
 * `artistSortName` is artists.sort_name ("Picasso, Pablo") — already in filing
 * order, so it is preferred. `artistName` ("Pablo Picasso") is the fallback for
 * artists with no sort_name; we do NOT try to invert it, because splitting a
 * display name into surname-first is wrong for mononyms, particles, and
 * suffixes, and a wrong name is worse than an unsorted one.
 */
export function tearsheetFilename(opts: {
  artistSortName?: string | null;
  artistName?: string | null;
  title?: string | null;
  year?: number | null;
}): string {
  const artist = clean(opts.artistSortName || opts.artistName || "");
  const title = clean(opts.title ?? "");
  const year = opts.year != null && Number.isFinite(opts.year) ? String(opts.year) : "";

  const stem = [artist, title, year].filter(Boolean).join(", ").slice(0, MAX_STEM).trim();
  // Every artwork has a title, so `stem` is effectively never empty — but a
  // whitespace-only title would otherwise produce a file named " - Tearsheet".
  return `${stem ? `${stem} - ` : ""}Tearsheet.pdf`;
}

/**
 * ASCII-only version of a filename, for the legacy `filename=` parameter of
 * Content-Disposition. Decomposes accented characters and drops the combining
 * marks so "béret" degrades to "beret" rather than "b-ret" or "b?ret".
 */
export function asciiFallbackFilename(filename: string): string {
  const stripped = filename
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    // Typographic punctuation the dealer's sources use: – — ’ “ ” …
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || "Tearsheet.pdf";
}

/**
 * A Content-Disposition value that survives the trip through HTTP headers with
 * the accents intact: an ASCII `filename=` for old clients plus an RFC 5987
 * `filename*=UTF-8''` that every current browser prefers.
 */
export function contentDispositionAttachment(filename: string): string {
  const ascii = asciiFallbackFilename(filename);
  // encodeURIComponent leaves !'()* unescaped, but RFC 5987's attr-char set
  // excludes them — percent-encode those too so the header can't be misparsed.
  const encoded = encodeURIComponent(filename).replace(
    /['()!*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Read the filename back off a Content-Disposition header, so a client that
 * downloads a PDF as a blob can name the file what the server named it instead
 * of inventing its own. Prefers the RFC 5987 `filename*` (accents intact).
 */
export function parseContentDispositionFilename(
  header: string | null | undefined,
): string | null {
  if (!header) return null;

  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (extended) {
    try {
      const decoded = decodeURIComponent(extended[1].trim());
      if (decoded) return decoded;
    } catch {
      // Malformed percent-encoding — fall through to the ASCII parameter.
    }
  }

  const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];

  const bare = /filename\s*=\s*([^;]+)/i.exec(header);
  return bare?.[1].trim() || null;
}
