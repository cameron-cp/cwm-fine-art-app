-- Known works + structured ownership.
--
-- Two additions that make "I found ten 1960s Joan Mitchells — owned by these
-- people" an answerable query (see docs/chat-agent.md):
--
-- 1. artworks.record_kind — 'inventory' (her stock; every existing row) vs
--    'tracked' (a work she knows about but does not hold: market intelligence).
--    Orthogonal to status, which keeps meaning what she believes about the
--    work's availability.
--
-- 2. artwork_ownerships — artwork <-> party title edges with history. This is
--    deliberately separate from BOTH provenance_lines[] (display text for the
--    tearsheet, stays untouched) and current_party_address_id (physical
--    location, 0009). source/confidence mirror collector_interests (0014) so a
--    future consumer can weight by how she knows.

alter table artworks
  add column record_kind text not null default 'inventory'
    check (record_kind in ('inventory','tracked'));

create index artworks_record_kind_idx on artworks(record_kind);

create table artwork_ownerships (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references artworks(id) on delete cascade,
  -- restrict: deleting/deduping a party must not silently destroy title
  -- history (mirrors collector_interests.artist_id, 0014).
  party_id uuid not null references parties(id) on delete restrict,

  -- Open interval: ended_on is null = current owner. Dates are often unknown
  -- ("the Hendersons have had it for years"), so both are nullable.
  started_on date,
  ended_on date check (ended_on is null or started_on is null or ended_on >= started_on),

  source text not null default 'stated' check (source in (
    'stated','provenance','inferred_from_conversation','public_record','other'
  )),
  confidence text not null default 'confirmed' check (confidence in (
    'confirmed','likely','tentative'
  )),

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index artwork_ownerships_artwork_idx on artwork_ownerships(artwork_id);
create index artwork_ownerships_party_idx on artwork_ownerships(party_id);

-- Joint ownership is legitimate (two parties, both current), but one party
-- can't hold two open title rows on the same work.
create unique index artwork_ownerships_current_uniq
  on artwork_ownerships(artwork_id, party_id) where ended_on is null;

alter table artwork_ownerships enable row level security;
create policy "authenticated full access on artwork_ownerships"
  on artwork_ownerships for all to authenticated using (true) with check (true);

create trigger artwork_ownerships_set_updated_at before update on artwork_ownerships
  for each row execute function set_updated_at();
