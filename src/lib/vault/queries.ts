// Pure read helpers over vault_entities / vault_edges / vault_sync_runs.
// Each helper takes a SupabaseClient — admin from CLI today, user-scoped from
// M2 routes. No implicit client.

import type { SupabaseClient } from "@supabase/supabase-js";

export type VaultEntityRow = {
  entity_id: string;
  entity_type: string;
  slug: string;
  title: string | null;
  file_path_relative: string;
  frontmatter: Record<string, unknown>;
  body_md: string;
  sensitivity: string | null;
  tags: string[];
  file_mtime: string | null;
  file_sha: string | null;
  last_synced: string;
};

export type VaultEdgeRow = {
  src_entity_id: string;
  relation_type: string;
  dst_entity_id: string;
  dst_resolved: boolean;
  source_kind: "relations_block" | "link_field";
};

export async function getEntity(
  supabase: SupabaseClient,
  entityId: string,
): Promise<{
  entity: VaultEntityRow | null;
  outbound: VaultEdgeRow[];
}> {
  const { data: entity, error: entErr } = await supabase
    .from("vault_entities")
    .select("*")
    .eq("entity_id", entityId)
    .maybeSingle();
  if (entErr) throw new Error(`getEntity entity fetch: ${entErr.message}`);
  if (!entity) return { entity: null, outbound: [] };

  const { data: edges, error: edgeErr } = await supabase
    .from("vault_edges")
    .select("src_entity_id, relation_type, dst_entity_id, dst_resolved, source_kind")
    .eq("src_entity_id", entityId)
    .order("relation_type")
    .order("dst_entity_id");
  if (edgeErr) throw new Error(`getEntity edges fetch: ${edgeErr.message}`);
  return { entity: entity as VaultEntityRow, outbound: (edges ?? []) as VaultEdgeRow[] };
}

export async function getNeighbors(
  supabase: SupabaseClient,
  entityId: string,
  options: { relation?: string } = {},
): Promise<Array<VaultEdgeRow & { dst_title: string | null }>> {
  let q = supabase
    .from("vault_edges")
    .select("src_entity_id, relation_type, dst_entity_id, dst_resolved, source_kind")
    .eq("src_entity_id", entityId);
  if (options.relation) q = q.eq("relation_type", options.relation);
  const { data: edges, error } = await q;
  if (error) throw new Error(`getNeighbors: ${error.message}`);

  const dsts = (edges ?? []).map((e) => e.dst_entity_id);
  if (!dsts.length) return [];
  const { data: ents, error: entErr } = await supabase
    .from("vault_entities")
    .select("entity_id, title")
    .in("entity_id", dsts);
  if (entErr) throw new Error(`getNeighbors title lookup: ${entErr.message}`);
  const titleById = new Map<string, string | null>();
  for (const e of ents ?? []) titleById.set(e.entity_id, e.title ?? null);

  return (edges ?? []).map((e) => ({
    ...(e as VaultEdgeRow),
    dst_title: titleById.get(e.dst_entity_id) ?? null,
  }));
}

export async function search(
  supabase: SupabaseClient,
  query: string,
  limit: number = 10,
): Promise<VaultEntityRow[]> {
  // ILIKE against title and body. pg_trgm GIN indexes keep this fast.
  const pattern = `%${query.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const { data: titleMatches, error: titleErr } = await supabase
    .from("vault_entities")
    .select("*")
    .ilike("title", pattern)
    .limit(limit);
  if (titleErr) throw new Error(`search title: ${titleErr.message}`);

  if ((titleMatches?.length ?? 0) >= limit) {
    return (titleMatches ?? []) as VaultEntityRow[];
  }

  const remaining = limit - (titleMatches?.length ?? 0);
  const titleIds = new Set((titleMatches ?? []).map((r) => r.entity_id));
  const { data: bodyMatches, error: bodyErr } = await supabase
    .from("vault_entities")
    .select("*")
    .ilike("body_md", pattern)
    .limit(remaining + titleIds.size);
  if (bodyErr) throw new Error(`search body: ${bodyErr.message}`);

  const bodyOnly = (bodyMatches ?? []).filter((r) => !titleIds.has(r.entity_id)).slice(0, remaining);
  return [
    ...((titleMatches ?? []) as VaultEntityRow[]),
    ...(bodyOnly as VaultEntityRow[]),
  ];
}

export type HealthSummary = {
  by_type: Record<string, number>;
  total_entities: number;
  total_edges: number;
  asymmetries: number | null;
  files_failed: number | null;
  last_sync: string | null;
  last_run_id: number | null;
  recent_errors: Array<{ file_path_relative: string; error_kind: string; message: string }>;
};

export async function health(supabase: SupabaseClient): Promise<HealthSummary> {
  const { data: types, error: typeErr } = await supabase
    .from("vault_entities")
    .select("entity_type");
  if (typeErr) throw new Error(`health types: ${typeErr.message}`);
  const byType: Record<string, number> = {};
  for (const r of types ?? []) byType[r.entity_type] = (byType[r.entity_type] ?? 0) + 1;
  const totalEntities = (types ?? []).length;

  const { count: edgeCount, error: edgeErr } = await supabase
    .from("vault_edges")
    .select("*", { count: "exact", head: true });
  if (edgeErr) throw new Error(`health edges: ${edgeErr.message}`);

  const { data: lastRun, error: runErr } = await supabase
    .from("vault_sync_runs")
    .select("id, asymmetries_count, files_failed, finished_at")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runErr) throw new Error(`health last run: ${runErr.message}`);

  let recentErrors: HealthSummary["recent_errors"] = [];
  if (lastRun?.id) {
    const { data: errs, error: errsErr } = await supabase
      .from("vault_sync_run_errors")
      .select("file_path_relative, error_kind, message")
      .eq("run_id", lastRun.id)
      .neq("error_kind", "unresolved_wikilink")
      .limit(10);
    if (errsErr) throw new Error(`health errors: ${errsErr.message}`);
    recentErrors = errs ?? [];
  }

  return {
    by_type: byType,
    total_entities: totalEntities,
    total_edges: edgeCount ?? 0,
    asymmetries: lastRun?.asymmetries_count ?? null,
    files_failed: lastRun?.files_failed ?? null,
    last_sync: lastRun?.finished_at ?? null,
    last_run_id: lastRun?.id ?? null,
    recent_errors: recentErrors,
  };
}
