# 0004 — Defer Postgres FTS to M2

Status: accepted (2026-05-08)

## Context

Search in M1 is a CLI subcommand: `npm run crm -- search <query>`. The plan
originally proposed Postgres FTS (`tsvector` + ranking + GIN-on-tsvector)
right away. Two problems:

1. The query patterns FTS needs to optimize for aren't visible until M2's UI
   exists. Weighting `title` vs `body` vs `slug` vs `inventory_id` without
   feedback is guesswork.
2. ILIKE with `pg_trgm` GIN indexes is fast enough at ~1k rows for the CLI
   and any plausible M1 demo.

## Decision

M1 ships ILIKE search backed by `pg_trgm` GIN indexes on `title` and
`body_md`. FTS work happens in M2 alongside the UI.

## Consequences

- One fewer thing to design and migrate before M1 demo.
- pg_trgm indexes are useful regardless — they make ILIKE fast and survive
  into M2 (ranking can layer on top of them).
- M2 will replace `search()` in `queries.ts` with a `tsvector`-based query.
- No data migration required when M2 adds FTS — `tsvector` is a generated
  column on the existing tables.
