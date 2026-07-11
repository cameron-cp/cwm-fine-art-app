// Seed the `parties` CRM table from the vault's wiki/clients/*.md articles.
//
// Reads the markdown directly off disk (reusing parseFile) rather than the
// vault_entities index — the index may be empty, and disk is always the freshest
// source. Each client becomes one `person` party; a best-effort standing role is
// derived from the article's frontmatter `type`.
//
// This is a one-time SEED, not an ongoing sync: after import the app owns the
// contacts and the vault is no longer canonical for them. So there is no persisted
// vault key — idempotency is run-time only: a contact whose display_name already
// exists is skipped, so a second run adds only new people and never overwrites
// a manual edit.
//
// Service-role only (called from scripts/crm.ts). Never import into a Next.js runtime.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseFile } from "./parser";
import type { ParsedEntity } from "./types";

// Vault frontmatter `type` -> party_roles.role (0007 enum). null = no standing
// role (still imported as a contact, role left unset). Unknown types also -> null.
export const TYPE_TO_ROLE: Record<string, string | null> = {
  collector: "collector",
  advisor: "advisory",
  dealer: "dealer",
  institution: "institution",
  "institutional-leader": "institution",
  "institution-staff": "institution",
  "studio-staff": "studio",
  "artist-staff": "studio",
  artist: "artist",
  // Real contacts with no clean role in the enum — imported, role left null:
  prospect: null,
  internal: null,
  press: null,
  gatekeeper: null,
  vendor: null,
  "artist-staff-lead": null,
};

// Types that are not real contacts and are skipped entirely.
const SKIP_TYPES = new Set(["redirect"]);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export function extractEmail(body: string): string | null {
  const m = body.match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

// Working email at a major auction house is a stronger, more specific signal of
// where someone works than the vault's generic `type` (often 'dealer'/'advisor'),
// so it overrides the type-derived role with 'auction_house'.
const AUCTION_HOUSE_EMAIL_MARKERS = ["sothebys", "christies"];

export function isAuctionHouseEmail(email: string | null): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return AUCTION_HOUSE_EMAIL_MARKERS.some((m) => lower.includes(m));
}

