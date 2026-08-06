-- Scalable artwork lookup for the invoice line-item picker.
--
-- Before this, the invoice form preloaded EVERY artwork row into the RSC payload
-- and rendered one <Select.Item> per work. That is unusable past a few hundred
-- works, and it was also silently WRONG: PostgREST caps an unbounded select at
-- 1000 rows, so work #1001 simply could not be invoiced from inventory.
--
-- Three parts:
--   1. artworks.search_text — a denormalized, lowercased, unaccented haystack
--      (artist name + title + year + medium + edition + short ref) maintained by
--      triggers on artworks AND artists (a rename must re-stamp its works).
--   2. A GIN trigram index on it, so infix `like '%tok%'` is index-backed rather
--      than a sequential scan.
--   3. search_artworks() — one round trip returning exactly the fields an
--      invoice line item needs, ranked artist-first, paginated, with a total.
--
-- Tokenization deliberately lives in TypeScript (src/lib/artwork-search.ts):
-- the caller passes p_lead (the longest token's LIKE pattern — the one the GIN
-- index drives from) plus p_patterns (every token's pattern, AND-ed). Keeping it
-- out of SQL avoids dynamic SQL entirely and makes the tokenizer unit-testable.

-- pg_trgm may already be installed in `extensions` (Supabase's default home for
-- extensions) or in `public` (where 0004 put unaccent). Widen the session
-- search_path so `gin_trgm_ops` resolves either way — schema-qualifying it would
-- work in one environment and fail in the other.
set search_path = public, extensions;

create extension if not exists pg_trgm;

-- 1. The haystack ------------------------------------------------------------

alter table artworks add column search_text text not null default '';

-- f_unaccent (0004) is the IMMUTABLE unaccent wrapper, so "Miro" finds "Miró".
-- The trailing 8-char id prefix is the short ref the picker shows when an artist
-- has two works with the same title — she can paste it back to jump straight there.
create or replace function artwork_search_haystack(
  p_artist_name text,
  p_title text,
  p_year int,
  p_medium text,
  p_edition text,
  p_id uuid
)
returns text
language sql immutable parallel safe
set search_path = public, extensions
as $$
  -- concat_ws skips NULL arguments, so absent fields collapse cleanly rather
  -- than leaving double separators in the haystack.
  select lower(f_unaccent(concat_ws(' ',
    p_artist_name,
    p_title,
    p_year::text,
    p_medium,
    p_edition,
    left(p_id::text, 8)
  )));
$$;

create or replace function artworks_stamp_search_text()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_text := artwork_search_haystack(
    (select name from artists where id = new.artist_id),
    new.title, new.year, new.medium, new.edition, new.id
  );
  return new;
end;
$$;

create trigger artworks_stamp_search_text
  before insert or update of artist_id, title, year, medium, edition
  on artworks
  for each row execute function artworks_stamp_search_text();

-- An artist rename must re-stamp every one of their works. This UPDATE touches
-- only search_text, which is NOT in the artworks trigger's column list, so it
-- cannot recurse.
create or replace function artists_restamp_artwork_search_text()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update artworks
      set search_text = artwork_search_haystack(
        new.name, title, year, medium, edition, id)
      where artist_id = new.id;
  end if;
  return new;
end;
$$;

create trigger artists_restamp_artwork_search_text
  after update of name on artists
  for each row execute function artists_restamp_artwork_search_text();

update artworks a
  set search_text = artwork_search_haystack(
    ar.name, a.title, a.year, a.medium, a.edition, a.id)
  from artists ar
  where ar.id = a.artist_id;

-- 2. The index ---------------------------------------------------------------

create index artworks_search_text_trgm_idx
  on artworks using gin (search_text gin_trgm_ops);

-- 3. The search --------------------------------------------------------------
--
-- SECURITY INVOKER (the default) on purpose: it runs as the caller, so the
-- artworks/artists RLS policies still apply. Only `authenticated` may execute.
--
-- record_kind = 'inventory' is a hard filter. `tracked` works are market works
-- the dealer does NOT own (migration 0016) — they are not sellable stock, and
-- offering them here would let an invoice be issued against someone else's
-- property. Manual entry stays available for anything off-inventory.
--
-- Implemented in plpgsql with ONE dynamic statement, for two measured reasons
-- (100k-row local dataset, EXPLAIN ANALYZE):
--
--   1. A `(p_x is null or col = p_x)` guard is not indexable. The guarded version
--      of this query sequential-scanned artworks (~51 ms) even with the trigram
--      index present.
--   2. Emitting ONE `search_text like <pattern>` predicate per token lets Postgres
--      AND all of them inside a single Bitmap Index Scan on the trigram index and
--      choose its own drive order by selectivity (~1.3 ms for 3 tokens). A single
--      "lead token" predicate picked in application code cannot do that — it has
--      no idea that "richter" is 17x more selective than "untitled".
--
-- No user text is ever interpolated. The dynamic part decides only WHICH
-- predicates exist and how many; every value arrives through USING as a bound
-- parameter, referenced as an element of the $1 array. Unused parameters get a
-- constant-true tautology so the placeholder numbering stays fixed (plpgsql
-- requires every USING value to be referenced somewhere in the statement).
--
-- Two deliberate bounds keep every query shape fast, both measured:
--
--   * POOL CAP. Ranking and the total both need the whole match set, so a broad
--     one-word query ("untitled" = 43k hits at 100k works) cost ~370 ms — all of
--     it fetching and sorting rows nobody will look at. Candidates are therefore
--     capped at pool_cap; when the cap is hit, `total_capped` comes back true and
--     the UI tells her to narrow instead of pretending to rank 43,000 works.
--     Scoping to one artist is the precise escape hatch — the cap still applies,
--     but no real artist has 2,000 works, so that path returns an exact total.
--   * ARTIST-NAME-ONLY RELEVANCE. Scoring on the artist name alone (not a window
--     over title similarity) makes the score identical for every work by one
--     artist, which GUARANTEES an artist's works come back contiguous so the
--     picker can group them under one header. Within an artist the order is
--     newest-first, then title — predictable beats fuzzy for someone scanning
--     her own inventory.
create or replace function search_artworks(
  p_patterns text[] default null,
  p_rank text default null,
  p_artist_id uuid default null,
  p_status text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  artist_id uuid,
  artist_name text,
  title text,
  year int,
  medium text,
  edition text,
  signature_details text,
  catalogue_raisonne text,
  provenance_lines text[],
  height_in numeric,
  width_in numeric,
  depth_in numeric,
  price_cents bigint,
  currency text,
  status text,
  primary_image_path text,
  total_count bigint,
  total_capped boolean
)
language plpgsql
stable
set search_path = public, extensions
as $fn$
declare
  -- Hard ceiling on emitted predicates. The client sends at most this many
  -- tokens; this is the defensive backstop.
  max_tokens constant int := 8;
  -- Candidates considered for ranking. Chosen so that nothing realistic caps at
  -- the sizes this app actually sees, while a pathologically broad query at 20x
  -- that size still returns in single-digit milliseconds.
  pool_cap constant int := 2000;
  v_tokens int := least(coalesce(cardinality(p_patterns), 0), max_tokens);
  v_where  text := 'a.record_kind = ''inventory''';
  v_sql    text;
  v_limit  int := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_rank   text := lower(f_unaccent(coalesce(p_rank, '')));
  i int;
begin
  -- $1 — one indexable predicate per token, AND-ed.
  if v_tokens = 0 then
    v_where := v_where || ' and ($1 is null or true)';
  else
    for i in 1..v_tokens loop
      v_where := v_where || format(' and a.search_text like ($1)[%s]', i);
    end loop;
  end if;

  if p_artist_id is not null then
    v_where := v_where || ' and a.artist_id = $2';
  else
    v_where := v_where || ' and $2 is null';
  end if;

  if p_status is not null then
    v_where := v_where || ' and a.status::text = $3';
  else
    v_where := v_where || ' and $3 is null';
  end if;

  v_sql := format($q$
    with pool as (
      select a.id, a.artist_id, a.title, a.year, a.medium, a.edition,
             a.signature_details, a.catalogue_raisonne, a.provenance_lines,
             a.height_in, a.width_in, a.depth_in, a.price_cents, a.currency,
             a.status::text as status, a.primary_image_path
      from artworks a
      where %1$s
      limit %2$s
    ),
    ranked as (
      select p.*, ar.name as artist_name, ar.sort_name,
             similarity(lower(f_unaccent(ar.name)), $4) as artist_score,
             case when lower(f_unaccent(ar.name)) like $4 || '%%' then 0 else 1 end
               as artist_prefix
      from pool p
      join artists ar on ar.id = p.artist_id
    )
    select id, artist_id, artist_name, title, year, medium, edition,
           signature_details, catalogue_raisonne, provenance_lines,
           height_in, width_in, depth_in, price_cents, currency, status,
           primary_image_path,
           count(*) over () as total_count,
           count(*) over () > %3$s as total_capped
    from ranked
    order by
      case when $4 = '' then 0 else artist_prefix end,
      case when $4 = '' then 0 else -artist_score end,
      sort_name, year desc nulls last, title, id
    limit $5 offset $6
  $q$, v_where, pool_cap + 1, pool_cap);

  return query execute v_sql
    using p_patterns, p_artist_id, p_status, v_rank, v_limit, v_offset;
end;
$fn$;

revoke all on function search_artworks(text[], text, uuid, text, int, int)
  from public, anon;
grant execute on function search_artworks(text[], text, uuid, text, int, int)
  to authenticated;
