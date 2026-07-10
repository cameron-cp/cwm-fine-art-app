// End-to-end sync test with an in-memory fake of the SupabaseClient surface
// the sync code uses. Exercises: parse → bulk-insert → swap → asymmetry count
// → idempotence → file deletion handling.
//
// A real Postgres run (via `supabase start` or pglite) is the right ground
// truth for the migration itself; this test focuses on the TS sync algorithm.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { dedupeEntities, runSync } from "../sync";
import type { ParsedEntity } from "../types";

type Row = Record<string, unknown>;

function makeFakeSupabase() {
  // Production tables.
  const entities: Row[] = [];
  const edges: Row[] = [];
  const runs: Row[] = [];
  const errors: Row[] = [];
  // Staging tables.
  const stagingEntities: Row[] = [];
  const stagingEdges: Row[] = [];

  let nextRunId = 1;

  type Builder = {
    _table: string;
    _filters: Array<(r: Row) => boolean>;
    _insertedIds: Row[];
    _orderColumns: string[];
    _limit?: number;
    _selecting?: boolean;
    _countMode: "exact" | null;
    _headOnly: boolean;
    _selectColumns?: string;
    _patch?: Row;
    _operation: "select" | "insert" | "update" | null;
    select(cols?: string, options?: { count?: "exact"; head?: boolean }): Builder;
    eq(col: string, val: unknown): Builder;
    in(col: string, vals: unknown[]): Builder;
    neq(col: string, val: unknown): Builder;
    ilike(col: string, pattern: string): Builder;
    order(col: string, opts?: { ascending?: boolean }): Builder;
    limit(n: number): Builder;
    maybeSingle(): Promise<{ data: Row | null; error: null }>;
    single(): Promise<{ data: Row | null; error: null }>;
    insert(rows: Row | Row[]): Builder;
    update(patch: Row): Builder;
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: (v: { data: unknown; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>,
      onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
    ): Promise<TResult1 | TResult2>;
  };

  function tableData(table: string): Row[] {
    switch (table) {
      case "vault_entities": return entities;
      case "vault_edges": return edges;
      case "vault_sync_runs": return runs;
      case "vault_sync_run_errors": return errors;
      default: throw new Error(`unknown table: ${table}`);
    }
  }

  function from(table: string): Builder {
    const builder: Builder = {
      _table: table,
      _filters: [],
      _insertedIds: [],
      _orderColumns: [],
      _countMode: null,
      _headOnly: false,
      _operation: null,
      select(cols, options) {
        this._selecting = true;
        this._selectColumns = cols;
        this._countMode = options?.count ?? null;
        this._headOnly = options?.head ?? false;
        if (this._operation == null) this._operation = "select";
        return this;
      },
      eq(col, val) { this._filters.push((r) => r[col] === val); return this; },
      in(col, vals) { this._filters.push((r) => vals.includes(r[col])); return this; },
      neq(col, val) { this._filters.push((r) => r[col] !== val); return this; },
      ilike(col, pattern) {
        const re = new RegExp(
          "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("%", ".*").replaceAll("_", ".") + "$",
          "i",
        );
        this._filters.push((r) => typeof r[col] === "string" && re.test(r[col] as string));
        return this;
      },
      order(col) { this._orderColumns.push(col); return this; },
      limit(n) { this._limit = n; return this; },
      async maybeSingle() {
        const result = await this;
        const rows = (result.data as Row[]) ?? [];
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        const result = await this;
        const rows = (result.data as Row[]) ?? [];
        return { data: rows[0] ?? null, error: null };
      },
      insert(rows) {
        this._operation = "insert";
        const arr = Array.isArray(rows) ? rows : [rows];
        if (table === "vault_sync_runs") {
          for (const r of arr) {
            const inserted = { id: nextRunId++, ...r };
            runs.push(inserted);
            this._insertedIds.push(inserted);
          }
        } else if (table === "vault_sync_run_errors") {
          for (const r of arr) errors.push({ id: errors.length + 1, ...r });
        } else if (table === "vault_entities") {
          for (const r of arr) entities.push({ ...r });
        } else if (table === "vault_edges") {
          for (const r of arr) edges.push({ ...r });
        }
        return this;
      },
      update(patch) {
        this._operation = "update";
        this._patch = patch;
        return this;
      },
      then(onfulfilled, onrejected) {
        return (async () => {
          if (this._operation === "insert") {
            // insert(...).select() → inserted rows
            return { data: this._insertedIds, error: null };
          }
          if (this._operation === "update") {
            const data = tableData(this._table);
            for (const r of data) {
              if (this._filters.every((f) => f(r))) Object.assign(r, this._patch ?? {});
            }
            return { data: null, error: null };
          }
          // select
          let data = tableData(this._table).filter((r) => this._filters.every((f) => f(r)));
          if (this._orderColumns.length) {
            data = [...data].sort((a, b) => {
              for (const c of this._orderColumns) {
                const av = a[c]; const bv = b[c];
                if (av == null && bv == null) continue;
                if (av == null) return -1;
                if (bv == null) return 1;
                if (av < bv) return -1;
                if (av > bv) return 1;
              }
              return 0;
            });
          }
          if (this._limit != null) data = data.slice(0, this._limit);
          if (this._headOnly) {
            return { data: null, error: null, count: data.length };
          }
          return { data, error: null, count: this._countMode === "exact" ? data.length : undefined };
        })().then(onfulfilled, onrejected);
      },
    };
    return builder;
  }

  async function rpc(fn: string, args: { payload?: Row[] } = {}) {
    if (fn === "vault_sync_truncate_staging") {
      stagingEntities.length = 0;
      stagingEdges.length = 0;
      return { data: null, error: null };
    }
    if (fn === "vault_sync_insert_entities") {
      const payload = args.payload ?? [];
      for (const e of payload) stagingEntities.push({ ...e });
      return { data: payload.length, error: null };
    }
    if (fn === "vault_sync_insert_edges") {
      const payload = args.payload ?? [];
      for (const e of payload) {
        const key = `${e.src_entity_id}|${e.relation_type}|${e.dst_entity_id}`;
        if (!stagingEdges.some((x) => `${x.src_entity_id}|${x.relation_type}|${x.dst_entity_id}` === key)) {
          stagingEdges.push({ ...e });
        }
      }
      return { data: payload.length, error: null };
    }
    if (fn === "vault_swap_from_staging") {
      // Sanity guard mirror.
      if (entities.length > 0 && stagingEntities.length < entities.length / 2) {
        return { data: null, error: { message: "sanity guard tripped" } };
      }
      entities.length = 0;
      edges.length = 0;
      for (const e of stagingEntities) entities.push({ ...e });
      const stagingIds = new Set(stagingEntities.map((e) => e.entity_id));
      for (const e of stagingEdges) {
        edges.push({ ...e, dst_resolved: stagingIds.has(e.dst_entity_id) });
      }
      return { data: null, error: null };
    }
    return { data: null, error: { message: `unknown rpc: ${fn}` } };
  }

  return {
    client: { from, rpc } as unknown as import("@supabase/supabase-js").SupabaseClient,
    state: { entities, edges, runs, errors, stagingEntities, stagingEdges },
  };
}

async function buildFixtureVault(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "vault-fixture-"));
  const wiki = path.join(root, "wiki");
  await mkdir(path.join(wiki, "clients"), { recursive: true });
  await mkdir(path.join(wiki, "objects"), { recursive: true });
  await mkdir(path.join(wiki, "artists"), { recursive: true });
  await mkdir(path.join(wiki, "galleries"), { recursive: true });
  await mkdir(path.join(wiki, "institutions"), { recursive: true });
  await mkdir(path.join(wiki, "exhibitions"), { recursive: true });

  await writeFile(
    path.join(wiki, "clients", "howard.md"),
    `---\ntitle: Howard\nsensitivity: standard\nrelations:\n  collects_artists:\n    - [[artists/morris]]\n  spouse: [[clients/cindy]]\n---\n\n# Howard\n`,
  );
  await writeFile(
    path.join(wiki, "clients", "cindy.md"),
    `---\ntitle: Cindy\nrelations:\n  spouse: [[clients/howard]]\n---\n\n# Cindy\n`,
  );
  await writeFile(
    path.join(wiki, "objects", "morris-stack.md"),
    `---\nartist: [[artists/morris]]\ntitle: Bronze Stack\nrelations:\n  current_holder: [[galleries/tt]]\n---\n\n# Morris Stack\n`,
  );
  await writeFile(
    path.join(wiki, "artists", "morris.md"),
    `---\ntitle: Annie Morris\n# missing major_collectors back-edge — generates 1 asymmetry\n# missing active_objects back-edge — generates 1 asymmetry\nrelations: {}\n---\n\n# Annie Morris\n`,
  );
  await writeFile(
    path.join(wiki, "galleries", "tt.md"),
    `---\ntitle: Timothy Taylor\nrelations:\n  holds_objects:\n    - [[objects/morris-stack]]\n---\n\n# Timothy Taylor\n`,
  );
  await writeFile(
    path.join(wiki, "institutions", "he-museum.md"),
    `---\ntitle: He Museum\nrelations: {}\n---\n\n# He Museum\n`,
  );
  await writeFile(
    path.join(wiki, "exhibitions", "fair-2025.md"),
    `---\ntitle: Fair 2025\nrelations: {}\n---\n\n# Fair 2025\n`,
  );
  // Meta files that should be skipped.
  await writeFile(path.join(wiki, "_index.md"), `# index — should be skipped`);
  return root;
}

