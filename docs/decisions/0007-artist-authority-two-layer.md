# 0007 — Two-layer artist authority model (canonical cache + tenant link)

Status: accepted (2026-07-13)

## Context

Adding an artist meant hand-typing name, dates, nationality, and bio into
`/artists/new`. Errors land on client-facing tearsheets. We want the dealer to
type a name, pick a verified candidate from a public art authority, and have the
form prefill — editable, so she verifies before saving.

The data question: where does the authority's suggestion live relative to the
dealer's `artists` row?

## Decision

A **two-layer model**:

- `canonical_artists` — an app-owned **reference/authority cache**, keyed on the
  public authority ids (`wikidata_qid` / `ulan_id`). One row per real-world
  artist, shared. It is the *authority's suggestion*, written only through the
  `upsert_canonical_artist` SECURITY DEFINER RPC.
- `artists.canonical_artist_id` — a nullable FK linking the dealer's editable row
  to the canonical suggestion it was adopted from (`on delete set null`).

Reference data legitimately has no tenant boundary, so a single shared table is
the right shape **independent of tenancy**. This is not multi-tenant
infrastructure — the app stays single-user (`CLAUDE.md`); no tenant scoping is
added anywhere.

Sources: **Wikidata** (CC0) as the required primary, **Getty ULAN** (ODC-BY) as a
best-effort secondary that supplies the inverted filing name and fills gaps.

## Consequences

- Re-resolving the same artist from a second `artists` row reuses the cached
  canonical row (idempotent upsert by authority id) — no duplicates.
- **Getty never fails a resolve.** Getty ULAN's SPARQL endpoint returns "Service
  temporarily degraded" under load (observed live during development). A Getty
  failure/timeout degrades to a Wikidata-only record with `sources.getty =
  'unavailable'`; the resolve still succeeds and the picker shows a subtle note.
- The merged display name is always Wikidata's natural order; Getty's inverted
  "Surname, Given" only ever feeds `sort_name`, never the display name.
- Authority images (Wikidata P18 / Commons) are stored with attribution but are
  **never** shown on tearsheets or attached to artworks — licensing on Commons
  files is per-file and unverified here.
- P245 (ULAN on Wikidata) is crowd-edited; a malformed value is treated as
  no-ULAN at parse time, before it can reach a Getty query. DB CHECK constraints
  on `canonical_artists` are defense-in-depth behind the Zod gate.

## Deferred (explicitly not in this PR)

- Reconciling the existing LLM date/nationality fact-check with adopted authority
  data. Both affordances coexist for now: "Look up artist" (authority, factual)
  sits above "Draft with AI" (bio prose). Suppressing the LLM fact-check once a
  canonical record is adopted is future work.
- Reusing the picker in the artwork PDF-import review flow (`import-review.tsx`
  keeps its zero-latency inline artist create).
- Folding `artists` into a shared party model.

## Cleanup surfaced

Migration `0004` grants `match_artist_by_name` to `authenticated` but never
`revoke`s EXECUTE from `public`/`anon` — the older, incomplete grant pattern.
`0015` follows the hardened `0007`/`0013` pattern (revoke, then grant narrowly).
The `0004` gap is pre-existing and tracked separately, not repeated here.
