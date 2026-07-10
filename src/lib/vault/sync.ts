// Shadow-table sync: walks the vault on disk, parses every article, bulk-inserts
// into vault_internal staging tables via service-role RPCs, then atomically swaps
// staging into the production vault_entities / vault_edges tables.
//
// See docs/decisions/0003-shadow-table-atomic-swap.md.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseFile } from "./parser";
import { inverseOf, isReciprocalKey } from "./reciprocity";
import type { ParseError, ParsedEntity, SyncResultSummary } from "./types";

const META_FILES = new Set([
  "_index.md",
  "_glossary.md",
  "_sources.md",
  "README.md",
  "CLAUDE.md",
]);

const ENTITY_CHUNK_SIZE = 500;
const EDGE_CHUNK_SIZE = 2000;

async function* walkMarkdown(root: string): AsyncIterable<string> {
  // Yields absolute paths to every .md under root (skipping meta/dotfiles).
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        if (META_FILES.has(entry.name)) continue;
        yield full;
      }
    }
  }
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function rpcVoid(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`rpc ${fn} failed: ${error.message}`);
}

async function bulkInsertEntities(
  supabase: SupabaseClient,
  entities: ParsedEntity[],
): Promise<number> {
  let total = 0;
  for (let i = 0; i < entities.length; i += ENTITY_CHUNK_SIZE) {
    const chunk = entities.slice(i, i + ENTITY_CHUNK_SIZE).map((e) => ({
      entity_id: e.entity_id,
      entity_type: e.entity_type,
      slug: e.slug,
      title: e.title,
      file_path_relative: e.file_path_relative,
      frontmatter: e.frontmatter,
      body_md: e.body_md,
      sensitivity: e.sensitivity,
      tags: e.tags,
      file_mtime: e.file_mtime,
      file_sha: e.file_sha,
      last_synced: new Date().toISOString(),
    }));
    const { data, error } = await supabase.rpc("vault_sync_insert_entities", {
      payload: chunk,
    });
    if (error) throw new Error(`vault_sync_insert_entities failed: ${error.message}`);
    total += typeof data === "number" ? data : chunk.length;
  }
  return total;
}

type EdgePayload = {
  src_entity_id: string;
  relation_type: string;
  dst_entity_id: string;
  dst_resolved: boolean;
  source_kind: string;
};

async function bulkInsertEdges(
  supabase: SupabaseClient,
  edges: EdgePayload[],
): Promise<number> {
  let total = 0;
  for (let i = 0; i < edges.length; i += EDGE_CHUNK_SIZE) {
    const chunk = edges.slice(i, i + EDGE_CHUNK_SIZE);
    const { data, error } = await supabase.rpc("vault_sync_insert_edges", {
      payload: chunk,
    });
    if (error) throw new Error(`vault_sync_insert_edges failed: ${error.message}`);
    total += typeof data === "number" ? data : chunk.length;
  }
  return total;
}

async function logErrors(
  supabase: SupabaseClient,
  runId: number,
  errors: ParseError[],
): Promise<void> {
  if (!errors.length) return;
  const rows = errors.map((e) => ({
    run_id: runId,
    file_path_relative: e.file_path_relative,
    error_kind: e.error_kind,
    message: e.message,
  }));
  // Direct insert (service role bypasses RLS).
  const { error } = await supabase.from("vault_sync_run_errors").insert(rows);
  if (error) throw new Error(`error log insert failed: ${error.message}`);
}

function countAsymmetries(
  entitiesById: Map<string, ParsedEntity>,
  edges: EdgePayload[],
): number {
  // Build edge lookup: src -> rel -> set<dst>.
  const idx = new Map<string, Map<string, Set<string>>>();
  for (const e of edges) {
    let m = idx.get(e.src_entity_id);
    if (!m) {
      m = new Map();
      idx.set(e.src_entity_id, m);
    }
    let s = m.get(e.relation_type);
    if (!s) {
      s = new Set();
      m.set(e.relation_type, s);
    }
    s.add(e.dst_entity_id);
  }

  let asymmetries = 0;
  for (const e of edges) {
    if (!isReciprocalKey(e.relation_type)) continue;
    // Asymmetries are only counted when the dst exists on disk — otherwise we'd
    // double-count dangling links. _vault_lib.py's reciprocity check works the
    // same way (it walks articles that exist).
    if (!entitiesById.has(e.dst_entity_id)) continue;
    const inv = inverseOf(e.relation_type, e.dst_entity_id);
    if (!inv) continue;
    const dstEdges = idx.get(e.dst_entity_id)?.get(inv);
    if (!dstEdges?.has(e.src_entity_id)) {
      asymmetries++;
    }
  }
  return asymmetries;
}

export type RunSyncOptions = {
  vaultPath: string;
  supabase: SupabaseClient;
  log?: (msg: string) => void;
};

