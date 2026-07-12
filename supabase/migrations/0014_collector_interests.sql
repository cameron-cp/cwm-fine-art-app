-- Collector areas of interest.
--
-- Records what a collector is into — favored artists, media, eras, movements,
-- schools, nationalities, subjects, formats, and price ranges — as typed,
-- matchable rows (one row = one (party, dimension) signal), NOT a text blob.
-- This is the CRM-foundation exception already sanctioned in CLAUDE.md.
--
-- Design, following the artist_nationalities precedent (0010): app-side-validated
-- codes, a child table keyed to parties, the blanket authenticated RLS policy, and
-- the shared set_updated_at() trigger. No reference tables for open taxonomy — free
-- text + a datalist that self-heals from reuse (era/movement/school/subject/format),
-- exactly like artworks.medium.
--
-- The artwork -> ranked-collector MATCHER is intentionally NOT built here (the user
-- asked only to sketch it). This migration ships the data model + capture; a future
-- PR adds the match function once a real consumer exists to validate its formula.

create table collector_interests (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references parties(id) on delete cascade,

  dimension text not null check (dimension in (
    'artist','medium','era','movement','school','nationality','subject','format','price_band'
  )),
  sentiment text not null default 'seeking' check (sentiment in (
    'seeking','collects','owns','watching','avoid'
  )),
  -- How Chloe knows this + how sure she is — so a future matcher can weight by
  -- provenance and certainty (recency comes from created_at; see below).
  source text not null default 'stated' check (source in (
    'stated','inferred_from_purchase','inferred_from_conversation','other'
  )),
  confidence text not null default 'confirmed' check (confidence in (
    'confirmed','likely','tentative'
  )),

  -- Exactly one payload shape per dimension (enforced by the XOR CHECK below):
  --   dimension='artist'     -> artist_id (FK); value/price null
  --   dimension='price_band' -> price_min_cents and/or price_max_cents; artist_id/value null
  --   everything else        -> value (ISO alpha-2 for nationality, free text otherwise)
  artist_id uuid references artists(id) on delete restrict, -- restrict: don't silently
    -- destroy a collector's captured artist-interest when an artist is deleted/deduped
    -- (mirrors artworks.artist_id, 0001).
  value text,
  price_min_cents bigint check (price_min_cents is null or price_min_cents >= 0),
  price_max_cents bigint check (price_max_cents is null or price_max_cents >= 0),

  qualifier text,  -- free-text nuance ("early period only", "no prints")
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint collector_interests_shape check (
    case dimension
      when 'artist' then
        artist_id is not null and value is null
        and price_min_cents is null and price_max_cents is null
      when 'price_band' then
        artist_id is null and value is null
        and (price_min_cents is not null or price_max_cents is not null)
        and (price_min_cents is null or price_max_cents is null
             or price_max_cents >= price_min_cents)
      else -- medium, era, movement, school, nationality, subject, format
        artist_id is null
        and value is not null and btrim(value) <> ''
        and price_min_cents is null and price_max_cents is null
    end
  )
);

-- Lookup indexes (also sized for the future match query).
create index collector_interests_party_idx on collector_interests(party_id);
create index collector_interests_artist_idx on collector_interests(artist_id)
  where dimension = 'artist';
create index collector_interests_dim_value_idx
  on collector_interests(dimension, lower(btrim(value))) where value is not null;
create index collector_interests_price_idx
  on collector_interests(price_min_cents, price_max_cents) where dimension = 'price_band';

-- Uniqueness INCLUDES sentiment on purpose: a collector who "owns 2 Basquiats" AND
-- is "seeking more" needs two artist rows that must coexist. Blocking only exact
-- same-sentiment dupes stops accidental double-adds (which share sentiment) from
-- double-counting a future score, without blocking the legitimate multi-sentiment
-- case. Distinct values within a dimension (two eras) also coexist.
create unique index collector_interests_artist_uniq
  on collector_interests(party_id, artist_id, sentiment) where dimension = 'artist';
create unique index collector_interests_value_uniq
  on collector_interests(party_id, dimension, lower(btrim(value)), sentiment)
  where value is not null;
-- price_band rows are intentionally not uniqueness-constrained (value is null → outside
-- the index above); duplicate identical bands are low-stakes and rare.

alter table collector_interests enable row level security;
create policy "authenticated full access on collector_interests"
  on collector_interests for all to authenticated using (true) with check (true);

create trigger collector_interests_set_updated_at before update on collector_interests
  for each row execute function set_updated_at();
