import { describe, it, expect } from "vitest";
import {
  splitFrontmatter,
  parseScalars,
  extractRelations,
  extractLinkFields,
  parseFile,
} from "../parser";

describe("splitFrontmatter", () => {
  it("returns empty fm for files without frontmatter", () => {
    expect(splitFrontmatter("# Hello\n\nbody").fm).toBe("");
    expect(splitFrontmatter("# Hello\n\nbody").body).toBe("# Hello\n\nbody");
  });

  it("splits well-formed frontmatter", () => {
    const text = `---\ntitle: Foo\n---\n# Foo\nbody`;
    const { fm, body } = splitFrontmatter(text);
    expect(fm).toBe("title: Foo");
    expect(body).toBe("# Foo\nbody");
  });
});

describe("parseScalars", () => {
  it("returns {} for relations: {} (empty mapping)", () => {
    const { data, error } = parseScalars(`status: active\nrelations: {}`, "x.md");
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "active" });
  });

  it("ignores the relations: block when computing scalars", () => {
    const fm = `status: hot\nrelations:\n  spouse: [[clients/jane-doe]]\n  collects_artists:\n    - [[artists/foo]]`;
    const { data, error } = parseScalars(fm, "x.md");
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "hot" });
    expect(data.relations).toBeUndefined();
  });

  it("sanitizes wikilinks in top-level scalars so YAML parses", () => {
    const fm = `artist: [[artists/joan-mitchell]]\nyear: 1956`;
    const { data, error } = parseScalars(fm, "x.md");
    expect(error).toBeNull();
    expect(data.artist).toBe("[[artists/joan-mitchell]]");
    expect(data.year).toBe(1956);
  });

  it("emits an error row for malformed YAML and returns {}", () => {
    const fm = `title: "unterminated\nyear: 2024`;
    const { data, error } = parseScalars(fm, "broken.md");
    expect(data).toEqual({});
    expect(error).not.toBeNull();
    expect(error!.error_kind).toBe("yaml_parse");
    expect(error!.file_path_relative).toBe("broken.md");
  });
});

describe("extractRelations", () => {
  it("parses block-list relations", () => {
    const fm = `relations:\n  collects_artists:\n    - [[artists/joan-mitchell]]\n    - [[artists/lee-krasner]]\n  spouse: [[clients/jane]]`;
    const rels = extractRelations(fm);
    expect(rels).toEqual({
      collects_artists: ["artists/joan-mitchell", "artists/lee-krasner"],
      spouse: ["clients/jane"],
    });
  });

  it("treats relations: {} as an empty block", () => {
    const fm = `status: active\nrelations: {}`;
    expect(extractRelations(fm)).toEqual({});
  });

  it("dedupes within a key", () => {
    const fm = `relations:\n  spouse:\n    - [[clients/a]]\n    - [[clients/a]]`;
    expect(extractRelations(fm)).toEqual({ spouse: ["clients/a"] });
  });

  it("strips inline comments", () => {
    const fm = `relations:\n  spouse: [[clients/a]] # primary\n`;
    expect(extractRelations(fm)).toEqual({ spouse: ["clients/a"] });
  });
});

describe("extractLinkFields", () => {
  it("captures top-level wikilink scalars (the artist: case)", () => {
    const fm = `artist: [[artists/annie-morris]]\ntitle: "Bronze Stack 9"\nyear: 2022\nrelations:\n  current_holder: [[galleries/timothy-taylor]]`;
    expect(extractLinkFields(fm)).toEqual({ artist: ["artists/annie-morris"] });
  });

  it("does not pick up entries inside the relations: block", () => {
    const fm = `relations:\n  current_holder: [[galleries/x]]\n`;
    expect(extractLinkFields(fm)).toEqual({});
  });

  it("returns empty object when no link-field scalars present", () => {
    expect(extractLinkFields(`title: foo\nyear: 1956`)).toEqual({});
  });
});

describe("parseFile (integration)", () => {
  function fixture(text: string, overrides?: Partial<Parameters<typeof parseFile>[0]>) {
    return parseFile({
      text,
      filePathRelative: "wiki/objects/foo.md",
      entityType: "objects",
      slug: "foo",
      fileSha: "abc",
      fileMtimeIso: "2026-05-08T00:00:00.000Z",
      ...overrides,
    });
  }

  it("emits link_field edges for top-level artist:", () => {
    const text = `---\nartist: [[artists/annie-morris]]\ntitle: Bronze Stack\nrelations:\n  current_holder: [[galleries/timothy-taylor]]\n---\n\n# Bronze Stack\n`;
    const result = fixture(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const linkFieldEdges = result.entity.edges.filter((e) => e.source_kind === "link_field");
    expect(linkFieldEdges).toContainEqual({
      relation_type: "artist",
      dst_entity_id: "artists/annie-morris",
      source_kind: "link_field",
    });
    const relEdges = result.entity.edges.filter((e) => e.source_kind === "relations_block");
    expect(relEdges).toContainEqual({
      relation_type: "current_holder",
      dst_entity_id: "galleries/timothy-taylor",
      source_kind: "relations_block",
    });
    // link-field key removed from frontmatter (it lives in edges instead)
    expect(result.entity.frontmatter.artist).toBeUndefined();
    // relations key never appears on row
    expect(result.entity.frontmatter.relations).toBeUndefined();
  });

  it("captures sensitivity and tags (yaml + inline hashtags)", () => {
    const text = `---\nsensitivity: high\ntags: [anonymous-placeholder, vip]\n---\n\n# Anon\nbody #late\n`;
    const result = fixture(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entity.sensitivity).toBe("high");
    expect(result.entity.tags.sort()).toEqual(["anonymous-placeholder", "late", "vip"]);
  });

  it("handles disambiguated slug shape (mitchell-untitled-1956)", () => {
    const text = `---\ntitle: Untitled\nyear: 1956\n---\n\n# Joan Mitchell — Untitled (1956)\n`;
    const result = fixture(text, { slug: "mitchell-untitled-1956" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entity.entity_id).toBe("objects/mitchell-untitled-1956");
  });

  it("malformed YAML produces error in result.errors but still returns ok", () => {
    const text = `---\ntitle: "unterminated\nyear: 1956\n---\n\n# Foo\n`;
    const result = fixture(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.errors.some((e) => e.error_kind === "yaml_parse")).toBe(true);
  });

  it("relations: {} round-trips as no relations edges", () => {
    const text = `---\ntitle: T\nrelations: {}\n---\n\n# T\n`;
    const result = fixture(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entity.edges.filter((e) => e.source_kind === "relations_block")).toHaveLength(0);
  });
});