export async function runSync(options: RunSyncOptions): Promise<SyncResultSummary> {
  const { vaultPath, supabase } = options;
  const log = options.log ?? (() => {});
  const wikiRoot = path.join(vaultPath, "wiki");
  const wikiStat = await fs.stat(wikiRoot).catch(() => null);
  if (!wikiStat || !wikiStat.isDirectory()) {
    throw new Error(`vault wiki dir not found: ${wikiRoot}`);
  }

  const startedAt = Date.now();
  const { data: runRow, error: runErr } = await supabase
    .from("vault_sync_runs")
    .insert({ started_at: new Date(startedAt).toISOString() })
    .select("id")
    .single();
  if (runErr || !runRow) {
    throw new Error(`could not create sync run: ${runErr?.message ?? "unknown"}`);
  }
  const runId = runRow.id as number;

  await rpcVoid(supabase, "vault_sync_truncate_staging");

  const entities: ParsedEntity[] = [];
  const errors: ParseError[] = [];
  let filesSeen = 0;
  let filesFailed = 0;

  for await (const absPath of walkMarkdown(wikiRoot)) {
    filesSeen++;
    const rel = path.relative(vaultPath, absPath);
    let buf: Buffer;
    let stat;
    try {
      buf = await fs.readFile(absPath);
      stat = await fs.stat(absPath);
    } catch (err) {
      filesFailed++;
      errors.push({
        file_path_relative: rel,
        error_kind: "read_failed",
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    const text = buf.toString("utf8");
    const sha = sha256Hex(buf);
    const mtimeIso = stat.mtime.toISOString();

    const relInsideWiki = path.relative(wikiRoot, absPath);
    const parts = relInsideWiki.split(path.sep);
    if (parts.length < 2) {
      // Top-level file under wiki/ — skip; entities live inside section dirs.
      continue;
    }
    const entityType = parts[0];
    const slug = parts[parts.length - 1].replace(/\.md$/, "");

    const result = parseFile({
      text,
      filePathRelative: rel,
      entityType,
      slug,
      fileSha: sha,
      fileMtimeIso: mtimeIso,
    });
    if (!result.ok) {
      filesFailed++;
      errors.push(...result.errors);
      continue;
    }
    if (result.errors.length) {
      filesFailed++;
      errors.push(...result.errors);
    }
    entities.push(result.entity);
  }

  log(`parsed ${entities.length} entities (${filesFailed} files with errors) from ${filesSeen} files`);

  // Build edge payloads, resolving dst_resolved against the in-memory snapshot.
  const entitiesById = new Map(entities.map((e) => [e.entity_id, e]));
  const edges: EdgePayload[] = [];
  for (const ent of entities) {
    for (const edge of ent.edges) {
      edges.push({
        src_entity_id: ent.entity_id,
        relation_type: edge.relation_type,
        dst_entity_id: edge.dst_entity_id,
        dst_resolved: entitiesById.has(edge.dst_entity_id),
        source_kind: edge.source_kind,
      });
    }
  }

  // Log unresolved-wikilink errors (informational, not fatal).
  const unresolvedSamples: ParseError[] = [];
  for (const ent of entities) {
    for (const edge of ent.edges) {
      if (!entitiesById.has(edge.dst_entity_id)) {
        unresolvedSamples.push({
          file_path_relative: ent.file_path_relative,
          error_kind: "unresolved_wikilink",
          message: `${edge.relation_type} -> ${edge.dst_entity_id}`,
        });
      }
    }
  }
  errors.push(...unresolvedSamples);

  log(`bulk-inserting ${entities.length} entities + ${edges.length} edges into staging`);
  const entitiesUpserted = await bulkInsertEntities(supabase, entities);
  const edgesUpserted = await bulkInsertEdges(supabase, edges);

  log(`atomic swap`);
  await rpcVoid(supabase, "vault_swap_from_staging");

  const asymmetries = countAsymmetries(entitiesById, edges);

  const finishedAt = Date.now();
  const durationMs = finishedAt - startedAt;

  await logErrors(supabase, runId, errors);

  const { error: updateErr } = await supabase
    .from("vault_sync_runs")
    .update({
      finished_at: new Date(finishedAt).toISOString(),
      files_seen: filesSeen,
      files_failed: filesFailed,
      entities_upserted: entitiesUpserted,
      edges_upserted: edgesUpserted,
      asymmetries_count: asymmetries,
      duration_ms: durationMs,
    })
    .eq("id", runId);
  if (updateErr) throw new Error(`run update failed: ${updateErr.message}`);

  return {
    run_id: runId,
    files_seen: filesSeen,
    files_failed: filesFailed,
    entities_upserted: entitiesUpserted,
    edges_upserted: edgesUpserted,
    asymmetries_count: asymmetries,
    duration_ms: durationMs,
  };
}