function frontmatterString(entity: ParsedEntity, key: string): string | null {
  const v = entity.frontmatter[key];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

// A "real contact" excludes stubs (single-touch shells) and redirect aliases.
export function shouldSkipClient(entity: ParsedEntity): boolean {
  if (entity.tags.includes("stub")) return true;
  const type = frontmatterString(entity, "type");
  if (type && SKIP_TYPES.has(type)) return true;
  return false;
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export type SeededParty = {
  vault_entity_id: string;
  kind: "person";
  display_name: string;
  email: string | null;
  notes: string | null;
  role: string | null;
};

// Pure mapping: one parsed client article -> one seeded party (+ optional role),
// or null when it isn't a real contact. Kept pure so it's unit-testable.
export function mapClientToParty(entity: ParsedEntity): SeededParty | null {
  if (shouldSkipClient(entity)) return null;

  const display_name = entity.title?.trim() || titleFromSlug(entity.slug);
  const email = extractEmail(entity.body_md);
  const type = frontmatterString(entity, "type");
  const role = isAuctionHouseEmail(email)
    ? "auction_house"
    : type
      ? (TYPE_TO_ROLE[type] ?? null)
      : null;

  const status = frontmatterString(entity, "status");
  const location = frontmatterString(entity, "location");
  const noteParts: string[] = [];
  if (status) noteParts.push(`Status: ${status}`);
  if (location) noteParts.push(`Location: ${location}`);
  const notes = noteParts.length ? noteParts.join(" · ") : null;

  return {
    vault_entity_id: entity.entity_id,
    kind: "person",
    display_name,
    email,
    notes,
    role,
  };
}

async function readClientEntities(vaultPath: string): Promise<ParsedEntity[]> {
  const clientsDir = path.join(vaultPath, "wiki", "clients");
  const dirStat = await fs.stat(clientsDir).catch(() => null);
  if (!dirStat?.isDirectory()) {
    throw new Error(`vault clients dir not found: ${clientsDir}`);
  }
  const names = await fs.readdir(clientsDir);
  const entities: ParsedEntity[] = [];
  for (const name of names) {
    if (name.startsWith(".") || !name.endsWith(".md")) continue;
    const abs = path.join(clientsDir, name);
    const stat = await fs.stat(abs);
    if (!stat.isFile()) continue;
    const text = await fs.readFile(abs, "utf8");
    const slug = name.replace(/\.md$/, "");
    const result = parseFile({
      text,
      filePathRelative: path.relative(vaultPath, abs),
      entityType: "clients",
      slug,
      fileSha: "",
      fileMtimeIso: stat.mtime.toISOString(),
    });
    if (result.ok) entities.push(result.entity);
  }
  return entities;
}

export type SeedPartiesOptions = {
  vaultPath: string;
  supabase: SupabaseClient;
  dryRun?: boolean;
  log?: (msg: string) => void;
};

export type SeedPartiesSummary = {
  clients_seen: number;
  skipped: number;
  duplicate_names: number;
  already_present: number;
  parties_inserted: number;
  roles_inserted: number;
  with_email: number;
  dry_run: boolean;
};

const CHUNK = 200;

function nameKey(s: string): string {
  return s.trim().toLowerCase();
}

export async function runSeedParties(
  options: SeedPartiesOptions,
): Promise<SeedPartiesSummary> {
  const { vaultPath, supabase, dryRun = false } = options;
  const log = options.log ?? (() => {});

  const entities = await readClientEntities(vaultPath);
  const mapped: SeededParty[] = [];
  for (const e of entities) {
    const m = mapClientToParty(e);
    if (m) mapped.push(m);
  }
  const skipped = entities.length - mapped.length;
  const withEmail = mapped.filter((m) => m.email).length;

  // Dedupe within the batch by display_name (case-insensitive), keeping the first.
  const seen = new Set<string>();
  const deduped: SeededParty[] = [];
  let duplicateNames = 0;
  for (const m of mapped) {
    const key = nameKey(m.display_name);
    if (seen.has(key)) {
      duplicateNames++;
      log(`duplicate name within vault, skipping: ${m.display_name} (${m.vault_entity_id})`);
      continue;
    }
    seen.add(key);
    deduped.push(m);
  }

  log(
    `parsed ${entities.length} clients → ${mapped.length} contacts ` +
      `(${skipped} skipped, ${duplicateNames} dup names, ${withEmail} with email)`,
  );

  // Run-time idempotency: skip contacts whose display_name already exists.
  const { data: existing, error: exErr } = await supabase
    .from("parties")
    .select("display_name");
  if (exErr) throw new Error(`existing parties fetch failed: ${exErr.message}`);
  const existingNames = new Set((existing ?? []).map((r) => nameKey(r.display_name)));
  const toInsert = deduped.filter((m) => !existingNames.has(nameKey(m.display_name)));
  const alreadyPresent = deduped.length - toInsert.length;
  if (alreadyPresent) log(`${alreadyPresent} already present by name, skipping`);

  if (dryRun) {
    return {
      clients_seen: entities.length,
      skipped,
      duplicate_names: duplicateNames,
      already_present: alreadyPresent,
      parties_inserted: 0,
      roles_inserted: 0,
      with_email: withEmail,
      dry_run: true,
    };
  }

  let partiesInserted = 0;
  let rolesInserted = 0;

  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const partyRows = chunk.map((m) => ({
      kind: m.kind,
      display_name: m.display_name,
      email: m.email,
      notes: m.notes,
    }));
    const { data, error } = await supabase
      .from("parties")
      .insert(partyRows)
      .select("id, display_name");
    if (error) throw new Error(`parties insert failed: ${error.message}`);
    partiesInserted += data?.length ?? 0;

    // Match inserted ids back to their role by display_name (unique within batch).
    const idByName = new Map<string, string>();
    for (const row of data ?? []) idByName.set(nameKey(row.display_name), row.id);

    const roleRows = chunk
      .filter((m) => m.role)
      .map((m) => ({ party_id: idByName.get(nameKey(m.display_name)), role: m.role! }))
      .filter((r): r is { party_id: string; role: string } => Boolean(r.party_id));
    if (roleRows.length) {
      const { error: roleErr, count } = await supabase
        .from("party_roles")
        .upsert(roleRows, { onConflict: "party_id,role", ignoreDuplicates: true, count: "exact" });
      if (roleErr) throw new Error(`party_roles insert failed: ${roleErr.message}`);
      rolesInserted += count ?? roleRows.length;
    }
    log(`inserted ${Math.min(i + CHUNK, toInsert.length)}/${toInsert.length}`);
  }

  return {
    clients_seen: entities.length,
    skipped,
    duplicate_names: duplicateNames,
    already_present: alreadyPresent,
    parties_inserted: partiesInserted,
    roles_inserted: rolesInserted,
    with_email: withEmail,
    dry_run: false,
  };
}
