# 0001 — Mirror vault reciprocity vocabulary in TypeScript

Status: accepted (2026-05-08)

## Context

The vault's reciprocity vocabulary lives in
`~/chloe-second-brain/tools/_vault_lib.py`:
`RECIPROCAL_RELATIONS`, `SYMMETRIC_RELATIONS`, `SECTION_ROUTED_INVERSES`, and
the `inverse_of(key, target)` routing function. The art-app sync script needs
that same vocabulary to compute asymmetries and resolve inverses.

Two ways to get it into the TS code:

1. **Mirror it.** Hand-port the constants and `inverseOf` into TypeScript.
2. **Shell out.** Spawn `python3 -c …` from sync to ask `_vault_lib.py`.

## Decision

Mirror it. The TS reciprocity module duplicates the constants verbatim.

## Consequences

- Zero runtime Python dependency on Chloe's machine. The CLI runs with `tsx`.
- Drift risk: when `_vault_lib.py` changes its vocabulary, the TS port goes
  stale silently.
- Mitigation: the parity test in `reciprocity.test.ts` shells out to
  `python3 -c "from _vault_lib import inverse_of; …"` for a hand-picked set
  of cases (including all section-routed targets and both symmetric
  directions). Run it after any vocabulary edit; CI on Cameron's machine
  will catch drift.