function makeEntity(over: Partial<ParsedEntity> & Pick<ParsedEntity, "entity_id" | "file_path_relative">): ParsedEntity {
  return {
    entity_type: over.entity_id.split("/")[0],
    slug: over.entity_id.split("/")[1] ?? "",
    title: null,
    frontmatter: {},
    body_md: "",
    sensitivity: null,
    tags: [],
    file_mtime: "2024-01-01T00:00:00.000Z",
    file_sha: "sha",
    edges: [],
    ...over,
  };
}

describe("dedupeEntities — nested-file id collision guard", () => {
  it("keeps the first of a colliding pair and reports the offending file path", () => {
    // Both files live under clients/ but in different subdirs, so slug (filename)
    // collapses them to the same entity_id — the latent bug that aborts the swap.
    const entities = [
      makeEntity({ entity_id: "clients/notes", file_path_relative: "wiki/clients/a/notes.md" }),
      makeEntity({ entity_id: "clients/notes", file_path_relative: "wiki/clients/b/notes.md" }),
      makeEntity({ entity_id: "clients/howard", file_path_relative: "wiki/clients/howard.md" }),
    ];
    const { entities: unique, duplicateErrors } = dedupeEntities(entities);

    // Exactly one 'clients/notes' survives (the first) → the swap's PK can't abort.
    expect(unique.map((e) => e.entity_id).sort()).toEqual(["clients/howard", "clients/notes"]);
    expect(unique.find((e) => e.entity_id === "clients/notes")?.file_path_relative).toBe("wiki/clients/a/notes.md");

    // The collision is surfaced (not silently swallowed), naming BOTH files.
    expect(duplicateErrors).toHaveLength(1);
    expect(duplicateErrors[0].error_kind).toBe("duplicate_entity_id");
    expect(duplicateErrors[0].file_path_relative).toBe("wiki/clients/b/notes.md");
    expect(duplicateErrors[0].message).toContain("wiki/clients/a/notes.md");
  });

  it("no duplicates → passthrough with no errors", () => {
    const entities = [
      makeEntity({ entity_id: "clients/a", file_path_relative: "wiki/clients/a.md" }),
      makeEntity({ entity_id: "clients/b", file_path_relative: "wiki/clients/b.md" }),
    ];
    const { entities: unique, duplicateErrors } = dedupeEntities(entities);
    expect(unique).toHaveLength(2);
    expect(duplicateErrors).toHaveLength(0);
  });
});

