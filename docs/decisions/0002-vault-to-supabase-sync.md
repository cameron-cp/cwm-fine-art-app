# 0002 — Push-based vault → Supabase sync

Status: accepted (2026-05-08)

## Context

The vault is a markdown directory at `~/chloe-second-brain/`, written by Python
tools and Claude skills. The CRM needs Supabase to mirror its current state so
the Next.js UI (M2+) can query it without filesystem access.

Options considered:

1. **Push-based sync** — a script on Cameron's machine reads the vault and
   writes the index to Supabase via service-role.
2. **Pull-based ingest** — Netlify scheduled function clones a git repo of the
   vault and ingests it server-side.
3. **Bidirectional** — UI writes back to the vault.

## Decision

Option 1: push-based, single-writer, on demand.

## Consequences

- The vault stays canonical on the local filesystem; Supabase is a derived
  read-only index.
- Single writer means atomic-swap semantics are trivially safe (no
  concurrent writers).
- Sync is explicit (`npm run crm -- sync`). M1 has no scheduler; M4 wires the
  daily-ingest skill to invoke it.
- Service-role key never leaves Cameron's machine — no key rotation in
  Netlify, no risk of accidental write from the deployed app.
- Cost: Chloe needs to run sync herself eventually. Out of M1 — M2 will
  decide between teaching her the CLI or running sync from her machine via
  the same script.
