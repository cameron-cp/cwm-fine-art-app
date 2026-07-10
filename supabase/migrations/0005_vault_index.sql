-- Vault index — derived read-only index of ~/chloe-second-brain markdown.
-- Canonical store is the markdown on disk; only the sync script writes here
-- (via service role). Authenticated Clerk sessions get read-only.
-- See docs/decisions/0002-vault-to-supabase-sync.md and 0003-shadow-table-atomic-swap.md.

create extension if not exists pg_trgm;

-- Production tables --------------------------------------------------

create table public.vault_entities (
  entity_id            text primary key,           -- e.g. 'clients/howard-rachofsky'
  entity_type          text not null,              -- 'clients' | 'objects' | ...
  slug                 text not null,
  title                text,
  file_path_relative   text not null,              -- 'wiki/objects/foo.md'
  frontmatter          jsonb not null default '{}',
  body_md              text not null default '',
  sensitivity          text,                       -- 'standard' | 'high' | null
  tags                 text[] not null default '{}',
  file_mtime           timestamptz,
  file_sha             text,                       -- sha256 of raw bytes (hex)
  last_synced          timestamptz not null default now()
);
create index vault_entities_type_idx       on public.vault_entities (entity_type);
create index vault_entities_tags_idx       on public.vault_entities using gin (tags);
create index vault_entities_title_trgm_idx on public.vault_entities using gin (title  gin_trgm_ops);
create index vault_entities_body_trgm_idx  on public.vault_entities using gin (body_md gin_trgm_ops);

create table public.vault_edges (
  id              bigserial primary key,
  src_entity_id   text not null references public.vault_entities(entity_id) on delete cascade,
  relation_type   text not null,
  dst_entity_id   text not null,                   -- NOT a FK; dangling links allowed
  dst_resolved    boolean not null default false,
  source_kind     text not null,                   -- 'relations_block' | 'link_field'
  unique (src_entity_id, relation_type, dst_entity_id)
);
create index vault_edges_src_idx on public.vault_edges (src_entity_id, relation_type);
create index vault_edges_dst_idx on public.vault_edges (dst_entity_id, relation_type);

create table public.vault_sync_runs (
  id                  bigserial primary key,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  files_seen          int,
  files_failed        int,
  entities_upserted   int,
  edges_upserted      int,
  asymmetries_count   int,
  duration_ms         int
);

create table public.vault_sync_run_errors (
  id                  bigserial primary key,
  run_id              bigint not null references public.vault_sync_runs(id) on delete cascade,
  file_path_relative  text not null,
  error_kind          text not null,
  message             text not null,
  created_at          timestamptz not null default now()
);
create index vault_sync_run_errors_run_idx on public.vault_sync_run_errors (run_id);

-- Shadow tables ------------------------------------------------------
-- Hidden in their own schema; not exposed to PostgREST. Only the SECURITY DEFINER
-- RPCs below can write into them (and only the service role can call those).
create schema if not exists vault_internal;
revoke all on schema vault_internal from public;
revoke all on schema vault_internal from anon;
revoke all on schema vault_internal from authenticated;

create unlogged table vault_internal.entities_staging (like public.vault_entities including defaults);
create unlogged table vault_internal.edges_staging    (like public.vault_edges    including defaults excluding constraints);
alter table vault_internal.entities_staging enable row level security;
alter table vault_internal.edges_staging    enable row level security;
-- No policies on staging: deny-all to non-service-role; service role bypasses RLS.

-- Sync write path: SECURITY DEFINER RPCs in public schema.
-- All have pinned search_path and execute revoked from public/anon/authenticated;
-- service role bypasses GRANT/REVOKE so no explicit GRANT EXECUTE needed.

