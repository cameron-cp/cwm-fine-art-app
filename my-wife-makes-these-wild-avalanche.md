# art-app — V1 Ship Readiness

_Chloe Waddington Fine Art tearsheet tool. The one metric: **Chloe clicks one button and gets a PDF that matches her Word layout.**_

> Scope note: this doc describes what the code **actually is today**, verified by reading the repo — not what `CLAUDE.md` planned. Where the two disagree, that's flagged as drift, not silently reconciled.

---

## Pass 1 — Codebase Reality Check (evidence, not estimates)

Every claim below traces to a file I read. Grep any of it.

### Stack (from [package.json](package.json))

- Next.js **16.2.4** App Router, React **19.2.4**, TypeScript 5
- Clerk `@clerk/nextjs` **7.3.0** (auth)
- Supabase `@supabase/ssr` 0.10.2 + `@supabase/supabase-js` 2.105.3
- Radix Themes 3.3, TanStack Query 5.100, react-hook-form 7.75 + Zod **4.4.3**, nuqs 2.8
- `@anthropic-ai/sdk` 0.93 (AI import), `yaml` 2.8 (vault parsing)
- Test: Vitest 4.1 (`npm test` → `vitest run`)

### Routes that exist (from `find src/app`)

| Route | File | Purpose |
|---|---|---|
| `/` | [src/app/page.tsx](src/app/page.tsx) | landing |
| `/artists`, `/artists/new`, `/artists/[id]` | [src/app/(app)/artists/](src/app/(app)/artists/) | artist CRUD |
| `/artworks`, `/artworks/new`, `/artworks/[id]` | [src/app/(app)/artworks/](src/app/(app)/artworks/) | artwork CRUD |
| `/artworks/import`, `/artworks/import/review` | [src/app/(app)/artworks/import/](src/app/(app)/artworks/import/) | AI-assisted import |
| `/tearsheet/render/[id]` | [src/app/tearsheet/render/[id]/page.tsx](src/app/tearsheet/render/[id]/page.tsx) | PDF source page (token-gated) |
| `POST /api/tearsheet/[id]` | [src/app/api/tearsheet/[id]/route.ts](src/app/api/tearsheet/[id]/route.ts) | Browserless → PDF |
| `POST /api/artworks/import` | [src/app/api/artworks/import/route.ts](src/app/api/artworks/import/route.ts) | import ingest |
| `/buyer-premium`, `/calculator` | [src/app/(app)/buyer-premium/](src/app/(app)/buyer-premium/), [src/app/(app)/calculator/](src/app/(app)/calculator/) | auction calculators |
| `/sign-in`, `/sign-up` | [src/app/sign-in/](src/app/sign-in/), [src/app/sign-up/](src/app/sign-up/) | Clerk |

### Data model — as migrated, not as `CLAUDE.md` describes

Migrations in [supabase/migrations/](supabase/migrations/): `0001_init`, `0002_storage`, `0003_factsheet_format`, `0004_import_drafts`, `0005_vault_index`.

`0003` ([supabase/migrations/0003_factsheet_format.sql](supabase/migrations/0003_factsheet_format.sql)) **reshaped `artworks`**: dropped `dimensions` and `provenance` (free text), added `signature_details`, `height_in`/`width_in`/`depth_in numeric(8,2)`, `catalogue_raisonne`, `literature`, `provenance_lines text[]`. The Zod schema in [src/lib/schemas/artwork.ts](src/lib/schemas/artwork.ts) matches this shape (provenance stored flat `text[]`, entered in the form as `[{value}]`).

### The tearsheet pipeline (the wedge — end to end)