describe("runSync collapses a nested-file collision instead of aborting", () => {
  let vaultPath: string;
  beforeAll(async () => {
    vaultPath = await mkdtemp(path.join(tmpdir(), "vault-collide-"));
    await mkdir(path.join(vaultPath, "wiki", "clients", "sub"), { recursive: true });
    await writeFile(
      path.join(vaultPath, "wiki", "clients", "howard.md"),
      `---\ntitle: Howard\n---\n\n# Howard\n`,
    );
    // Nested file whose slug collides with clients/howard → 'clients/howard'.
    await writeFile(
      path.join(vaultPath, "wiki", "clients", "sub", "howard.md"),
      `---\ntitle: Howard Dup\n---\n\n# Howard Dup\n`,
    );
  });
  afterAll(async () => {
    await rm(vaultPath, { recursive: true, force: true });
  });

  it("inserts the id once and logs a duplicate_entity_id error", async () => {
    const fake = makeFakeSupabase();
    const result = await runSync({ vaultPath, supabase: fake.client });
    // One survives (not aborted, not duplicated).
    expect(fake.state.entities.filter((e: Row) => e.entity_id === "clients/howard")).toHaveLength(1);
    expect(result.entities_upserted).toBe(1);
    // The collision is recorded for the operator.
    const dupErrors = fake.state.errors.filter((e: Row) => e.error_kind === "duplicate_entity_id");
    expect(dupErrors).toHaveLength(1);
  });
});

