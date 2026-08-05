# art-app

Tool for Cameron's wife (art dealer) to replace her manual Word-based preview-sheet workflow with a database-backed app that generates pixel-perfect PDF tearsheets in one click.

## Who it's for

A single user (the dealer). Not multi-tenant. Not a marketplace. Auth exists to keep her inventory private and to let her work from any device, not because there are multiple roles.

## V1 scope (the wedge)

The whole point of V1 is the PDF button. Everything else is in service of that.

1. Add/edit artists
2. Add/edit artworks (with image upload)
3. Click "Generate Tearsheet" on an artwork → get a PDF that matches her current Word layout 1:1

If V1 ships and she's using it daily, then we layer collectors + interests + provenance. Not before.

## Out of scope for V1

- ~~Collectors / contacts / CRM~~ — **now intentionally in scope** (see note below)
- Interest tracking (collector ↔ artwork)
- Ownership history / provenance chain
- Exhibitions
- Email-to-collector flows
- Multiple template variants (one tearsheet template only)
- Batch export (one PDF at a time is fine)

When tempted to build any of the above, don't. Ship V1 first.

### CRM / Party foundation — intentionally started (owner decision)

The invoice feature required an editable, app-owned buyer store, so the **Party
model** (`parties` + `party_roles` + `party_relationships`) plus **invoices** and
**invoice settings** were built as migration `0007_parties_invoices.sql`. This is
a deliberate, owner-approved exception to the "Collectors / contacts / CRM" gate
above — recorded here so the two documents don't contradict each other.

What shipped: Contacts CRUD (parties + role tags; relationships shown read-only,
management UI is a fast-follow), an invoice generator (create/edit → PDF matching
the CWFA Word doc verbatim, incl. all 10 T&C clauses), and a Settings page for the
business header / wire details / T&C. Invoices snapshot everything at issue time
(bill-to, per-work details, an invoice-owned image copy, and the business/
remittance/T&C settings) so a re-print never changes. Money is exact integer cents
(`formatInvoiceMoney`, never the whole-dollar `formatPriceCents`). Number
allocation + insert + line items happen atomically in the `create_invoice` /
`update_invoice` SECURITY DEFINER RPCs (execute revoked from anon).

Still deferred: provenance chain, exhibitions, email flows,
relationship-management UI, folding `artists` into `parties`, and the
vault→parties seed import (buyers are typed as invoiced and accumulate).

### The Registrar chat — intentionally started (owner decision)

Follow-up exception, same authority as the Party model above: a conversational
agent over the dealer's own records ("Ask", `/chat`), specced in
[`docs/chat-agent.md`](docs/chat-agent.md). Migration `0016` adds
`artworks.record_kind` (inventory vs tracked market works) and
`artwork_ownerships` (structured title edges — location 0009 and text
provenance are deliberately unchanged; renamed to `artwork_parties` by 0019,
see below). The agent (`src/lib/chat/`) reads
works/contacts/notes through the user-JWT client and has exactly one write:
`log_collector_interest`, validated by the same `interestSchema` as the manual
editor. Interest tracking (0014) is no longer deferred — it is live via both
the contacts editor and the chat. Conversation persistence, streaming, and
interaction-capture rows remain deferred.

### Artwork ↔ contact roles (owner decision)

Migration `0019` renames `artwork_ownerships` to **`artwork_parties`** and adds a
`role`. The dealer attaches a contact to a work as its **`owner`** — the primary
case, and the default — or as `consignor`, `advisor`, `gallery`, `agent`,
`custodian`, `conservator`, `lender`, `other`. Same edge shape as before
(open interval + `source` + `confidence`); the open-link unique index is now per
`(artwork, party, role)`, so joint ownership still works and one party can be
both owner and advisor on a work.

**`role = 'owner'` is the only thing that means title.** Every owner projection
filters on it (`TITLE_ROLE` in `src/lib/schemas/artwork-party.ts`, and
`isCurrentOwner` in `src/lib/artwork-parties/summarize.ts`); non-title edges are
reported under their own keys so an advisor is never read as an owner. The table
was renamed rather than extended in place precisely so any un-patched read fails
loudly instead of quietly returning the wrong parties.

