# 0003 — Shadow tables + atomic swap for full re-sync

Status: accepted (2026-05-08)

## Context

A naive sync would per-file delete-then-insert. Three problems with that:

1. **Crash safety** — sync interrupted mid-walk leaves the index in a torn
   state with some files updated and others stale.
2. **File deletion** — articles removed from disk would never get cleared
   because the loop only sees what's currently on disk.
3. **Round-trip count** — ~1,000 files × ~3 statements each = ~3,000
   sequential network round-trips. Painfully slow.

## Decision

Use shadow tables in a private `vault_internal` schema, bulk-load them, then
swap into production inside a single transaction.

1. `vault_sync_truncate_staging()` clears `vault_internal.entities_staging`
   and `vault_internal.edges_staging`.
2. The CLI bulk-loads parsed rows via `vault_sync_insert_entities(payload)`
   and `vault_sync_insert_edges(payload)` in chunks of ~500–2000 rows.
3. `vault_swap_from_staging()` does a sanity check (refuses if staging would
   delete >50% of production), then deletes production and inserts from
   staging — all in one PL/pgSQL transaction.

All three RPCs are SECURITY DEFINER with pinned `search_path`, and EXECUTE
is revoked from `public`/`anon`/`authenticated`. Service role bypasses those
checks; nobody else can call them.

## Consequences

- **Crash safety**: a crash before the swap leaves staging dirty but
  production untouched. Next sync truncates staging and starts over.
- **File deletion**: rebuild-from-scratch makes deletions automatic.
- **Round-trip count**: ~5 RPC calls total instead of thousands.
- **Atomicity from readers' POV**: production switches over in one
  transaction. M2 UI never sees a torn state.
- **Sanity guard**: catches a parser regression before it nukes the index.
- Cost: full re-sync each time, even if only one file changed. Acceptable
  for ~1k articles. Incremental sync is deferred to M4+ if ever needed.