1. **Button** [generate-tearsheet-button.tsx:14](src/app/(app)/artworks/[id]/generate-tearsheet-button.tsx#L14) → `POST /api/tearsheet/${artworkId}`, downloads the returned blob as `<title>-tearsheet.pdf`.
2. **API route** [route.ts:8-75](src/app/api/tearsheet/[id]/route.ts#L8-L75): Clerk `auth()` gate → builds `renderUrl` with `TEARSHEET_RENDER_SECRET` token → calls Browserless `production-sfo.browserless.io/pdf` (`format: Letter`, `printBackground`, `preferCSSPageSize`) → streams PDF back.
3. **Render page** [render/[id]/page.tsx:39-60](src/app/tearsheet/render/[id]/page.tsx#L39-L60): `force-dynamic`, verifies `?token` === `TEARSHEET_RENDER_SECRET` (else `notFound()`), loads artwork via **service-role** Supabase client, signs the image URL for 600s, renders header/image/meta/provenance/literature with [tearsheet.css](src/app/tearsheet/render/[id]/tearsheet.css). Brand string `GALLERY_NAME = "Chloe Waddington Fine Art"` from [src/lib/brand.ts](src/lib/brand.ts).
4. **Public access**: [middleware.ts:6](src/middleware.ts#L6) whitelists `/tearsheet/render(.*)` so Browserless can reach it; the shared-secret token is the only guard on that route.

### Env gates (from [src/lib/env.ts](src/lib/env.ts))

`BROWSERLESS_API_KEY` and `TEARSHEET_RENDER_SECRET` are **optional** in the schema but the route returns **500** if either is missing ([route.ts:23-34](src/app/api/tearsheet/[id]/route.ts#L23-L34)). `ANTHROPIC_API_KEY` gates import. `SUPABASE_SERVICE_ROLE_KEY` falls back to the publishable key in the render page ([render/[id]/page.tsx:16-18](src/app/tearsheet/render/[id]/page.tsx#L16-L18)) — a fallback that only works if RLS lets `anon` read, see risk R2.

### Verification tooling (observable, run 2026-07-10)

- `npm test` → **38 passed (3 files)**, all under [src/lib/vault/__tests__/](src/lib/vault/__tests__/) (parser, sync, reciprocity). **Zero tests** on the artwork/tearsheet/import path.
- `npx tsc --noEmit` → **exit 0** (clean).

---

## Pass 2 — Status vs. the V1 wedge

`CLAUDE.md` defines the wedge as three things. Status is code-backed; "wired" = the full path exists and typechecks.

| Wedge item | Status | Evidence |
|---|---|---|
| **1. Add/edit artists** | ✅ Wired | routes + [artists/actions.ts](src/app/(app)/artists/actions.ts) exist; typecheck clean |
| **2. Add/edit artworks + image upload** | ✅ Wired | [artworks/actions.ts](src/app/(app)/artworks/actions.ts) has `createArtwork`/`updateArtwork`/`deleteArtwork`/`recordArtworkImage`; storage bucket `artworks` in `0002_storage` |
| **3. "Generate Tearsheet" → PDF** | ⚠️ Wired in code, **unverified against a real Word sheet or live Browserless** | full pipeline above exists and typechecks; but no test, no confirmed 1:1 layout match, no confirmed live render |

**Beyond-V1 code already shipped** (scope expansion vs. `CLAUDE.md` "out of scope"): AI import (`/artworks/import` + `@anthropic-ai/sdk`), a whole **vault → Supabase sync** subsystem ([src/lib/vault/](src/lib/vault/), 6 ADRs in [docs/decisions/](docs/decisions/), migrations 0004–0005), and two **auction/buyer-premium calculators**. None of this serves the PDF-button wedge.

---

## The one critical path to "Chloe gets a real PDF this week"

Smallest shippable increment, in order. Stop when she's using it.

1. **Prove the PDF renders live.** Set `BROWSERLESS_API_KEY`, `TEARSHEET_RENDER_SECRET`, `NEXT_PUBLIC_APP_URL` in the deployed env. Create one real artwork with a real image. Click the button. **Success = a PDF downloads.** (Today this is unverified — the route 500s without those two secrets.)
2. **Match her Word layout 1:1.** Put the generated PDF next to her current Word sheet. Fix [tearsheet.css](src/app/tearsheet/render/[id]/tearsheet.css) until they match. **Success = side-by-side is indistinguishable.** ← _blocked on having her actual sheet; this is the real gate, not code._
3. **Lock the render path so it can't silently break.** One integration check that `POST /api/tearsheet/[id]` returns `application/pdf` for a seeded artwork (see R1). **Success = the test fails on `main` if the pipeline breaks.**

### Explicitly NOT doing now (state it, per focus doctrine)

- Collectors / interests / provenance chain / exhibitions / email flows (all `CLAUDE.md` out-of-scope, still out)
- More vault/import/calculator work — it's already ahead of the wedge; freeze it until the PDF button is confirmed in Chloe's hands
- Multi-template, batch export

---

## Real blockers & risks (found while reading — not a rosy summary)

- **R0 — Layout match is the actual constraint, and it's human-gated.** The code path is done; "matches her Word layout" (`CLAUDE.md` open question) can't be verified without her real sheet. This, not engineering, is what gates ship. **Get the sheet.**
- **R1 — Zero tests on the wedge.** All 38 tests cover the vault subsystem; the tearsheet/artwork/import path has none. The one part that matters most is the least protected.
- **R2 — RLS is not per-user, contradicting `CLAUDE.md`.** [0001_init.sql:72-85](supabase/migrations/0001_init.sql#L72-L85) grants `to authenticated using(true)` — any authenticated session has full access, not "keyed to the single Clerk user id" as `CLAUDE.md` claims. Fine for a single-user app today; a landmine if a second identity ever authenticates. Also: the render page's fallback to the publishable key only reads data if `anon`/`authenticated` RLS permits — confirm the service-role key is actually set in prod so tearsheets don't silently 404.
- **R3 — `CLAUDE.md` data model is stale.** It still lists `dimensions text` / `provenance text` / artist `bio`; the migrated schema is the factsheet format (`0003`). Update `CLAUDE.md` so the next agent doesn't build against the wrong columns.
- **R4 — Secret in query string.** `TEARSHEET_RENDER_SECRET` rides in the render URL ([route.ts:37](src/app/api/tearsheet/[id]/route.ts#L37)). Acceptable for a single-user tool + rotating secret; note it exists.

---

## Bottom line

The engine is built and typechecks clean. Nothing here is a code sprint — it's a **verification sprint**: get Chloe's real sheet, render one live PDF, tune the CSS to match, add one guard test. That's this-week work, and everything else in the repo should wait behind it.
