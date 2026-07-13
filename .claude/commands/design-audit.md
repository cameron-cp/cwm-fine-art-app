---
description: Weekly design-system audit — sweep the app UI for design-system violations, fix the clear ones, and open a machine-legible PR (no PR if clean).
---

ROLE: Design-system auditor for the art-app repo. You enforce the binding visual
contract; you do not redesign anything.

SOURCE OF TRUTH (read first, in this order):
1. Load the `design-system` skill (it carries the enforcement checklist).
2. Read docs/design/design-system.md in full.
3. Read the shared primitives so you fix *toward* them, never reinvent:
   src/components/{ledger,status-tag,field,alert}.tsx and src/app/globals.css (tokens).

SCOPE:
- IN: all *.tsx under src/app and src/components (the app UI).
- OUT (do not touch): src/app/tearsheet/**, src/app/invoice/** and *.css print
  templates (separate typographic world), Clerk-rendered chrome, node_modules,
  generated files, tests.

OBJECTIVE: Find every place the app UI violates the design system, fix the clear ones
with minimal mechanical diffs, and open ONE PR whose body is a machine-readable manifest
optimized for an LLM coding tool (NOT prose for humans).

=========================================================================
PHASE 1 — DETERMINISTIC SWEEP (run these; collect file:line hits verbatim)
=========================================================================
Every hit is a CANDIDATE (not yet confirmed):

- DS-COLOR-01 off-palette hue:
  grep -rniE "indigo|iris|mauve|violet|purple" src/app src/components --include=*.tsx
- DS-COLOR-02 non-sanctioned Radix color prop (only gray + functional red on error text
  are allowed; alerts must use <Alert>, see DS-ALERT-01):
  grep -rnE 'color="(blue|cyan|teal|jade|grass|lime|mint|sky|plum|pink|crimson|ruby|tomato|orange|brown|gold|bronze|amber|green|yellow)"' src/app src/components --include=*.tsx
- DS-COLOR-03 hardcoded hex in components (tokens belong in globals.css):
  grep -rniE "#[0-9a-fA-F]{3,8}\b" src/app src/components --include=*.tsx
- DS-COLOR-04 accent used outside a primary <Button> (links/labels must be ink):
  grep -rnE "var\(--accent-[0-9a]|accent-11|accent-a[0-9]" src/app src/components --include=*.tsx
- DS-SHAPE-01 rounded corners (status dots are the only exception):
  grep -rnE "rounded(-[a-z0-9]+)?\b" src/app src/components --include=*.tsx | grep -v "rounded-full"
- DS-SHAPE-02 shadows:
  grep -rniE "shadow-(sm|md|lg|xl|2xl)|drop-shadow|box-shadow" src/app src/components --include=*.tsx
- DS-SHAPE-03 surface/elevated tables (should be ghost ledger):
  grep -rn 'variant="surface"' src/app src/components --include=*.tsx
- DS-BADGE-01 candy pills (should be StatusTag or a squared outline chip):
  grep -rn "<Badge" src/app src/components --include=*.tsx
- DS-ALERT-01 raw Radix Callout (should be <Alert tone=...> from @/components/alert):
  grep -rn "Callout.Root\|Callout.Text\|from \"@radix-ui/themes\".*Callout" src/app src/components --include=*.tsx
- DS-FONT-01 banned faces:
  grep -rniE "\b(Inter|Noto|Space Grotesk|Roboto|Arial)\b" src/app src/components --include=*.tsx
- DS-COMPONENT-01 reimplemented primitive (local Field/StatusBadge/Th/Alert instead of shared):
  grep -rnE "function (Field|StatusBadge|Th|Alert)\(" src/app src/components --include=*.tsx

Also flag by inspection (judgment, not grep):
- DS-TYPE-01 a heading / artist-name / title NOT in the serif (must be font-serif / EB Garamond).
- DS-TYPE-02 a price / dimension / date / edition / id NOT in tabular mono (missing `.num`).
- DS-TYPE-03 an uppercase label WITHOUT letter-spacing (~.14em).

=========================================================================
PHASE 2 — CLASSIFY (fan out; verify each candidate before touching it)
=========================================================================
Spawn parallel subagents (one per rule group or per directory). For each candidate decide
VIOLATION vs INTENTIONAL-EXCEPTION vs FALSE-POSITIVE, citing the exact doc line. Default
to NOT changing when unsure. Known intentional exceptions — DO NOT "fix":
- `rounded-full` on 6px status dots (StatusTag / Alert glyph) — the sanctioned dot shape.
- Functional-red: `--danger`, and error text via Radix `color="red"` in components/field.tsx.
- The interactive nationality chip in artists/artist-form.tsx (neutral sand Badge holding ★/✕).
- Hex values inside globals.css token definitions (that IS the palette).
- `color="gray"` (maps to sand) and accent on a genuine single primary <Button variant=solid>.
- The shared primitives themselves (field/status-tag/ledger/alert.tsx) and thin domain
  wrappers that DELEGATE to them (e.g. artworks/status-badge.tsx) — not reimplementations.
If a candidate is a real gap the doc doesn't cover, DO NOT invent a fix — record it under
NEEDS_DOC_DECISION and leave the code unchanged.

=========================================================================
PHASE 3 — FIX (minimal, mechanical, behavior-preserving)
=========================================================================
- Use tokens (var(--paper/-2/-3), --ink/-2/-3, --claret, --sage, --amber, --danger,
  --rule/-2) and the shared primitives (<Th>, <StatusTag>, <Field>, <Alert>, `.num`).
  Never hardcode hex.
- Canonical mappings: surface table→`variant="ghost"` + <Th>; candy <Badge status>→
  <StatusTag tone=...>; categorical <Badge>→squared outline chip (border-[var(--rule-2)]
  px-[7px] py-[2px] text-[10px] uppercase tracking-[0.12em] text-[var(--ink-2)]); Radix
  Callout→<Alert tone=info|success|warning|error> (green→success, orange/amber→warning,
  blue→info, red→error); rounded-*→remove; accent link→text-[var(--ink)]; heading→add
  font-serif; number→wrap in `.num`.
- One commit per rule id: `fix(design): <RULE-ID> <short>`. No unrelated edits, refactors,
  copy changes, or behavior changes. Remove imports left unused by a fix.

=========================================================================
PHASE 4 — VERIFY (all must pass; capture raw output for the PR)
=========================================================================
- npx tsc --noEmit            → 0 errors
- npx eslint <changed files>  → 0 errors
- npm run build               → exits 0, routes emitted
- Re-run the PHASE 1 sweep    → every fixed rule now returns only known exceptions
If anything fails, fix or revert that commit; never open a red PR.

=========================================================================
PHASE 5 — BRANCH + PR
=========================================================================
- Branch: design-audit/<YYYY-MM-DD> off latest main. If ZERO real violations, open NO PR;
  print the manifest to stdout and stop.
- PR title: `design-audit: <YYYY-MM-DD> (<N> fixes across <M> files)`
- PR body MUST be exactly this schema, machine-first (no marketing prose):

```json
{
  "audit_date": "<YYYY-MM-DD>",
  "base_sha": "<git rev-parse main>",
  "rules_doc": "docs/design/design-system.md",
  "summary": {"files_scanned": N, "violations_fixed": N, "deferred": N, "exceptions_skipped": N},
  "by_rule": {"DS-SHAPE-01": {"found": N, "fixed": N}, "...": {}},
  "verification": {"tsc": "pass", "eslint": "pass", "build": "pass", "sweep_clean": true}
}
```
## FIXED
One record per fix, grouped by rule id:
- `DS-<RULE>#<n>` file=`path:line` commit=`<sha>`
  before: `<exact offending snippet>`
  after:  `<exact replacement snippet>`
  rule:   `docs/design/design-system.md#<section>`
## NEEDS_DOC_DECISION
- `path:line` — `<what>` — why the doc doesn't decide it. (code left unchanged)
## EXCEPTIONS_SKIPPED
- `path:line` — `<rule>` — reason it's intentional.
## REPRODUCE
```bash
<the exact PHASE 1 grep suite>
```
## VERIFICATION
```
<raw tsc / eslint / build tail + post-fix sweep output>
```

RULES: Keep the diff minimal and mechanical. No behavior/copy changes. No silent
truncation — if you cap the run, list what was deferred under `summary.deferred` with
file:line. Never touch OUT-of-scope files. Never introduce a hue, hex, shadow, rounded
corner, or raw Callout.
