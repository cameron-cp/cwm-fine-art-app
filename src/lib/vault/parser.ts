// Markdown frontmatter parser for the chloe-second-brain vault.
// Mirrors chloe-second-brain/tools/_vault_lib.py:
//   split_frontmatter, parse_scalars, extract_relations, extract_link_fields.
// We intentionally do NOT use gray-matter — see ADRs 0001 and 0005.

import { parse as parseYaml } from "yaml";
import type {
  ParsedEdge,
  ParsedEntity,
  ParseError,
  ParseResult,
} from "./types";

const WIKILINK_RE = /\[\[([^\[\]]+?)\]\]/g;

export function splitFrontmatter(text: string): { fm: string; body: string } {
  if (!text.startsWith("---")) return { fm: "", body: text };
  const lines = text.split("\n");
  if (lines[0].trim() !== "---") return { fm: "", body: text };
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx < 0) return { fm: "", body: text };
  return {
    fm: lines.slice(1, endIdx).join("\n"),
    body: lines.slice(endIdx + 1).join("\n"),
  };
}

function findAllWikilinks(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(WIKILINK_RE)) out.push(m[1]);
  return out;
}

function dedupe<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of items) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

function stripRelationsBlock(fmText: string): string {
  const lines = fmText.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^relations:\s*$/.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      // End the skip when we hit a non-indented, non-empty line.
      if (line && !/^[ \t]/.test(line)) {
        skipping = false;
        out.push(line);
        continue;
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

export type ParseScalarsResult = {
  data: Record<string, unknown>;
  error: ParseError | null;
};

export function parseScalars(
  fmText: string,
  filePathRelative: string,
): ParseScalarsResult {
  // Drop the relations: block (parsed separately), then quote any remaining
  // [[wikilinks]] so YAML doesn't trip on the brackets.
  const cleaned = stripRelationsBlock(fmText);
  const sanitized = cleaned.replace(WIKILINK_RE, (_m, inner) => `"[[${inner}]]"`);
  try {
    const data = parseYaml(sanitized);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return { data: data as Record<string, unknown>, error: null };
    }
    return { data: {}, error: null };
  } catch (err) {
    return {
      data: {},
      error: {
        file_path_relative: filePathRelative,
        error_kind: "yaml_parse",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export function extractRelations(fmText: string): Record<string, string[]> {
  const relations: Record<string, string[]> = {};
  let inBlock = false;
  let currentKey: string | null = null;
  for (const rawLine of fmText.split("\n")) {
    if (/^relations:\s*$/.test(rawLine)) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    // End of block: a non-indented line.
    if (rawLine && !/^[ \t]/.test(rawLine)) break;
    // Drop inline comments.
    const line = rawLine.replace(/\s+#.*$/, "");
    const stripped = line.trim();
    if (!stripped) continue;
    if (stripped.startsWith("-")) {
      if (currentKey != null) {
        const links = findAllWikilinks(stripped);
        if (!relations[currentKey]) relations[currentKey] = [];
        relations[currentKey].push(...links);
      }
    } else if (stripped.includes(":")) {
      const colonIdx = stripped.indexOf(":");
      const keyPart = stripped.slice(0, colonIdx);
      const rest = stripped.slice(colonIdx + 1);
      currentKey = keyPart.trim();
      if (!relations[currentKey]) relations[currentKey] = [];
      const links = findAllWikilinks(rest);
      if (links.length) relations[currentKey].push(...links);
    }
  }
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(relations)) out[k] = dedupe(v);
  return out;
}

export function extractLinkFields(fmText: string): Record<string, string[]> {
  // Top-level frontmatter scalars whose values contain [[wikilinks]].
  // Excludes the relations: block. Catches `artist: [[artists/x]]` on objects, etc.
  const out: Record<string, string[]> = {};
  let inRelations = false;
  for (const line of fmText.split("\n")) {
    if (/^relations:\s*$/.test(line)) {
      inRelations = true;
      continue;
    }
    if (inRelations) {
      if (line && !/^[ \t]/.test(line)) {
        inRelations = false;
        // Fall through so this line itself can be considered.
      } else {
        continue;
      }
    }
    if (!line || /^[ \t]/.test(line)) continue;
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const rest = m[2].replace(/\s+#.*$/, "");
    const links = findAllWikilinks(rest);
    if (links.length) out[key] = dedupe(links);
  }
  return out;
}

export function extractTitle(body: string): string | null {
  for (const line of body.split("\n")) {
    if (line.startsWith("# ")) return line.slice(2).trim();
  }
  return null;
}

function extractInlineHashtags(body: string): string[] {
  // Match #word but not URL fragments or markdown anchors.
  const out: string[] = [];
  const re = /(^|\s)#([A-Za-z][\w-]*)/g;
  for (const m of body.matchAll(re)) out.push(m[2]);
  return out;
}

export type ParseFileInput = {
  text: string;
  filePathRelative: string;
  entityType: string;
  slug: string;
  fileSha: string;
  fileMtimeIso: string;
};

export function parseFile(input: ParseFileInput): ParseResult {
  const { text, filePathRelative, entityType, slug, fileSha, fileMtimeIso } = input;
  const errors: ParseError[] = [];
  const { fm, body } = splitFrontmatter(text);

  const { data: scalars, error: yamlError } = parseScalars(fm, filePathRelative);
  if (yamlError) errors.push(yamlError);

  const relations = extractRelations(fm);
  const linkFields = extractLinkFields(fm);

  // Compose edges.
  const edges: ParsedEdge[] = [];
  const seen = new Set<string>();
  const pushEdge = (
    relation_type: string,
    dst_entity_id: string,
    source_kind: ParsedEdge["source_kind"],
  ) => {
    const key = `${relation_type}|${dst_entity_id}|${source_kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ relation_type, dst_entity_id, source_kind });
  };
  for (const [rel, targets] of Object.entries(relations)) {
    for (const t of targets) pushEdge(rel, t, "relations_block");
  }
  for (const [field, targets] of Object.entries(linkFields)) {
    for (const t of targets) pushEdge(field, t, "link_field");
  }

  // Frontmatter stored on the row excludes both relations and link-field keys
  // (they live in vault_edges instead). Keep everything else as-is.
  const frontmatter: Record<string, unknown> = { ...scalars };
  for (const k of Object.keys(linkFields)) delete frontmatter[k];
  delete frontmatter["relations"];

  const sensitivity =
    typeof scalars["sensitivity"] === "string"
      ? (scalars["sensitivity"] as string)
      : null;

  // Tags: union of YAML tags + inline #hashtags. Dedupe.
  const yamlTags = Array.isArray(scalars["tags"])
    ? (scalars["tags"] as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const tags = dedupe([...yamlTags, ...extractInlineHashtags(body)]);

  const title = extractTitle(body) ?? (typeof scalars["title"] === "string" ? (scalars["title"] as string) : null);
  const entity_id = `${entityType}/${slug}`;

  const entity: ParsedEntity = {
    entity_id,
    entity_type: entityType,
    slug,
    title,
    file_path_relative: filePathRelative,
    frontmatter,
    body_md: body,
    sensitivity,
    tags,
    file_mtime: fileMtimeIso,
    file_sha: fileSha,
    edges,
  };
  return { ok: true, entity, errors };
}
