import { describe, expect, it } from "vitest";
import {
  mergeAuthorityRecords,
  normalizeToDisplayName,
  parseGettyRecord,
  parseSearchResults,
  parseWikidataArtist,
  type WikidataRecord,
} from "@/lib/authority";
import gettyRichter from "./fixtures/getty-sparql-richter.json";
import wdSearchRichter from "./fixtures/wikidata-search-richter.json";
import wdGonzalez from "./fixtures/wikidata-sparql-gonzalez.json";
import wdKaws from "./fixtures/wikidata-sparql-kaws.json";
import wdRichter from "./fixtures/wikidata-sparql-richter.json";

// Fixtures are RAW responses captured live from Wikidata/Getty (see the plan's
// "live spike" step 0). Each assertion encodes the business rule it guards, so a
// change that violates the rule fails the test — not just a shape change.

describe("parseWikidataArtist (frozen live fixtures)", () => {
  it("extracts a full record: label is natural order, dates are years, ULAN kept, image is a Commons URL", () => {
    // Rule: birth/death come back as YYYY-encoded ISO datetimes → integer years.
    const r = parseWikidataArtist(wdRichter, "Q164351");
    expect(r.preferred_name).toBe("Gerhard Richter");
    expect(r.birth_year).toBe(1932);
    expect(r.death_year).toBeNull(); // Richter is alive — no P570
    expect(r.nationality_codes).toEqual(["DE"]);
    expect(r.ulan_id).toBe("500003003");
    expect(r.viaf_id).toBe("98149412");
    expect(r.roles).toContain("painter");
    // Commons image is kept (host is on the allowlist).
    expect(r.image_url).toMatch(/^https?:\/\/commons\.wikimedia\.org\//);
  });

  it("handles a mononym with no ULAN and no image (KAWS)", () => {
    // Rule: a missing P245 → ulan_id null (never a fabricated id); missing P18 →
    // image_url null. Getty must be skippable when there is no ULAN.
    const r = parseWikidataArtist(wdKaws, "Q3194367");
    expect(r.preferred_name).toBe("KAWS");
    expect(r.ulan_id).toBeNull();
    expect(r.image_url).toBeNull();
    expect(r.birth_year).toBe(1974);
    expect(r.nationality_codes).toEqual(["US"]);
  });

  it("preserves multi-nationality ORDER, [0] = primary (C3)", () => {
    // Rule: González-Torres is Cuban-American; the byline "Cuban-American" depends
    // on CU coming before US. If the parser reordered/deduped wrong, this fails.
    const r = parseWikidataArtist(wdGonzalez, "Q1288359");
    expect(r.nationality_codes).toEqual(["CU", "US"]);
    expect(r.nationality_codes[0]).toBe("CU");
    expect(r.birth_year).toBe(1957);
    expect(r.death_year).toBe(1996);
  });

  it("drops a P18 image whose host is not Wikimedia Commons (X8)", () => {
    // Rule: a spoofed/off-Commons image URL must never be stored.
    const spoofed = {
      results: {
        bindings: [
          {
            nameLabel: { value: "Evil Artist" },
            image: { value: "https://evil.example.com/tracker.jpg" },
          },
        ],
      },
    };
    expect(parseWikidataArtist(spoofed, "Q1").image_url).toBeNull();
  });

  it("treats a malformed P245 ULAN as absent, before it can reach Getty (X7-residual)", () => {
    // Rule: P245 is crowd-edited; a non-numeric value must not be passed to the
    // Getty query builder. Malformed → no ULAN → Wikidata-only.
    const badUlan = {
      results: {
        bindings: [{ nameLabel: { value: "Someone" }, ulan: { value: "not-a-number" } }],
      },
    };
    expect(parseWikidataArtist(badUlan, "Q1").ulan_id).toBeNull();
  });
});

describe("parseSearchResults (frozen live fixture)", () => {
  it("maps wbsearchentities hits to candidates, top match first", () => {
    // Rule: the real "Gerhard Richter" search must surface Q164351 as the top hit
    // with its human description — that's the QID the resolve is built on.
    const candidates = parseSearchResults(wdSearchRichter);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].qid).toBe("Q164351");
    expect(candidates[0].label).toBe("Gerhard Richter");
    expect(candidates.every((c) => /^Q[0-9]+$/.test(c.qid))).toBe(true);
  });

  it("drops hits with no label or a non-QID id", () => {
    // Rule: a labelless or malformed entry must never reach the picker.
    const dirty = {
      search: [
        { id: "Q1", label: "Keep Me", description: "ok" },
        { id: "Q2" }, // no label → dropped
        { id: "P31", label: "Property, not an item" }, // not a QID → dropped
      ],
    };
    const out = parseSearchResults(dirty);
    expect(out).toHaveLength(1);
    expect(out[0].qid).toBe("Q1");
    expect(out[0].description).toBe("ok");
  });
});