describe("runSync end-to-end against a fixture vault", () => {
  let vaultPath: string;

  beforeAll(async () => {
    vaultPath = await buildFixtureVault();
  });
  afterAll(async () => {
    await rm(vaultPath, { recursive: true, force: true });
  });

  it("populates entities + edges and counts asymmetries correctly", async () => {
    const fake = makeFakeSupabase();
    const result = await runSync({ vaultPath, supabase: fake.client });

    expect(result.entities_upserted).toBe(7);
    expect(fake.state.entities.map((e: Row) => e.entity_id).sort()).toEqual([
      "artists/morris",
      "clients/cindy",
      "clients/howard",
      "exhibitions/fair-2025",
      "galleries/tt",
      "institutions/he-museum",
      "objects/morris-stack",
    ]);

    // top-level artist: link field materialized as an edge
    const artistEdges = fake.state.edges.filter(
      (e: Row) => e.src_entity_id === "objects/morris-stack" && e.relation_type === "artist",
    );
    expect(artistEdges).toHaveLength(1);
    expect(artistEdges[0].dst_entity_id).toBe("artists/morris");
    expect(artistEdges[0].source_kind).toBe("link_field");
    expect(artistEdges[0].dst_resolved).toBe(true);

    // current_holder edge resolves to the gallery
    const holderEdges = fake.state.edges.filter(
      (e: Row) => e.src_entity_id === "objects/morris-stack" && e.relation_type === "current_holder",
    );
    expect(holderEdges).toHaveLength(1);
    expect(holderEdges[0].dst_entity_id).toBe("galleries/tt");

    // asymmetry count: morris is missing both major_collectors and active_objects
    expect(result.asymmetries_count).toBe(2);
  });

  it("re-sync is byte-identical (idempotent on entity_id + file_sha + tags)", async () => {
    const fake = makeFakeSupabase();
    await runSync({ vaultPath, supabase: fake.client });
    const hash1 = fake.state.entities
      .map((e: Row) => `${e.entity_id}|${e.file_sha}|${(e.tags as string[]).join(",")}`)
      .sort()
      .join("|");
    await runSync({ vaultPath, supabase: fake.client });
    const hash2 = fake.state.entities
      .map((e: Row) => `${e.entity_id}|${e.file_sha}|${(e.tags as string[]).join(",")}`)
      .sort()
      .join("|");
    expect(hash2).toBe(hash1);
    expect(fake.state.entities).toHaveLength(7);
  });

  it("file deletion handling: removed file → row disappears next sync", async () => {
    const fake = makeFakeSupabase();
    await runSync({ vaultPath, supabase: fake.client });
    expect(fake.state.entities.find((e: Row) => e.entity_id === "exhibitions/fair-2025")).toBeDefined();

    await unlink(path.join(vaultPath, "wiki", "exhibitions", "fair-2025.md"));
    try {
      await runSync({ vaultPath, supabase: fake.client });
      expect(fake.state.entities.find((e: Row) => e.entity_id === "exhibitions/fair-2025")).toBeUndefined();
      expect(fake.state.entities).toHaveLength(6);
    } finally {
      await writeFile(
        path.join(vaultPath, "wiki", "exhibitions", "fair-2025.md"),
        `---\ntitle: Fair 2025\nrelations: {}\n---\n\n# Fair 2025\n`,
      );
      await runSync({ vaultPath, supabase: fake.client });
      expect(fake.state.entities).toHaveLength(7);
    }
  });
});
