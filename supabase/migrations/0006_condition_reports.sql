-- Condition reports: uploaded documents (PDF/image) attached to an artwork,
-- with AI-extracted structured fields cached in `parsed`.
-- Files live in the existing `artworks` storage bucket under
-- `<artwork_id>/condition-reports/<uuid>.<ext>` — reuses the bucket's RLS,
-- so no new storage policy is needed.

create table condition_reports (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references artworks(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  parse_status text not null default 'pending',   -- 'pending' | 'parsed' | 'failed'
  parse_error text,
  parsed jsonb,                                    -- structured extraction (see condition-report schema)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index condition_reports_artwork_id_idx on condition_reports(artwork_id, created_at desc);

create trigger condition_reports_set_updated_at before update on condition_reports
  for each row execute function set_updated_at();

-- RLS: same single-user posture as the rest of the schema.
alter table condition_reports enable row level security;

create policy "authenticated full access on condition_reports"
  on condition_reports for all
  to authenticated
  using (true) with check (true);