describe("parseWikidataArtist — multi-binding determinism (F3)", () => {
  it("aggregates a cross-product into one record: earliest birth, latest death, unioned nationalities", () => {
    // Rule: a P569×P106 cross-product (two birth values, two occupations) must not
    // let binding order decide the birth year. Earliest birth + order-preserving
    // nationality union, regardless of row order.
    const crossProduct = {
      results: {
        bindings: [
          {
            nameLabel: { value: "Ambiguous Artist" },
            birth: { value: "1910-01-01T00:00:00Z" },
            isoCodes: { value: "FR|IT" },
            occupations: { value: "painter" },
          },
          {
            nameLabel: { value: "Ambiguous Artist" },
            birth: { value: "1908-01-01T00:00:00Z" }, // earlier — must win
            isoCodes: { value: "FR|IT" },
            occupations: { value: "sculptor" },
          },
        ],
      },
    };
    const r = parseWikidataArtist(crossProduct, "Q1");
    expect(r.birth_year).toBe(1908);
    expect(r.nationality_codes).toEqual(["FR", "IT"]);
    expect(r.roles).toEqual(["painter", "sculptor"]);
  });
});

describe("parseGettyRecord (frozen live fixture)", () => {
  it("returns Getty's INVERTED preferred label plus alt labels and bio", () => {
    // Rule: Getty's prefLabel is the filing form "Surname, Given". It feeds
    // sort_name, and its natural form appears among the alt labels.
    const g = parseGettyRecord(gettyRichter);
    expect(g.pref_label).toBe("Richter, Gerhard");
    expect(g.alt_labels).toContain("Gerhard Richter");
    expect(g.bio).toBeTruthy();
  });
});

describe("normalizeToDisplayName", () => {
  it("inverts a filing name back to natural order, leaves mononyms alone", () => {
    expect(normalizeToDisplayName("Richter, Gerhard")).toBe("Gerhard Richter");
    expect(normalizeToDisplayName("González-Torres, Félix")).toBe("Félix González-Torres");
    expect(normalizeToDisplayName("KAWS")).toBe("KAWS"); // no comma → unchanged
  });
});

describe("mergeAuthorityRecords", () => {
  const wd = parseWikidataArtist(wdRichter, "Q164351");

  it("name is Wikidata's natural order, sort_name is Getty's inverted form, bio from Getty (C1)", () => {
    const getty = parseGettyRecord(gettyRichter);
    const merged = mergeAuthorityRecords(wd, getty, "ok");
    expect(merged.preferred_name).toBe("Gerhard Richter");
    // The inverted Getty term must NEVER land in the display name.
    expect(merged.preferred_name).not.toContain(",");
    expect(merged.sort_name).toBe("Richter, Gerhard");
    expect(merged.bio).toBeTruthy();
    expect(merged.sources.getty).toBe("ok");
  });

  it("Getty-unavailable degrades to Wikidata-only fields without throwing (A2/C2/B3)", () => {
    const merged = mergeAuthorityRecords(wd, null, "unavailable");
    expect(merged.preferred_name).toBe("Gerhard Richter");
    expect(merged.bio).toBeNull(); // no Getty → no bio
    // sort_name falls back to the derived filing key when Getty is gone.
    expect(merged.sort_name).toBe("Richter, Gerhard");
    expect(merged.sources.getty).toBe("unavailable");
    expect(merged.nationality_codes).toEqual(["DE"]);
  });

  it("no-ULAN path records getty = 'no_ulan' and still yields a usable record", () => {
    const kaws = parseWikidataArtist(wdKaws, "Q3194367");
    const merged = mergeAuthorityRecords(kaws, null, "no_ulan");
    expect(merged.sort_name).toBe("KAWS"); // mononym → deriveSortName is a no-op
    expect(merged.sources.getty).toBe("no_ulan");
  });

  it("would fail if merge ever put an inverted name in preferred_name", () => {
    // Falsifiability guard: synthesize a Wikidata record missing its label so the
    // ONLY name source is Getty's inverted pref — it must be normalized, not raw.
    const noLabel: WikidataRecord = { ...wd, preferred_name: null };
    const getty = parseGettyRecord(gettyRichter);
    const merged = mergeAuthorityRecords(noLabel, getty, "ok");
    expect(merged.preferred_name).toBe("Gerhard Richter");
    expect(merged.preferred_name).not.toContain(",");
  });
});
