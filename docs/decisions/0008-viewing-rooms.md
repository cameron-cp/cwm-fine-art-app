# 0008 — Digital viewing rooms (per-recipient tokenized links)

Status: accepted (2026-07-14)

## Context

Chloe sends curated selections of works to individual collectors. The manual
version is emailing a stack of tearsheet PDFs. Every competitor (Artlogic, Artsy,
ArtCloud, Arternal) ships an "online viewing room": link-gated, reads inventory,
per-collector price toggle, data capture. Matching that is table stakes. The
differentiator this app can reach — and a generic OVR can't — is turning a named
collector's *viewing behavior* into a dealer action (M2's "Read the room" intent
read, grounded in the dealer's own records + the Registrar).

This is the first **logged-out public surface** in an otherwise single-user,
Clerk-gated app, so the security decisions below are load-bearing, not incidental.

Milestone 1 (this doc's scope) ships: curate inventory works into a room → mint a
per-recipient link for a CRM contact → collector opens it logged-out → `room_open`
+ `work_view` recorded against that contact → PDF leave-behind + invite email.
Fine-grained capture, the inquiry form, the engagement dashboard, and all AI
(intent read, curation) are explicitly deferred to M1b/M2/M3.

## Decisions

### 1. Per-recipient opaque tokens (capability URLs), not a shared password

Each invited collector gets a distinct `viewing_room_recipients.token` =
`crypto.randomBytes(24).toString("base64url")` (192 bits, ~32 chars) — **not** a
`randomUUID` (122 bits, often assumed enumerable). Possession of the token is the
authorization. This makes every view/event attribute to a named CRM contact even
after forwarding, which is the whole point (M2 needs a party to join). Links are
revocable (`revoked_at`) and optionally expiring (`expires_at`); the validity rule
(`checkRecipientToken`) is re-checked on **every** event write, not just at page
render, so a stale open tab can't keep writing after revocation.

### 2. Live inventory reads, not a snapshot

Contrast the invoice, which snapshots everything at issue time (it's a legal
record). A viewing room is a *living presentation*: it reads current artwork data
so a price edit or a `SOLD` reflects immediately (the Artlogic "no double-entry"
model). The room owns only presentation — selection, order, per-work caption,
price visibility. This drives the FK choices below.

### 3. Dealer-facing AI only (M2/M3)

The AI never talks to collectors — it produces curation suggestions and post-visit
intent reads for the dealer to approve. This kills the prompt-injection /
brand-exposure surface a collector-facing concierge would open. (No AI in M1.)

### 4. The `room_public_artworks` VIEW is the structural field whitelist

The public route selects artwork fields ONLY from a view that exposes a fixed
column set (label + image fields) `where record_kind = 'inventory'`. Consequences:
a future sensitive column on `artworks` (notes, condition, cost basis, location,
edition, literature) is excluded **by default**, and a `tracked` market work —
which can name a third party's private holdings — can never render publicly. A DB
`BEFORE INSERT/UPDATE` trigger on `viewing_room_works` independently rejects any
non-inventory work, so no write path can bypass the rule either. Defense in depth:
trigger on write, view on read.

### 5. Middleware patterns are slash-anchored

`/room/(.*)` and `/api/room/(.*)` — **never** `/room(.*)` / `/api/room(.*)`.
`pathToRegexp("/room(.*)")` also matches `/rooms`, `/rooms/new`, and
`/api/rooms/[id]/pdf`, which would make the entire dealer curation UI and the
Clerk-gated PDF route public (middleware is the sole gate — `(app)/layout.tsx` has
no `auth.protect()`). A regression test (`src/lib/__tests__/middleware.test.ts`)
exercises the real shipped matcher and reproduces the collision.

### 6. FK semantics (stated per the conflicting-patterns rule)

- `viewing_room_works.artwork_id` → **`on delete cascade`**. A room is a live
  presentation, not a legal record, so a deleted work should simply drop from the
  room. This also lets `deleteArtwork` (which removes storage objects before the
  row) succeed instead of a `restrict` FK leaving an image-stripped orphan.
- `viewing_room_recipients.party_id` → **`NOT NULL` + `on delete restrict`**.
  Every recipient is a real CRM contact so M2's intent read always has a party to
  join. `restrict` fails safe (no data loss); a friendly pre-delete guard in
  `contacts/actions.ts` replaces the raw FK error.
- `viewing_room_events.artwork_id` → **`on delete set null`**. When a work is
  cascade-removed from a room, its engagement events survive (detached), so
  historical signal isn't lost — only the room's live composition thins.

### 7. Engagement capture is a CLIENT beacon, not a server render

`room_open` + `work_view` fire from the browser (`RoomTracker`), never from the
server render. An email link-scanner or unfurl bot fetches HTML only and won't run
JS, so `first_viewed_at` and the M2 signal stay honest. `work_view` dedups to one
per work per page load (an in-component `Set`); a repeat visit is a new load and
intentionally makes new rows — that's the repeat-engagement signal.

### 8. Rate limiting

No rate-limit infra exists in the repo. M1's only public write is event logging, so
a minimal per-token fixed-window throttle covers both the page GET (it issues
signed URLs + service-role reads) and the event POST. Caveat: in-memory =
per-instance. The high-risk inquiry→email path (M1b) gets a stronger server-side
debounce when it lands.

### 9. Shared museum-wall-label component

The design system's binding "signature" element was inline in the tearsheet render
page. Extracted to `src/components/museum-wall-label.tsx` (print voice) so the room
PDF reuses it instead of adding a third copy. The invoice render's own copy is left
as pre-existing debt (flagged, not touched). The on-screen room has its own web
label — the tearsheet/PDF are their own typographic world per the design system.

## Consequences

- The public route + event endpoint use the service-role render client; collectors
  never touch RLS (new tables keep the blanket authenticated policy, unused by the
  public path).
- `noindex, nofollow` via both room-page metadata and an `X-Robots-Tag` header
  (`next.config.ts`) so a leaked token can't be indexed.
- `collector_interests.source` gains `'inferred_from_engagement'` (used in M2),
  kept in lockstep with `interestSources` in `src/lib/schemas/interest.ts`.
- New env `VIEWING_ROOM_RENDER_SECRET` (optional secret), separate from
  tearsheet/invoice secrets so a leak is compartmentalized.
