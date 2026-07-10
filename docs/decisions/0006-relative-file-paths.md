# 0006 — Store relative, not absolute, vault file paths

Status: accepted (2026-05-08)

## Context

Each `vault_entities` row records where the article lives on disk. Two ways
to do that:

1. **Absolute path** — e.g. `/Users/cameronwmaloney/chloe-second-brain/wiki/objects/foo.md`
2. **Relative path** — e.g. `wiki/objects/foo.md`

## Decision

Use relative paths in the `file_path_relative` column, keyed off the vault
root chosen at sync time (`VAULT_PATH` env, default `~/chloe-second-brain`).

## Consequences

- The database doesn't leak Cameron's home directory or username.
- When Chloe needs to run sync from her own machine, no backfill required —
  her `~/chloe-second-brain` resolves to the same relative paths.
- Anything that needs a full path (e.g. M2 deep-link "Open in Obsidian")
  reconstructs it as `${vaultPath}/${file_path_relative}` at runtime.
