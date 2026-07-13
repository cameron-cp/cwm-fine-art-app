-- Artist Authority Resolver — shared canonical artist authority cache.
--
-- Two-layer model (owner decision, see docs/decisions/0007-artist-authority-two-layer.md):
--   * canonical_artists  = an app-owned REFERENCE/AUTHORITY cache keyed on public
--     authority ids (Wikidata QID / Getty ULAN). It is the *authority's suggestion*.
--     Reference data has no tenant boundary, so one shared table is the right shape.
--   * artists.canonical_artist_id = the tenant's link to the adopted copy. The
--     artists row stays the editable, dealer-owned record (verify-before-save).
--
-- Cross-refs:
--   0001_init.sql        — set_updated_at(); artists table this extends.
--   0004_import_drafts   — f_unaccent / match_artist_by_name (name matcher precedent).
--                          NOTE: 0004 grants match_artist_by_name to authenticated but
--                          never REVOKEs from public/anon — the older, incomplete grant
--                          pattern. Surfaced here as pre-existing cleanup (tracked
--                          separately); this migration does NOT repeat it (see grants below).
--   0007_parties_invoices / 0013_stripe_payments — the hardened revoke-from-public,anon
--                          grant pattern this migration follows.
--   0010_artist_names_nationalities — sort_name + ordered artist_nationalities (the
--                          shape the adopted artist row mirrors).
--   0014_collector_interests — latest migration before this one.

create table canonical_artists (
  id uuid primary key default gen_random_uuid(),
  wikidata_qid text unique,          -- 'Q164351'
  ulan_id text unique,               -- Getty subject id, numeric string ('500003003')
  viaf_id text,
  preferred_name text not null,      -- NATURAL display order ("Gerhard Richter"); see merge
  sort_name text not null,           -- inverted filing key ("Richter, Gerhard")
  birth_year int,
  death_year int,
  nationality_codes text[] not null default '{}',  -- ISO alpha-2, ordered; [0] = primary
  gender text,
  roles text[] not null default '{}',
  bio text,
  image_url text,
  image_license text,
  image_attribution text,
  sources jsonb not null default '{}',  -- per-field provenance + fetched_at + getty status
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Shared reference resource → cheap DB-level shape guards mirroring the Zod gate.
  -- These are defense-in-depth; the primary validation is resolveInputSchema /
  -- ResolvedArtist in src/lib/schemas/authority.ts.
  constraint canonical_artists_has_authority
    check (wikidata_qid is not null or ulan_id is not null),
  constraint canonical_artists_qid_shape
    check (wikidata_qid is null or wikidata_qid ~ '^Q[0-9]+$'),
  constraint canonical_artists_ulan_shape
    check (ulan_id is null or ulan_id ~ '^[0-9]+$'),
  constraint canonical_artists_name_nonempty check (btrim(preferred_name) <> '')
  -- nationality_codes element shape validated in the Zod gate (array-element checks
  -- would need a subquery, disallowed in a CHECK).
);

alter table artists add column canonical_artist_id uuid
  references canonical_artists(id) on delete set null;
create index artists_canonical_artist_id_idx on artists(canonical_artist_id);

alter table canonical_artists enable row level security;
-- Reads only. There is no insert/update policy: all writes go through the
-- SECURITY DEFINER upsert below, which bypasses RLS by design.
create policy "authenticated read canonical_artists"
  on canonical_artists for select to authenticated using (true);

create trigger canonical_artists_set_updated_at before update on canonical_artists
  for each row execute function set_updated_at();

