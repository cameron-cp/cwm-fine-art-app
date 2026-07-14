import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AI_FEATURES,
  assertSelectableModel,
  type AiFeature,
  type FeatureModel,
  pickEffectiveModel,
} from "./models";

// Server-side layer over the ai_feature_settings table. Reads the dealer's
// per-feature model choices and merges them with the env/code defaults
// (precedence lives in pickEffectiveModel: DB > env > code). Kept separate from
// models.ts so that module stays pure/DB-free and unit-testable.

type SettingsRow = { feature: string; provider: string; model: string };

// Read all stored selections into a partial map. A DB error is swallowed to a
// warning and treated as "no stored selections" so a settings-table hiccup
// degrades to the code default rather than taking an AI feature down.
export async function readAiModelSettings(
  supabase: SupabaseClient,
): Promise<Partial<Record<AiFeature, FeatureModel>>> {
  const { data, error } = await supabase
    .from("ai_feature_settings")
    .select("feature, provider, model");

  if (error) {
    console.warn("[ai] could not read ai_feature_settings; using defaults", error.message);
    return {};
  }

  const out: Partial<Record<AiFeature, FeatureModel>> = {};
  for (const row of (data ?? []) as SettingsRow[]) {
    // Ignore rows for unknown features (e.g. a feature removed from the code).
    if (!AI_FEATURES.includes(row.feature as AiFeature)) continue;
    out[row.feature as AiFeature] = { provider: row.provider as FeatureModel["provider"], model: row.model };
  }
  return out;
}

// The effective { provider, model } a feature should use right now: DB choice if
// present, else env, else code default. This is what the AI call sites call.
export async function getEffectiveFeatureModel(
  feature: AiFeature,
  supabase: SupabaseClient,
): Promise<FeatureModel> {
  const stored = await readAiModelSettings(supabase);
  return pickEffectiveModel(feature, stored[feature]);
}

// The full config for the Settings page: every feature's effective model plus
// whether it came from a stored (DB) choice or is falling back to the default.
export type FeatureModelStatus = {
  feature: AiFeature;
  effective: FeatureModel;
  isCustom: boolean;
};

export async function getAllFeatureModelStatus(
  supabase: SupabaseClient,
): Promise<FeatureModelStatus[]> {
  const stored = await readAiModelSettings(supabase);
  return AI_FEATURES.map((feature) => ({
    feature,
    effective: pickEffectiveModel(feature, stored[feature]),
    isCustom: Boolean(stored[feature]),
  }));
}

// Persist a feature's model choice. Validates against the catalog + implemented
// providers (assertSelectableModel throws AiConfigError on a bad pair) before
// upserting, so the DB can never hold an unusable selection.
export async function saveAiModelSetting(
  supabase: SupabaseClient,
  feature: AiFeature,
  provider: string,
  model: string,
): Promise<void> {
  if (!AI_FEATURES.includes(feature)) {
    throw new Error(`Unknown AI feature "${feature}".`);
  }
  const normalized = assertSelectableModel(provider, model);
  const { error } = await supabase
    .from("ai_feature_settings")
    .upsert(
      { feature, provider: normalized.provider, model: normalized.model, updated_at: new Date().toISOString() },
      { onConflict: "feature" },
    );
  if (error) throw new Error(error.message);
}

// Clear a feature's stored choice, reverting it to the env/code default.
export async function resetAiModelSetting(
  supabase: SupabaseClient,
  feature: AiFeature,
): Promise<void> {
  const { error } = await supabase.from("ai_feature_settings").delete().eq("feature", feature);
  if (error) throw new Error(error.message);
}
