# Stack

Running record of every service, dependency, and account art-app depends on.
Grounded in `package.json`, `.env.example`, `src/lib/env.ts`, and `netlify.toml`
as of 2026-07-11. Update this when a dependency or provider changes.

## Hosting & infra

| Concern | Provider | Notes |
| --- | --- | --- |
| App hosting / deploy | **Netlify** | `netlify.toml`; build `npm run build`, publish `.next`. Secrets scanner omits `NEXT_PUBLIC_*` keys by design. |
| Database + Storage + Auth-adjacent RLS | **Supabase** | Postgres, Storage bucket `artworks`, RLS keyed to the single Clerk user. `@supabase/supabase-js`, `@supabase/ssr`. |
| DNS & domain registrar | **Cloudflare** | DNS for `chloewaddington.com` (incl. SPF/DKIM/DMARC for the Resend sending domain) + domain registrar. Likely to take on more (proxy/CDN, email routing) over time. |
| Secrets management | **Doppler** | Injects env vars across environments (owner-stated; not a repo file). |
| Scheduled jobs / cron | **Netlify scheduled functions** | Gmail sync poll fallback (`/api/email/cron`), gated by `CRON_SECRET`. |

> ⚠️ **Lingering Vercel references.** CLAUDE.md is corrected. Still stale:
> `README.md` (create-next-app boilerplate) and the `CRON_SECRET` comment in
> `src/lib/env.ts` / `.env.example` ("Vercel Cron"). The env-file comments ride
> along with in-progress email work, so they're left for that branch to clean up.

## Framework & language

| Piece | Version | Notes |
| --- | --- | --- |
| Next.js | **16.2.4** | App Router. Latest stable is 16.2.10 (6 patches behind, same 16.2 line). |
| React / React DOM | 19.2.4 | |
| TypeScript | ^5 | |

## Auth

- **Clerk** (`@clerk/nextjs` ^7.3.0) — single-user auth. `CLERK_SECRET_KEY` +
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

## Data & forms

- **TanStack Query** ^5 — server state.
- **react-hook-form** ^7 + **Zod** ^4 — forms; Zod on every API route.
- **nuqs** ^2 — URL state for filters/search.
- **react-phone-number-input** ^3 — phone field.

## UI

- **Radix Themes** ^3 + **Radix Colors** ^3 — primitives + theming.
- **Tailwind** ^4 (`@tailwindcss/postcss`) — utility layer alongside Radix.

## AI

- **Anthropic SDK** (`@anthropic-ai/sdk` ^0.93) — tearsheet PDF import + AI artist
  bios. Model per env comment: Opus 4.7. `ANTHROPIC_API_KEY`.

## PDF generation

- **Browserless.io** — hosted Puppeteer renders HTML/CSS template routes to PDF.
  `BROWSERLESS_API_KEY`. Render routes gated by separate shared secrets:
  `TEARSHEET_RENDER_SECRET` and `INVOICE_RENDER_SECRET` (invoice route exposes
  wire/bank details, so its secret is kept distinct).

## Email — outbound (transactional)

- **Resend** (`resend` ^6) — the send rail. Sending is skipped when
  `RESEND_API_KEY` is unset. `EMAIL_FROM` (verified sender),
  `EMAIL_REPLY_TO` (defaults replies to her Gmail inbox).
- Sending domain: `e.chloewaddington.com`.

## Email — inbound (Gmail ingestion, in progress)

- **Google Workspace / Gmail API** — READ-ONLY ingestion (`gmail.readonly`
  scope only; no send scope — outbound stays on Resend). Feature stays dark
  until configured.
- **Google OAuth** — `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`;
  redirect URI `<APP_URL>/api/email/callback`.
- **Google Pub/Sub** — push sync via `users.watch` (`GOOGLE_PUBSUB_TOPIC`);
  push endpoint guarded by `GMAIL_PUBSUB_TOKEN`. Falls back to the Netlify cron
  poll when the topic is unset.

## Dev tooling

- **Vitest** ^4 (`@vitest/ui`) — tests (`npm test`).
- **ESLint** ^9 (`eslint-config-next`).
- **tsx** ^4 — scripts (`npm run crm` → `scripts/crm.ts`).
- **dotenv**, **yaml** — script/config support.