Surfaced on the contact page (`Works`) as a ledger of line items — thumbnail plus
wall label, each linking to `/artworks/{id}` — ordered current holdings, then
other current roles, then closed links. Write surface is add/delete only, matching
the interests editor; a correction is delete + re-add, and history is recordable
at insert time via the two date fields. **Deferred:** the reciprocal editor on the
artwork page (parties are read-only there for now) and a dedicated "mark as sold /
close the interval" action.

**Unidentified holders.** Migration `0022` adds `parties.is_unidentified` for the
holder she knows exists but cannot name — "private collectors in Palm Beach", per
the advisor. It is a real party row so `role='owner'` has something to point at and
so renaming it later fixes every edge at once; see
[`docs/decisions/0011-unidentified-parties.md`](docs/decisions/0011-unidentified-parties.md)
for the rejected alternatives. The flag is load-bearing: every picker that selects
a party for an **outward action** (invoice buyer, viewing-room recipient, retainer
subscriber) filters through `onlyContactableParties`
(`src/lib/parties/contactable.ts`), and a DB CHECK bars these rows from holding a
Stripe customer. Internal graph surfaces — Contacts, the relationship picker, the
chat's party search — deliberately still show them.

### Digital viewing rooms — intentionally started (owner decision)

Same authority as the Party model and Registrar chat: the **Digital Viewing Room**
(migration `0017`, spec in [`docs/decisions/0008-viewing-rooms.md`](docs/decisions/0008-viewing-rooms.md))
is an owner-approved expansion beyond the V1 gate. It is the app's **first
logged-out public surface**: the dealer curates inventory works into a room, mints
a **per-recipient opaque token** for a CRM contact, and the collector opens an
on-brand room logged-out; `room_open` + `work_view` are captured against that named
contact (client beacon, not server render). The dealer exports a multi-work PDF
leave-behind (shared `museum-wall-label` component) and emails the invite via
`sendEmail` — the rails' first real caller.

Security posture (non-negotiable, see the ADR): middleware is slash-anchored
(`/room/(.*)`, `/api/room/(.*)` — never `/room(.*)`, which would leak the dealer
UI); the public route reads artwork fields ONLY from the `room_public_artworks`
VIEW (structural whitelist — no notes/condition/cost/location, and `tracked` works
barred by both the view and a DB trigger); revocation/expiry are re-checked on
every event write; `noindex` + a per-token throttle. AI is **dealer-facing only**
and not in M1.

What shipped (M1): the `viewing_rooms` / `viewing_room_works` /
`viewing_room_recipients` / `viewing_room_events` tables + the view, curation UI
(`/rooms`), the public room (`/room/{token}`), the event endpoint, the PDF export,
and the invite email. **Deferred:** fine-grained capture (dwell/zoom/image-open),
the inquiry form + inquiry email (M1b), the engagement dashboard + "Read the room"
AI intent read (M2), and AI-assisted curation (M3). `collector_interests.source`
gained `'inferred_from_engagement'` for M2's future write-back.

## Stack

**Core**
- Next.js 16 App Router, TypeScript
- Supabase (Postgres + Storage + RLS)
- Clerk (auth — single user)
- Radix Themes + Radix Colors + Radix Primitives
- Tailwind (utility layer alongside Radix Themes)

**Data + forms**
- TanStack Query (server state)
- react-hook-form + Zod (forms; Zod also on every API route)
- nuqs (URL state for filters/search)

**PDF generation**
- Browserless.io (hosted Puppeteer) renders an HTML/CSS template to PDF
- Decision: pay ~$10/mo to skip Chromium-on-serverless pain. Revisit only if volume justifies self-hosting.
- The template is a regular Next.js page route styled to match her Word layout exactly. Browserless hits that URL with auth and returns the PDF.

