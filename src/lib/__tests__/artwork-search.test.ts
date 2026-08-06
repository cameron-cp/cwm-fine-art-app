import { describe, expect, it } from "vitest";
import {
  ARTWORK_SEARCH_MAX_TOKENS,
  ARTWORK_SEARCH_MIN_CHARS,
  artworkDescriptor,
  artworkRef,
  buildArtworkSearchQuery,
  foldSearchText,
  markAmbiguous,
} from "@/lib/artwork-search";
import { artworkStatus } from "@/lib/schemas/artwork";

// The tokenizer is deliberately in TypeScript rather than SQL (see the module
// header and migration 0021) precisely so it can be pinned here. Every
// assertion below encodes a search that would silently return the WRONG rows if
// the rule changed — a search bug reads as "she doesn't own that work".

describe("foldSearchText", () => {
  // Postgres builds artworks.search_text with lower(f_unaccent(...)). If the two
  // sides fold differently, typing "miro" cannot match the stored "miró" and the
  // work looks absent from her own inventory.
  it("folds diacritics and case the way the SQL haystack does", () => {
    expect(foldSearchText("Miró")).toBe("miro");
    expect(foldSearchText("BÉRET Basque")).toBe("beret basque");
    expect(foldSearchText("Homme au béret basque")).toBe("homme au beret basque");
  });
});

describe("buildArtworkSearchQuery", () => {
  // One character matches essentially every work. Searching on it would return an
  // arbitrary slice of the whole inventory and present it as "results".
  it(`refuses to search below ${ARTWORK_SEARCH_MIN_CHARS} characters`, () => {
    const q = buildArtworkSearchQuery("p");
    expect(q.searchable).toBe(false);
    expect(q.patterns).toEqual([]);
  });

  it("searches at exactly the minimum length", () => {
    expect(buildArtworkSearchQuery("pi").searchable).toBe(true);
  });

  // The haystack concatenates artist + title + year + medium + edition in a fixed
  // order the dealer will never type in. AND-ing one pattern per token is what
  // makes an out-of-order query like "richter 1998" find the work.
  it("emits one AND-able pattern per token, order-independent", () => {
    expect(buildArtworkSearchQuery("richter 1998").patterns).toEqual([
      "%richter%",
      "%1998%",
    ]);
    expect(buildArtworkSearchQuery("1998 richter").patterns).toEqual([
      "%1998%",
      "%richter%",
    ]);
  });

  // A typed % is a LIKE wildcard. Unescaped, searching "50%" would match every
  // work in the inventory instead of the one whose edition says 50%.
  it("escapes LIKE metacharacters so typed wildcards stay literal", () => {
    expect(buildArtworkSearchQuery("50%").patterns).toEqual(["%50\\%%"]);
    expect(buildArtworkSearchQuery("a_b").patterns).toEqual(["%a\\_b%"]);
    expect(buildArtworkSearchQuery("back\\slash").patterns).toEqual(["%back\\\\slash%"]);
  });

  // The RPC declares `max_tokens constant int := 8` and emits at most that many
  // predicates. If the client sent more, the extras would be silently dropped by
  // SQL while the caller believed it had narrowed the search further.
  it(`caps tokens at ${ARTWORK_SEARCH_MAX_TOKENS}, matching the SQL backstop`, () => {
    const q = buildArtworkSearchQuery("a1 b2 c3 d4 e5 f6 g7 h8 i9 j10");
    expect(q.patterns).toHaveLength(ARTWORK_SEARCH_MAX_TOKENS);
    expect(q.patterns[0]).toBe("%a1%");
  });

  // rank feeds similarity() for artist relevance, which is what keeps one
  // artist's works contiguous so the picker can group them under a header.
  it("collapses whitespace into the rank string", () => {
    expect(buildArtworkSearchQuery("  gerhard   richter ").rank).toBe("gerhard richter");
  });
});

describe("markAmbiguous", () => {
  // An artist with fourteen works called "Untitled" is normal, and those rows
  // need the visible ref to be told apart.
  it("flags rows colliding on the same artist AND title", () => {
    const rows = markAmbiguous([
      { artist_id: "a", title: "Untitled" },
      { artist_id: "a", title: "Untitled" },
      { artist_id: "a", title: "Migration" },
    ]);
    expect(rows.map((r) => r.ambiguous)).toEqual([true, true, false]);
  });

  // Two different artists both having an "Untitled" is not a collision she has to
  // resolve — the artist name already separates them. Flagging it would put a
  // meaningless hex ref on ordinary rows.
  it("does not flag the same title across different artists", () => {
    const rows = markAmbiguous([
      { artist_id: "a", title: "Untitled" },
      { artist_id: "b", title: "Untitled" },
    ]);
    expect(rows.map((r) => r.ambiguous)).toEqual([false, false]);
  });

  // Comparison folds, so "Untitled" and "untitled" are the same title.
  it("compares titles case- and accent-insensitively", () => {
    const rows = markAmbiguous([
      { artist_id: "a", title: "Sans titre" },
      { artist_id: "a", title: "SANS TITRÉ" },
    ]);
    expect(rows.map((r) => r.ambiguous)).toEqual([true, true]);
  });
});

describe("artworkDescriptor", () => {
  it("joins present fields with the separator and prefixes the edition", () => {
    expect(
      artworkDescriptor({
        medium: "Gouache on paper",
        dimensions_text: "19.88 x 13 in.",
        edition: "3/10",
      }),
    ).toBe("Gouache on paper · 19.88 x 13 in. · ed. 3/10");
  });

  // A work with no edition must not render a dangling separator.
  it("omits absent fields without leaving separators", () => {
    expect(
      artworkDescriptor({ medium: "Oil on canvas", dimensions_text: null, edition: null }),
    ).toBe("Oil on canvas");
    expect(
      artworkDescriptor({ medium: null, dimensions_text: null, edition: null }),
    ).toBe("");
  });
});

describe("artworkRef", () => {
  // The ref is what she can paste back to jump to a work, and it must agree with
  // the 8-char prefix the SQL haystack appends: left(p_id::text, 8).
  it("is the first 8 characters of the id", () => {
    expect(artworkRef("6e5b9173-0e83-41a6-b2fc-75f1b814dfd9")).toBe("6e5b9173");
  });
});

describe("status vocabulary", () => {
  // Regression guard. This module used to carry its own ["available","on_hold",
  // "sold"] list, so when migration 0020 added 'not_for_sale' the search filter
  // rejected it and the API cast produced a status no label covered. The picker
  // must derive its statuses from the canonical enum, never restate them.
  it("covers every status the artworks column can hold", () => {
    expect(artworkStatus.options).toEqual([
      "available",
      "on_hold",
      "sold",
      "not_for_sale",
    ]);
    expect(artworkStatus.safeParse("not_for_sale").success).toBe(true);
  });
});
