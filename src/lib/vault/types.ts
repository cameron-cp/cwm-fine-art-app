export type EdgeSourceKind = "relations_block" | "link_field";

export type ParsedEdge = {
  relation_type: string;
  dst_entity_id: string;
  source_kind: EdgeSourceKind;
};

export type ParsedEntity = {
  entity_id: string;
  entity_type: string;
  slug: string;
  title: string | null;
  file_path_relative: string;
  frontmatter: Record<string, unknown>;
  body_md: string;
  sensitivity: string | null;
  tags: string[];
  file_mtime: string;
  file_sha: string;
  edges: ParsedEdge[];
};

export type ParseError = {
  file_path_relative: string;
  error_kind:
    | "yaml_parse"
    | "read_failed"
    | "malformed_relations"
    | "unresolved_wikilink";
  message: string;
};

export type ParseResult =
  | { ok: true; entity: ParsedEntity; errors: ParseError[] }
  | { ok: false; errors: ParseError[] };

export type SyncResultSummary = {
  run_id: number;
  files_seen: number;
  files_failed: number;
  entities_upserted: number;
  edges_upserted: number;
  asymmetries_count: number;
  duration_ms: number;
};
