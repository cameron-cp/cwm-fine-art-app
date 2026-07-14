-- Digital viewing rooms.
--
-- A viewing room is a curated, per-recipient online presentation of inventory
-- works, sent to a named CRM contact via an opaque capability link. Unlike an
-- invoice (which snapshots everything at issue time), a room is a LIVING
-- presentation: it reads current artwork data (price edits + SOLD reflect
-- immediately) and owns only the presentation layer — selection, order,
-- per-work caption, and price visibility. This is the owner-approved viewing-
-- room expansion recorded in CLAUDE.md and docs/decisions/0008-viewing-rooms.md.
--
-- Four tables + one read-only VIEW that is the structural public-field whitelist,
-- following house conventions: gen_random_uuid() ids, the blanket authenticated
-- RLS policy (collectors never authenticate — the public room route reads through
-- the service-role client only), and the shared set_updated_at() trigger.

-- 1. The room: presentation-only metadata.
create table viewing_rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  intro_note text,
  -- Per-room default for whether prices show. Applied at render time against the
  -- LIVE price_cents; 'on_request' renders "Price on request", 'hidden' shows
  -- nothing. Not snapshotted — a living presentation.
  price_visibility text not null default 'on_request'
    check (price_visibility in ('show', 'on_request', 'hidden')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

-- 2. The curated selection. Live-read, NOT a snapshot: artwork_id points at the
--    live row. on delete cascade (not restrict like an invoice line): a room is a
--    presentation, so a deleted work should simply drop from the room. This also
--    lets deleteArtwork() (which removes storage objects before the row) succeed
--    without a restrict FK leaving an image-stripped orphan row.
create table viewing_room_works (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references viewing_rooms(id) on delete cascade,
  artwork_id uuid not null references artworks(id) on delete cascade,
  position int not null,
  caption text,  -- dealer's shown blurb for this work in this room
  created_at timestamptz not null default now(),
  unique (room_id, artwork_id)
);

create index viewing_room_works_room_idx on viewing_room_works(room_id);

-- Structural guard: only 'inventory' works may enter a room. A 'tracked' market
-- work can name a third party's private holdings, so it must never render on a
-- public link. Enforced in the DB (not just app-side) so no write path can bypass
-- it. Mirrored by the room_public_artworks view's WHERE, defense in depth.
create or replace function viewing_room_works_inventory_only()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from artworks a
    where a.id = new.artwork_id and a.record_kind = 'inventory'
  ) then
    raise exception 'Only inventory works can be added to a viewing room (artwork_id=%)', new.artwork_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger viewing_room_works_inventory_only
  before insert or update on viewing_room_works
  for each row execute function viewing_room_works_inventory_only();

-- 3. One opaque link per invited collector. party_id is NOT NULL + on delete
--    restrict: every recipient is a real CRM contact so the engagement always
--    attributes to a named party (no ad-hoc anonymous path). restrict fails safe
--    (no data loss); the friendly pre-delete guard lives in contacts/actions.ts.
create table viewing_room_recipients (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references viewing_rooms(id) on delete cascade,
  party_id uuid not null references parties(id) on delete restrict,
  label text,  -- optional display override only
  token text not null unique,  -- capability URL segment; crypto.randomBytes(24).base64url
  expires_at timestamptz,
  revoked_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index viewing_room_recipients_room_idx on viewing_room_recipients(room_id);
create index viewing_room_recipients_party_idx on viewing_room_recipients(party_id);

-- 4. Behavioral capture. artwork_id on delete SET NULL (not cascade): when a work
--    is cascade-removed from viewing_room_works, its engagement events SURVIVE
--    (detached), so historical signal isn't lost — only the room's live
--    composition thins. room_id cascades with the room.
create table viewing_room_events (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references viewing_room_recipients(id) on delete cascade,
  room_id uuid not null references viewing_rooms(id) on delete cascade,
  artwork_id uuid references artworks(id) on delete set null,  -- null = room-level
  event_type text not null check (event_type in (
    'room_open', 'work_view', 'work_dwell', 'work_zoom', 'image_open', 'inquiry'
  )),
  dwell_ms int,
  message text,
  created_at timestamptz not null default now()
);

create index viewing_room_events_recipient_idx
  on viewing_room_events(recipient_id, created_at);

-- The structural public-field whitelist. The public room route selects from THIS
-- view, never artworks.*, so a future sensitive column is excluded by default. The
-- WHERE also bars tracked (third-party) works from ever rendering publicly. Columns
-- included are exactly the museum-wall-label + image fields — no notes, condition,
-- cost basis, location, edition, or literature.
create view room_public_artworks as
  select
    id, artist_id, title, year, medium, signature_details,
    height_in, width_in, depth_in, catalogue_raisonne,
    provenance_lines, price_cents, currency, status, primary_image_path
  from artworks
  where record_kind = 'inventory';

-- RLS: blanket authenticated policy (matches every table since 0001). Collectors
-- never authenticate; the public route reads via the service-role client.
alter table viewing_rooms enable row level security;
create policy "authenticated full access on viewing_rooms"
  on viewing_rooms for all to authenticated using (true) with check (true);

alter table viewing_room_works enable row level security;
create policy "authenticated full access on viewing_room_works"
  on viewing_room_works for all to authenticated using (true) with check (true);

alter table viewing_room_recipients enable row level security;
create policy "authenticated full access on viewing_room_recipients"
  on viewing_room_recipients for all to authenticated using (true) with check (true);

alter table viewing_room_events enable row level security;
create policy "authenticated full access on viewing_room_events"
  on viewing_room_events for all to authenticated using (true) with check (true);

create trigger viewing_rooms_set_updated_at before update on viewing_rooms
  for each row execute function set_updated_at();

-- Extend collector_interests.source with the honest label for M2's room-derived
-- interests ('inferred_from_engagement'), distinct from the Registrar chat's
-- 'inferred_from_conversation'. Kept in lockstep with interestSources in
-- src/lib/schemas/interest.ts.
alter table collector_interests drop constraint collector_interests_source_check;
alter table collector_interests add constraint collector_interests_source_check
  check (source in (
    'stated',
    'inferred_from_purchase',
    'inferred_from_conversation',
    'inferred_from_engagement',
    'other'
  ));
