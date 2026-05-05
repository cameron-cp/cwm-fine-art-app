-- art-app initial schema
-- V1: artists + artworks + artwork_images. No collectors/interests/provenance yet.

create extension if not exists "pgcrypto";

create table artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  birth_year int,
  death_year int,
  nationality text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type artwork_status as enum ('available', 'on_hold', 'sold');

create table artworks (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete restrict,
  title text not null,
  year int,
  medium text,
  dimensions text,
  edition text,
  provenance text,
  condition text,
  price_cents bigint,
  currency text not null default 'USD',
  status artwork_status not null default 'available',
  notes text,
  primary_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index artworks_artist_id_idx on artworks(artist_id);
create index artworks_status_idx on artworks(status);

create table artwork_images (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references artworks(id) on delete cascade,
  storage_path text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index artwork_images_artwork_id_idx on artwork_images(artwork_id, position);

-- updated_at triggers
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger artists_set_updated_at before update on artists
  for each row execute function set_updated_at();

create trigger artworks_set_updated_at before update on artworks
  for each row execute function set_updated_at();

-- RLS: single-user app via Clerk third-party auth.
-- Any authenticated session can read/write. Tighten if multi-user is added later.
alter table artists enable row level security;
alter table artworks enable row level security;
alter table artwork_images enable row level security;

create policy "authenticated full access on artists"
  on artists for all
  to authenticated
  using (true) with check (true);

create policy "authenticated full access on artworks"
  on artworks for all
  to authenticated
  using (true) with check (true);

create policy "authenticated full access on artwork_images"
  on artwork_images for all
  to authenticated
  using (true) with check (true);
