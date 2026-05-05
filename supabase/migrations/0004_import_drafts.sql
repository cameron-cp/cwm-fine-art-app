-- PDF tearsheet import support: artist matcher, normalized-name uniqueness,
-- and a server-side draft store for the review-and-confirm flow.

create extension if not exists unaccent;

-- unaccent() is STABLE, not IMMUTABLE, so it can't be used directly in an
-- expression index. Wrap it in an IMMUTABLE helper that hardcodes the dictionary.
create or replace function f_unaccent(text)
returns text
language sql immutable parallel safe strict
set search_path = public, extensions
as $$
  select public.unaccent('public.unaccent', $1);
$$;

-- Pre-flight assumption: no existing artists.name duplicates after lower+f_unaccent
-- normalization. If this index creation fails, run:
--   select lower(f_unaccent(name)) as norm, count(*)
--   from artists group by 1 having count(*) > 1;
-- to surface conflicts, deduplicate manually, retry.
create unique index artists_name_unique on artists (lower(f_unaccent(name)));

-- Diacritic + whitespace insensitive lookup, called from the import route via
-- supabase.rpc('match_artist_by_name', { p_name }).
create or replace function match_artist_by_name(p_name text)
returns table(id uuid, name text)
language sql stable security definer
set search_path = public
as $$
  select a.id, a.name from artists a
  where lower(f_unaccent(regexp_replace(a.name, '\s+', ' ', 'g')))
      = lower(f_unaccent(regexp_replace(p_name, '\s+', ' ', 'g')))
  limit 2;
$$;

grant execute on function match_artist_by_name(text) to authenticated;

-- Drafts hold extracted PII (provenance, prices, signature inscriptions) until
-- the dealer confirms. Owner-scoped RLS — tighter than the rest of the schema.
create table import_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null default (auth.jwt() ->> 'sub'),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create index import_drafts_expires_at_idx on import_drafts(expires_at);
create index import_drafts_owner_idx on import_drafts(owner_user_id);

alter table import_drafts enable row level security;

create policy "owner full access on import_drafts"
  on import_drafts for all to authenticated
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');
