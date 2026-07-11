import { describe, expect, it } from "vitest";
import { parseFile } from "../parser";
import {
  extractEmail,
  mapClientToParty,
  shouldSkipClient,
  TYPE_TO_ROLE,
} from "../seedParties";
import type { ParsedEntity } from "../types";

// Build a ParsedEntity the same way the seed reads it off disk, so the tests
// exercise the real parser (frontmatter type/status/location, # title, body email).
function client(slug: string, md: string): ParsedEntity {
  const result = parseFile({
    text: md,
    filePathRelative: `wiki/clients/${slug}.md`,
    entityType: "clients",
    slug,
    fileSha: "",
    fileMtimeIso: "2026-01-01T00:00:00.000Z",
  });
  if (!result.ok) throw new Error("parse failed");
  return result.entity;
}

describe("extractEmail", () => {
  it("pulls the first address out of freeform body prose and lowercases it", () => {
    // Email lives in the body, never in frontmatter — a bad regex here silently
    // imports 400+ contacts with no way to reach them.
    expect(extractEmail("## Profile\n- Email: Abigail@GuggenheimAsher.com\n")).toBe(
      "abigail@guggenheimasher.com",
    );
  });

  it("returns null when there is no email (≈60% of the vault)", () => {
    expect(extractEmail("Surfaced from an exhibition. Stub.")).toBeNull();
  });
});

describe("mapClientToParty role mapping", () => {
  // The vault's `type` vocabulary is NOT the party_roles enum. Getting this
  // wrong writes an invalid role and the party_roles insert rejects the row.
  const cases: Array<[string, string | null]> = [
    ["collector", "collector"],
    ["advisor", "advisory"],
    ["dealer", "dealer"],
    ["institution", "institution"],
    ["studio-staff", "studio"],
    ["artist", "artist"],
    ["prospect", null], // real contact, but no clean role in the enum
    ["some-future-type", null], // unknown type must degrade to no role, not crash
  ];
  for (const [type, expected] of cases) {
    it(`type '${type}' → role ${expected ?? "(none)"}`, () => {
      const e = client("x", `---\ntype: ${type}\n---\n# X\n`);
      expect(mapClientToParty(e)?.role).toBe(expected);
    });
  }

  it("a sothebys/christies email overrides the type-derived role with auction_house", () => {
    // Auction-house staff are typed 'dealer'/'advisor' in the vault; the work
    // email is the authoritative signal of where they actually work.
    const sothebys = client(
      "alexandra-olsman",
      "---\ntype: dealer\n---\n# Alexandra Olsman\n- Email: alexandra.olsman@sothebys.com\n",
    );
    expect(mapClientToParty(sothebys)?.role).toBe("auction_house");

    const christies = client(
      "jane-doe",
      "---\ntype: advisor\n---\n# Jane Doe\nEmail: jane.doe@christies.com\n",
    );
    expect(mapClientToParty(christies)?.role).toBe("auction_house");
  });

  it("a non-auction-house email leaves the type-derived role intact", () => {
    const e = client("x", "---\ntype: dealer\n---\n# X\nEmail: x@gagosian.com\n");
    expect(mapClientToParty(e)?.role).toBe("dealer");
  });

  it("every mapped role is a member of the 0007 party_roles enum", () => {
    const enumRoles = new Set([
      "collector", "gallery", "auction_house", "advisory", "collection_manager",
      "studio", "artist", "museum", "dealer", "shipper", "conservator", "institution",
    ]);
    for (const role of Object.values(TYPE_TO_ROLE)) {
      if (role !== null) expect(enumRoles.has(role)).toBe(true);
    }
  });
});

describe("shouldSkipClient", () => {
  it("skips stub-tagged shells (chosen scope: real contacts only)", () => {
    const e = client("abigail-best", "---\ntype: collector\ntags: [stub, single-touch]\n---\n# Abigail Best\n");
    expect(shouldSkipClient(e)).toBe(true);
    expect(mapClientToParty(e)).toBeNull();
  });

  it("skips redirect alias pages", () => {
    const e = client("alias", "---\ntype: redirect\n---\n# Alias\n");
    expect(mapClientToParty(e)).toBeNull();
  });

  it("keeps a real collector", () => {
    const e = client("real", "---\ntype: collector\nstatus: active\ntags: [collector]\n---\n# Real Person\n");
    expect(shouldSkipClient(e)).toBe(false);
  });
});

describe("mapClientToParty field mapping", () => {
  it("maps title→display_name, kind=person, and composes notes from status+location", () => {
    const e = client(
      "abigail-asher",
      "---\ntype: advisor\nstatus: active\nlocation: New York\n---\n# Abigail Asher\n- Email: abigail@guggenheimasher.com\n",
    );
    const p = mapClientToParty(e)!;
    expect(p).toMatchObject({
      vault_entity_id: "clients/abigail-asher",
      kind: "person",
      display_name: "Abigail Asher",
      email: "abigail@guggenheimasher.com",
      role: "advisory",
      notes: "Status: active · Location: New York",
    });
  });

  it("falls back to a title-cased slug when the article has no # heading", () => {
    const e = client("john-q-doe", "---\ntype: collector\n---\nno heading here\n");
    expect(mapClientToParty(e)?.display_name).toBe("John Q Doe");
  });
});
