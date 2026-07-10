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

Still deferred: interest tracking, provenance chain, exhibitions, email flows,
relationship-management UI, folding `artists` into `parties`, and the
vault→parties seed import (buyers are typed as invoiced and accumulate).

## Stack

**Core**
- Next.js 15 App Router, TypeScript
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
- Decision: pay ~$10/mo to skip Chromium-on-Vercel pain. Revisit only if volume justifies self-hosting.
- The template is a regular Next.js page route styled to match her Word layout exactly. Browserless hits that URL with auth and returns the PDF.

**Storage**
- Supabase Storage bucket `artworks` for originals
- Supabase image transformer for UI thumbnails; PDF pulls full-res

**Deploy**
- Vercel (app) + Supabase (DB/Storage) + Browserless (PDF)

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
  status text                -- 'available' | 'on_hold' | 'sold'
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
- Brand colors as CSS variables (her brand, not Compare Power's — TBD once we see her current sheet)
- Primitives over native HTML
- Zod on every API route
- nuqs for any filter/search state in URLs

## Open questions before coding

- Need a sample of her current Word preview sheet (PDF or screenshot) to match layout 1:1
- Her brand colors / fonts / logo file
- Does she want the PDF to include her contact info as a footer, or is the logo enough?