-- Upsert-by-authority-id. Two explicit branches because wikidata_qid and ulan_id are
-- SEPARATE nullable unique columns — a single ON CONFLICT arbiter can't cover both.
create or replace function upsert_canonical_artist(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_qid text := nullif(p->>'wikidata_qid', '');
  v_ulan text := nullif(p->>'ulan_id', '');
  v_ulan_effective text;
  v_nat text[] := coalesce(
    (select array_agg(x) from jsonb_array_elements_text(p->'nationality_codes') as t(x)), '{}');
  v_roles text[] := coalesce(
    (select array_agg(x) from jsonb_array_elements_text(p->'roles') as t(x)), '{}');
  v_sources jsonb := coalesce(p->'sources', '{}'::jsonb);
begin
  if v_qid is not null then
    -- X16: two different QIDs can carry the same P245 ULAN (a real Wikidata
    -- data-quality pattern). Set this row's ulan_id only if no OTHER row already
    -- holds it; otherwise leave it null and record sources.ulan_conflict, so the
    -- resolve still succeeds legibly instead of raising a raw unique_violation.
    -- First writer keeps the ULAN.
    v_ulan_effective := v_ulan;
    if v_ulan is not null and exists (
      select 1 from canonical_artists c
      where c.ulan_id = v_ulan and c.wikidata_qid is distinct from v_qid
    ) then
      v_ulan_effective := null;
      v_sources := v_sources || jsonb_build_object('ulan_conflict', v_ulan);
    end if;

    begin
      insert into canonical_artists (
        wikidata_qid, ulan_id, viaf_id, preferred_name, sort_name,
        birth_year, death_year, nationality_codes, gender, roles, bio,
        image_url, image_license, image_attribution, sources)
      values (
        v_qid, v_ulan_effective, nullif(p->>'viaf_id', ''), p->>'preferred_name', p->>'sort_name',
        (p->>'birth_year')::int, (p->>'death_year')::int, v_nat, nullif(p->>'gender', ''), v_roles,
        nullif(p->>'bio', ''), nullif(p->>'image_url', ''), nullif(p->>'image_license', ''),
        nullif(p->>'image_attribution', ''), v_sources)
      on conflict (wikidata_qid) do update set
        -- coalesce keeps a previously-stored ULAN if this resolve dropped P245.
        ulan_id = coalesce(excluded.ulan_id, canonical_artists.ulan_id),
        viaf_id = excluded.viaf_id,
        preferred_name = excluded.preferred_name,
        sort_name = excluded.sort_name,
        birth_year = excluded.birth_year,
        death_year = excluded.death_year,
        nationality_codes = excluded.nationality_codes,
        gender = excluded.gender,
        roles = excluded.roles,
        bio = excluded.bio,
        image_url = excluded.image_url,
        image_license = excluded.image_license,
        image_attribution = excluded.image_attribution,
        sources = excluded.sources,
        updated_at = now()
      returning id into v_id;
    exception when unique_violation then
      -- F4: the EXISTS check above is not atomic — a concurrent insert of another
      -- QID could grab this ULAN between the check and the write. Retry once
      -- without the ULAN so the resolve still succeeds. (Same "first writer keeps
      -- the ULAN" outcome, now race-safe.)
      v_sources := v_sources || jsonb_build_object('ulan_conflict', v_ulan);
      insert into canonical_artists (
        wikidata_qid, ulan_id, viaf_id, preferred_name, sort_name,
        birth_year, death_year, nationality_codes, gender, roles, bio,
        image_url, image_license, image_attribution, sources)
      values (
        v_qid, null, nullif(p->>'viaf_id', ''), p->>'preferred_name', p->>'sort_name',
        (p->>'birth_year')::int, (p->>'death_year')::int, v_nat, nullif(p->>'gender', ''), v_roles,
        nullif(p->>'bio', ''), nullif(p->>'image_url', ''), nullif(p->>'image_license', ''),
        nullif(p->>'image_attribution', ''), v_sources)
      on conflict (wikidata_qid) do update set
        viaf_id = excluded.viaf_id, preferred_name = excluded.preferred_name,
        sort_name = excluded.sort_name, birth_year = excluded.birth_year,
        death_year = excluded.death_year, nationality_codes = excluded.nationality_codes,
        gender = excluded.gender, roles = excluded.roles, bio = excluded.bio,
        image_url = excluded.image_url, image_license = excluded.image_license,
        image_attribution = excluded.image_attribution, sources = excluded.sources,
        updated_at = now()
      returning id into v_id;
    end;
  elsif v_ulan is not null then
    -- F5: a ULAN-only write must not degrade a richer, QID-owned (Wikidata-sourced)
    -- row. When the existing row is QID-owned, keep its fields and only touch
    -- updated_at; otherwise take the incoming values. (The app never calls this
    -- branch — the resolve route always supplies a QID — but this is a shared
    -- SECURITY DEFINER primitive, so it stays safe on its own.)
    insert into canonical_artists (
      ulan_id, viaf_id, preferred_name, sort_name,
      birth_year, death_year, nationality_codes, gender, roles, bio,
      image_url, image_license, image_attribution, sources)
    values (
      v_ulan, nullif(p->>'viaf_id', ''), p->>'preferred_name', p->>'sort_name',
      (p->>'birth_year')::int, (p->>'death_year')::int, v_nat, nullif(p->>'gender', ''), v_roles,
      nullif(p->>'bio', ''), nullif(p->>'image_url', ''), nullif(p->>'image_license', ''),
      nullif(p->>'image_attribution', ''), v_sources)
    on conflict (ulan_id) do update set
      viaf_id = case when canonical_artists.wikidata_qid is null then excluded.viaf_id else canonical_artists.viaf_id end,
      preferred_name = case when canonical_artists.wikidata_qid is null then excluded.preferred_name else canonical_artists.preferred_name end,
      sort_name = case when canonical_artists.wikidata_qid is null then excluded.sort_name else canonical_artists.sort_name end,
      birth_year = case when canonical_artists.wikidata_qid is null then excluded.birth_year else canonical_artists.birth_year end,
      death_year = case when canonical_artists.wikidata_qid is null then excluded.death_year else canonical_artists.death_year end,
      nationality_codes = case when canonical_artists.wikidata_qid is null then excluded.nationality_codes else canonical_artists.nationality_codes end,
      gender = case when canonical_artists.wikidata_qid is null then excluded.gender else canonical_artists.gender end,
      roles = case when canonical_artists.wikidata_qid is null then excluded.roles else canonical_artists.roles end,
      bio = case when canonical_artists.wikidata_qid is null then excluded.bio else canonical_artists.bio end,
      image_url = case when canonical_artists.wikidata_qid is null then excluded.image_url else canonical_artists.image_url end,
      image_license = case when canonical_artists.wikidata_qid is null then excluded.image_license else canonical_artists.image_license end,
      image_attribution = case when canonical_artists.wikidata_qid is null then excluded.image_attribution else canonical_artists.image_attribution end,
      sources = case when canonical_artists.wikidata_qid is null then excluded.sources else canonical_artists.sources end,
      updated_at = now()
    returning id into v_id;
  else
    raise exception 'upsert_canonical_artist requires wikidata_qid or ulan_id';
  end if;
  return v_id;
end $$;

-- Grants (CRITICAL — follows 0007/0013, NOT 0004): Postgres grants EXECUTE to
-- PUBLIC on new functions unless revoked. Revoke first, then grant narrowly.
revoke execute on function upsert_canonical_artist(jsonb) from public, anon;
grant execute on function upsert_canonical_artist(jsonb) to authenticated;