create or replace function public.vault_sync_insert_entities(payload jsonb)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public, vault_internal
as $$
declare inserted_count int;
begin
  insert into vault_internal.entities_staging (
    entity_id, entity_type, slug, title, file_path_relative,
    frontmatter, body_md, sensitivity, tags,
    file_mtime, file_sha, last_synced
  )
  select
    e->>'entity_id',
    e->>'entity_type',
    e->>'slug',
    e->>'title',
    e->>'file_path_relative',
    coalesce(e->'frontmatter', '{}'::jsonb),
    coalesce(e->>'body_md', ''),
    e->>'sensitivity',
    coalesce(array(select jsonb_array_elements_text(e->'tags')), '{}'::text[]),
    nullif(e->>'file_mtime', '')::timestamptz,
    e->>'file_sha',
    coalesce(nullif(e->>'last_synced', '')::timestamptz, now())
  from jsonb_array_elements(payload) e;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end
$$;
revoke all on function public.vault_sync_insert_entities(jsonb) from public;
revoke all on function public.vault_sync_insert_entities(jsonb) from anon;
revoke all on function public.vault_sync_insert_entities(jsonb) from authenticated;

create or replace function public.vault_sync_insert_edges(payload jsonb)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public, vault_internal
as $$
declare inserted_count int;
begin
  insert into vault_internal.edges_staging (
    src_entity_id, relation_type, dst_entity_id, dst_resolved, source_kind
  )
  select
    e->>'src_entity_id',
    e->>'relation_type',
    e->>'dst_entity_id',
    coalesce((e->>'dst_resolved')::boolean, false),
    e->>'source_kind'
  from jsonb_array_elements(payload) e;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end
$$;
revoke all on function public.vault_sync_insert_edges(jsonb) from public;
revoke all on function public.vault_sync_insert_edges(jsonb) from anon;
revoke all on function public.vault_sync_insert_edges(jsonb) from authenticated;

create or replace function public.vault_sync_truncate_staging()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, vault_internal
as $$
begin
  truncate vault_internal.entities_staging, vault_internal.edges_staging;
end
$$;
revoke all on function public.vault_sync_truncate_staging() from public;
revoke all on function public.vault_sync_truncate_staging() from anon;
revoke all on function public.vault_sync_truncate_staging() from authenticated;

create or replace function public.vault_swap_from_staging()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, vault_internal
as $$
declare prod_count int; staging_count int;
begin
  -- Sanity guard: refuse if staging would delete >50% of production rows.
  -- Prevents a parser regression from nuking the index.
  select count(*) into prod_count    from public.vault_entities;
  select count(*) into staging_count from vault_internal.entities_staging;
  if prod_count > 0 and staging_count < prod_count / 2 then
    raise exception 'vault sync abort: staging entities (%) < 50%% of production (%)',
                    staging_count, prod_count;
  end if;
  delete from public.vault_edges;
  delete from public.vault_entities;
  insert into public.vault_entities select * from vault_internal.entities_staging;
  insert into public.vault_edges (src_entity_id, relation_type, dst_entity_id, dst_resolved, source_kind)
    select src_entity_id, relation_type, dst_entity_id, dst_resolved, source_kind
    from vault_internal.edges_staging
    on conflict (src_entity_id, relation_type, dst_entity_id) do nothing;
  -- Resolve dst_resolved against the new production snapshot.
  update public.vault_edges e
     set dst_resolved = exists (
       select 1 from public.vault_entities x where x.entity_id = e.dst_entity_id
     );
end
$$;
revoke all on function public.vault_swap_from_staging() from public;
revoke all on function public.vault_swap_from_staging() from anon;
revoke all on function public.vault_swap_from_staging() from authenticated;

-- Production RLS: read-only for any Clerk-authenticated session.
-- Writes go through service role (which bypasses RLS); no insert/update/delete policies.
alter table public.vault_entities         enable row level security;
alter table public.vault_edges            enable row level security;
alter table public.vault_sync_runs        enable row level security;
alter table public.vault_sync_run_errors  enable row level security;

create policy "auth read" on public.vault_entities        for select to authenticated using (true);
create policy "auth read" on public.vault_edges           for select to authenticated using (true);
create policy "auth read" on public.vault_sync_runs       for select to authenticated using (true);
create policy "auth read" on public.vault_sync_run_errors for select to authenticated using (true);