**Storage**
- Supabase Storage bucket `artworks` for originals
- Supabase image transformer for UI thumbnails; PDF pulls full-res

**Deploy**
- Netlify (app) + Supabase (DB/Storage) + Browserless (PDF)

## Data model (V1)

```
artists
  id uuid pk
  name text
  birth_year int null
  death_year int null
  nationality text null
  bio text null
  created_at, updated_at

artworks
  id uuid pk
  artist_id uuid fk -> artists
  title text
  year int null
  medium text
  dimensions text          -- free text, e.g. "24 x 36 in (61 x 91 cm)"
  edition text null         -- e.g. "3/10" or "AP"
  provenance text null
  condition text null
  price_cents int null
  currency text default 'USD'
  status text                -- 'available' | 'on_hold' | 'sold' | 'not_for_sale'
  notes text null
  primary_image_path text null  -- Supabase Storage path
  created_at, updated_at

artwork_images        -- supports multiple images per artwork; primary_image_path on artworks is denormalized for speed
  id uuid pk
  artwork_id uuid fk
  storage_path text
  position int
  created_at
```

UUIDs only. RLS on every table keyed to the single Clerk user id.

## Conventions

Inherit from `~/.claude/CLAUDE.md`. Project-specific notes:

- API responses: `{ data: T }` on success, `{ error: string }` on failure
- Brand colors as CSS variables — see the Design system section below (palette committed; her logo/wordmark TBD)
- Primitives over native HTML
- Zod on every API route
- nuqs for any filter/search state in URLs

## Design system — binding, applies to ALL UI

**Every screen, component, and future feature follows [`docs/design/design-system.md`](docs/design/design-system.md).**
This is not a suggestion or a v1-only style — it is the permanent visual contract for
the product. Read that doc before building or changing any UI. The **`design-system`
skill** (`.claude/skills/design-system/`) auto-triggers on UI work and carries the
enforcement checklist — let it load; don't skip it. Do not reintroduce stock
Radix defaults (indigo / mauve / soft radius / Noto Sans). If a new pattern isn't
covered there, extend the doc rather than inventing an off-system look.

Concept: **the interface as exhibition wall** — the UI recedes so the artwork is the only
saturated thing on screen; type does the work; app and tearsheet share one voice.

Non-negotiables (full detail + tokens in the doc):

- **Color** — plaster ground `#F3F2EE`, warm ink `#1B1A17`, single accent **claret
  `#7A2E2E`** used ONLY for the one primary action / active state per view (~1% of the
  screen). Semantic status = sage/amber, never the accent. No indigo, no purple
  gradients, no drop shadows. Both light + dark themes defined.
- **Type** — **EB Garamond** for headings / artist names / titles (the bridge to the
  tearsheet); **Hanken Grotesk** for UI + dense data (replaces Noto — never Inter/Space
  Grotesk); **IBM Plex Mono** for prices / dimensions / dates / IDs (tabular figures).
  Headings are ALWAYS serif; numbers are ALWAYS tabular mono.
- **Primitives** — square corners (radius 0), hairline rules + whitespace (no shadows),
  ghost/outline buttons with solid claret reserved for the single primary action, status
  as a dot + uppercase word (never candy pills), letterspaced (`.14em`) uppercase labels.
- **Signature** — the **museum wall label** (artist / *italic title* / letterspaced
  medium · dims / mono price) rendered identically in list, detail, and tearsheet.
- **Radix** — `accentColor="bronze"` + claret `--accent-9/10` override, `grayColor="sand"`,
  `radius="none"`, heading-font override to the serif. Retune, don't rebuild.
- **Motion** — one restrained page-load reveal per view; respect `prefers-reduced-motion`.
  Extra motion reads as generic; don't scatter micro-animations.

## Open questions before coding

- Need a sample of her current Word preview sheet (PDF or screenshot) to match layout 1:1
- Her logo / wordmark file (palette + fonts now committed in the Design system section)
- Does she want the PDF to include her contact info as a footer, or is the logo enough?
