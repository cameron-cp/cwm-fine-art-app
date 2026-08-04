-- AI feature model settings ------------------------------------------------
-- Per-feature choice of which LLM provider + model each AI feature uses,
-- editable via the in-app Settings page. One row per feature the dealer has
-- explicitly chosen a model for; ABSENCE of a row means "use the code/env
-- default" (see src/lib/ai/models.ts + ADR 0009). This lets a model be changed
-- per feature from the UI without a deploy, while the code default remains the
-- safety net for any feature never touched here.
--
-- `feature` is the primary key and matches the AiFeature union in
-- src/lib/ai/models.ts ('import' | 'condition' | 'bio' | 'chat'). No FK/enum in
-- the DB on purpose: the app validates the feature name AND the provider/model
-- against its catalog before writing, and keeping the column free-text means
-- adding a feature is a code change, not a migration.

create table ai_feature_settings (
  feature text primary key,
  provider text not null,
  model text not null,
  updated_at timestamptz not null default now()
);

create trigger ai_feature_settings_set_updated_at before update on ai_feature_settings
  for each row execute function set_updated_at();

alter table ai_feature_settings enable row level security;

-- Single-user app: same posture as invoice_settings — any authenticated session
-- (the dealer, via Clerk) has full access. anon has none.
create policy "authenticated full access on ai_feature_settings"
  on ai_feature_settings for all to authenticated using (true) with check (true);
