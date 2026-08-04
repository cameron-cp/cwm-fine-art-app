import { describe, expect, it } from "vitest";
import {
  asciiFallbackFilename,
  contentDispositionAttachment,
  parseContentDispositionFilename,
  tearsheetFilename,
} from "../filename";

// The dealer files factsheets as "Artist surname, forename, Title, Year - <doc>.pdf".
// Downloads have to land in that folder already named correctly, and the accents
// have to survive — the bug being fixed here shipped
// "homme-au-b-ret-basque-tearsheet.pdf", which is both unfilable and misspells
// the work.

describe("tearsheetFilename", () => {
  it("matches the dealer's filing convention, accents intact", () => {
    expect(
      tearsheetFilename({
        artistSortName: "Picasso, Pablo",
        artistName: "Pablo Picasso",
        title: "Homme au béret basque",
        year: 1946,
      }),
    ).toBe("Picasso, Pablo, Homme au béret basque, 1946 - Tearsheet.pdf");
  });

  it("prefers sort_name over the display name, so the file sorts by surname", () => {
    // Sorting a folder of tearsheets is the whole point of the convention: a
    // filename starting "Pablo" files under P-for-Pablo, next to nothing.
    const name = tearsheetFilename({
      artistSortName: "Guston, Philip",
      artistName: "Philip Guston",
      title: "Migration",
      year: 1978,
    });
    expect(name.startsWith("Guston, Philip")).toBe(true);
  });

  it("falls back to the display name rather than guessing a surname", () => {
    // Never invert a display name: "Christo", "van Gogh, Vincent", "Rembrandt"
    // and "Smith Jr., John" all break naive splitting, and a wrongly-inverted
    // artist name on a client-facing document is worse than an unsorted one.
    expect(
      tearsheetFilename({ artistSortName: null, artistName: "Christo", title: "Wrapped Reichstag" }),
    ).toBe("Christo, Wrapped Reichstag - Tearsheet.pdf");
  });

  it("omits missing parts instead of leaving empty separators", () => {
    expect(tearsheetFilename({ title: "Untitled" })).toBe("Untitled - Tearsheet.pdf");
    expect(tearsheetFilename({})).toBe("Tearsheet.pdf");
    // A whitespace-only title must not produce " - Tearsheet.pdf".
    expect(tearsheetFilename({ title: "   " })).toBe("Tearsheet.pdf");
  });

  it("strips characters that would break the download or nest a directory", () => {
    // "/" in a filename is the difference between a download and a silently
    // mangled path; ":" is a legacy path separator on macOS.
    const name = tearsheetFilename({
      artistSortName: "Doe, Jane",
      title: 'Study #3 / "Blue": Take 2',
      year: 2001,
    });
    expect(name).not.toMatch(/[/\\:"?*|<>]/);
    expect(name).toBe("Doe, Jane, Study #3 Blue Take 2, 2001 - Tearsheet.pdf");
  });

  it("stays inside the 255-byte filesystem name limit", () => {
    const name = tearsheetFilename({
      artistSortName: "Longname, Artist",
      title: "T".repeat(400),
      year: 1999,
    });
    expect(name.length).toBeLessThanOrEqual(200);
    expect(name.endsWith("Tearsheet.pdf")).toBe(true);
  });
});

describe("asciiFallbackFilename", () => {
  it("transliterates rather than deleting the letter", () => {
    // "b-ret" / "bret" are both wrong; the fallback must still read as the title.
    expect(asciiFallbackFilename("Homme au béret basque")).toBe("Homme au beret basque");
  });

  it("normalises the typographic punctuation her sources use", () => {
    expect(asciiFallbackFilename("August – November 1998 … ’98")).toBe(
      "August - November 1998 ... '98",
    );
  });

  it("never emits a quote or backslash that could break the header", () => {
    expect(asciiFallbackFilename('a"b\\c.pdf')).toBe("abc.pdf");
  });
});

describe("contentDispositionAttachment", () => {
  const header = contentDispositionAttachment(
    "Picasso, Pablo, Homme au béret basque, 1946 - Tearsheet.pdf",
  );

  it("carries both an ASCII filename and the UTF-8 original", () => {
    expect(header).toContain('filename="Picasso, Pablo, Homme au beret basque, 1946 - Tearsheet.pdf"');
    expect(header).toContain("filename*=UTF-8''");
  });

  it("emits a header safe to put on the wire", () => {
    // Latin-1 is the header charset: a raw "é" here is what corrupts the name.
    expect(header).toMatch(/^[\x20-\x7e]+$/);
  });

  it("percent-encodes the characters RFC 5987 excludes from attr-char", () => {
    const h = contentDispositionAttachment("Doe, Jane, Study (I)!, 2001 - Tearsheet.pdf");
    const encoded = h.split("UTF-8''")[1];
    expect(encoded).not.toMatch(/[()!'*]/);
  });

  it("round-trips through the client-side parser", () => {
    expect(parseContentDispositionFilename(header)).toBe(
      "Picasso, Pablo, Homme au béret basque, 1946 - Tearsheet.pdf",
    );
  });
});

describe("parseContentDispositionFilename", () => {
  it("prefers filename* so the accented name wins", () => {
    expect(
      parseContentDispositionFilename(
        `attachment; filename="Homme au beret basque.pdf"; filename*=UTF-8''Homme%20au%20b%C3%A9ret%20basque.pdf`,
      ),
    ).toBe("Homme au béret basque.pdf");
  });

  it("falls back to the quoted parameter when filename* is malformed", () => {
    // A bare "%" is invalid percent-encoding; decodeURIComponent throws.
    expect(
      parseContentDispositionFilename(
        `attachment; filename="invoice-CWFA1042.pdf"; filename*=UTF-8''bad%zz`,
      ),
    ).toBe("invoice-CWFA1042.pdf");
  });

  it("reads an unquoted parameter", () => {
    expect(parseContentDispositionFilename("attachment; filename=viewing-room.pdf")).toBe(
      "viewing-room.pdf",
    );
  });

  it("returns null when there is nothing to read, so the caller can default", () => {
    expect(parseContentDispositionFilename(null)).toBeNull();
    expect(parseContentDispositionFilename("attachment")).toBeNull();
  });
});
