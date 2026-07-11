// CRM CLI dispatcher. Run from the art-app repo root:
//   npm run crm -- sync
//   npm run crm -- get clients/howard-rachofsky
//   npm run crm -- neighbors objects/foo --rel artist
//   npm run crm -- search "Mitchell Untitled"
//   npm run crm -- health
//
// Reads VAULT_PATH (defaults to ~/chloe-second-brain) and uses the Supabase
// service role from .env.local. Service-role bypasses RLS, so this script
// runs only on a developer machine — never in any deployed Next.js context.

import "dotenv/config";
import { homedir } from "node:os";
import path from "node:path";
import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import { runSync } from "../src/lib/vault/sync";
import { runSeedParties } from "../src/lib/vault/seedParties";
import { getEntity, getNeighbors, search, health } from "../src/lib/vault/queries";

const DEFAULT_VAULT = path.join(homedir(), "chloe-second-brain");

function vaultPath(): string {
  return process.env.VAULT_PATH || DEFAULT_VAULT;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function cmdSync(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const result = await runSync({
    vaultPath: vaultPath(),
    supabase,
    log: (m) => console.error(`[sync] ${m}`),
  });
  console.log(
    `synced ${result.entities_upserted} entities, ${result.edges_upserted} edges, ` +
    `${result.asymmetries_count} asymmetries, files_failed=${result.files_failed}, ` +
    `${(result.duration_ms / 1000).toFixed(1)}s`,
  );
}

async function cmdSeedParties(args: string[]): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const supabase = getSupabaseAdmin();
  const result = await runSeedParties({
    vaultPath: vaultPath(),
    supabase,
    dryRun,
    log: (m) => console.error(`[seed] ${m}`),
  });
  console.log(
    `${result.dry_run ? "[dry-run] " : ""}` +
      `clients=${result.clients_seen} skipped=${result.skipped} ` +
      `dup_names=${result.duplicate_names} already_present=${result.already_present} ` +
      `inserted=${result.parties_inserted} roles=${result.roles_inserted} ` +
      `with_email=${result.with_email}`,
  );
}

async function cmdGet(entityId?: string): Promise<void> {
  if (!entityId) fail("usage: crm get <entity_id>   e.g. clients/howard-rachofsky");
  const supabase = getSupabaseAdmin();
  const { entity, outbound } = await getEntity(supabase, entityId!);
  if (!entity) fail(`not found: ${entityId}`);
  console.log(`# ${entity.entity_id}`);
  console.log(`type:        ${entity.entity_type}`);
  console.log(`title:       ${entity.title ?? ""}`);
  console.log(`file:        ${entity.file_path_relative}`);
  if (entity.sensitivity) console.log(`sensitivity: ${entity.sensitivity}`);
  if (entity.tags.length) console.log(`tags:        ${entity.tags.join(", ")}`);
  console.log(`last_synced: ${entity.last_synced}`);
  console.log(``);
  const fmKeys = Object.keys(entity.frontmatter);
  if (fmKeys.length) {
    console.log(`## frontmatter`);
    for (const k of fmKeys) {
      const v = entity.frontmatter[k];
      console.log(`  ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
    }
    console.log(``);
  }
  if (outbound.length) {
    console.log(`## edges`);
    const groups: Record<string, typeof outbound> = {};
    for (const e of outbound) (groups[e.relation_type] ||= []).push(e);
    for (const rel of Object.keys(groups).sort()) {
      console.log(`  ${rel}:`);
      for (const e of groups[rel]) {
        const tag = e.dst_resolved ? "" : " [unresolved]";
        const src = e.source_kind === "link_field" ? " (link_field)" : "";
        console.log(`    - ${e.dst_entity_id}${tag}${src}`);
      }
    }
  }
}

async function cmdNeighbors(args: string[]): Promise<void> {
  const entityId = args[0];
  if (!entityId) fail("usage: crm neighbors <entity_id> [--rel TYPE]");
  let relation: string | undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--rel" && args[i + 1]) {
      relation = args[i + 1];
      i++;
    }
  }
  const supabase = getSupabaseAdmin();
  const rows = await getNeighbors(supabase, entityId, { relation });
  if (!rows.length) {
    console.log(`(no neighbors${relation ? ` for relation '${relation}'` : ""})`);
    return;
  }
  for (const r of rows) {
    const tag = r.dst_resolved ? "" : " [unresolved]";
    const src = r.source_kind === "link_field" ? " (link_field)" : "";
    const title = r.dst_title ? ` — ${r.dst_title}` : "";
    console.log(`${r.relation_type}\t${r.dst_entity_id}${title}${tag}${src}`);
  }
}

async function cmdSearch(args: string[]): Promise<void> {
  const query = args.join(" ").trim();
  if (!query) fail("usage: crm search <query>");
  const supabase = getSupabaseAdmin();
  const rows = await search(supabase, query, 10);
  if (!rows.length) {
    console.log(`(no matches for "${query}")`);
    return;
  }
  for (const r of rows) {
    console.log(`${r.entity_id}\t${r.title ?? ""}`);
  }
}

async function cmdHealth(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const h = await health(supabase);
  console.log(`entities:    ${h.total_entities}`);
  console.log(`edges:       ${h.total_edges}`);
  console.log(`asymmetries: ${h.asymmetries ?? "?"}`);
  console.log(`files_failed:${h.files_failed ?? "?"}`);
  console.log(`last_sync:   ${h.last_sync ?? "(never)"}`);
  console.log(``);
  console.log(`by type:`);
  for (const t of Object.keys(h.by_type).sort()) {
    console.log(`  ${t.padEnd(20)} ${h.by_type[t]}`);
  }
  if (h.recent_errors.length) {
    console.log(``);
    console.log(`recent errors (excl. unresolved wikilinks):`);
    for (const e of h.recent_errors) {
      console.log(`  [${e.error_kind}] ${e.file_path_relative}: ${e.message}`);
    }
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "sync":         return cmdSync();
    case "seed-parties": return cmdSeedParties(rest);
    case "get":       return cmdGet(rest[0]);
    case "neighbors": return cmdNeighbors(rest);
    case "search":    return cmdSearch(rest);
    case "health":    return cmdHealth();
    case undefined:
    case "--help":
    case "-h":
      console.log(`crm — vault index CLI

  npm run crm -- sync
  npm run crm -- seed-parties [--dry-run]
  npm run crm -- get <entity_id>
  npm run crm -- neighbors <entity_id> [--rel TYPE]
  npm run crm -- search <query>
  npm run crm -- health

VAULT_PATH defaults to ~/chloe-second-brain.
`);
      return;
    default:
      fail(`unknown command: ${cmd}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
