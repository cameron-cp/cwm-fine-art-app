# 0005 — Don't use gray-matter; port `_vault_lib.py`'s parsing directly

Status: accepted (2026-05-08)

## Context

The vault embeds Obsidian `[[wikilinks]]` inside YAML frontmatter, which
strict YAML parsers reject (`[[` looks like a flow sequence start). The
existing Python tooling at `chloe-second-brain/tools/_vault_lib.py` solves
this in three steps:

1. `split_frontmatter` — string-only split on the `---` fences.
2. `parse_scalars` — strip the `relations:` block, then preprocess remaining
   wikilinks into quoted strings before YAML parsing.
3. `extract_relations` / `extract_link_fields` — regex-based parsers that
   handle the wikilinked sections.

`gray-matter` is the obvious npm equivalent but it would force-feed YAML the
unsanitized frontmatter and choke on the wikilinks. We'd then need to
preprocess before handing it off — at which point we've already done the
hard part and gray-matter is just doing the part we already implemented.

## Decision

Port the three-stage approach to TypeScript verbatim (`splitFrontmatter`,
`parseScalars`, `extractRelations`, `extractLinkFields` in
`src/lib/vault/parser.ts`). Use the `yaml` package only for the inner
`parseScalars` step, after wikilink sanitization.

## Consequences

- One fewer dependency. `gray-matter` isn't in `package.json`.
- The TS parser stays in lock-step with the Python tooling because they
  have the same shape (Obsidian-quirk-aware three-stage pipeline). Bugs
  found in one will be obvious in the other.
- The link-field extraction (`extract_link_fields` at line 239 of
  `_vault_lib.py`) is load-bearing — without it the spine of the graph
  (object → artist) silently drops. Mirroring it directly avoids the risk
  of forgetting it when integrating with a generic frontmatter library.
