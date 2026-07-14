import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// AI model registry — the single source of truth for which LLM provider + model
// each individual AI feature uses.
//
// Why this exists: the four AI features (tearsheet import, condition-report
// parse, artist-bio drafting, the registrar chat) each used to hard-code their
// model string at the call site, and they had already drifted apart (import was
// pinned to an older Opus than the rest). This module centralizes that choice so
// a model can be changed in one reviewed place — or, per feature, via env at
// runtime with no code change.
//
// Provider-extensibility: today every feature runs on Anthropic, but that will
// change. `provider` is a first-class field on every entry, and resolution runs
// through a guard (`IMPLEMENTED_PROVIDERS`) that fails loudly if a feature is
// pointed at a provider whose adapter doesn't exist yet. Adding a provider is:
// (1) extend the `AiProvider` union, (2) add it to `IMPLEMENTED_PROVIDERS` once
// its client adapter lands, (3) point a feature's default/override at it. No AI
// call site changes to add the provider; the call sites already ask the registry.
// ─────────────────────────────────────────────────────────────────────────────

// Providers we can name in config. A provider only becomes *usable* once it is
// also listed in IMPLEMENTED_PROVIDERS below (i.e. an SDK adapter exists).
export const AI_PROVIDERS = ["anthropic", "openai", "google"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

// Providers with a working client adapter wired into the call sites. Anything
// named in config but absent here throws at resolve time rather than silently
// calling the wrong SDK. Grow this as adapters land.
export const IMPLEMENTED_PROVIDERS: ReadonlySet<AiProvider> = new Set([
  "anthropic",
]);

// The AI features. Each maps 1:1 to one model-calling function in the codebase.
// The keys double as the env-override suffix (AI_MODEL_IMPORT, etc.).
export const AI_FEATURES = ["import", "condition", "bio", "chat"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export type FeatureModel = {
  provider: AiProvider;
  model: string;
};

// Human-facing metadata — powers docs and any future ops surface. Kept next to
// the defaults so a new feature is described where it's registered.
export const FEATURE_META: Record<
  AiFeature,
  { label: string; description: string; callSite: string }
> = {
  import: {
    label: "Tearsheet import",
    description: "Extracts structured artwork data from an uploaded factsheet PDF.",
    callSite: "src/lib/import/anthropic.ts",
  },
  condition: {
    label: "Condition-report parse",
    description: "Extracts condition findings from an uploaded report PDF or image.",
    callSite: "src/lib/condition/anthropic.ts",
  },
  bio: {
    label: "Artist bio",
    description: "Drafts a gallery bio note and fact-checks the supplied life facts.",
    callSite: "src/lib/artist/bio.ts",
  },
  chat: {
    label: "Registrar chat",
    description: "The conversational tool-use agent over the dealer's own records.",
    callSite: "src/lib/chat/agent.ts",
  },
};

// Code defaults — the reviewed, checked-in choice per feature. Overridable at
// runtime via env (see resolveFeatureModel). All four are deliberately pinned to
// the same flagship Opus: import was previously on claude-opus-4-7 while the
// others were on 4.8; that drift is resolved here in favor of the newer model.
export const FEATURE_MODEL_DEFAULTS: Record<AiFeature, FeatureModel> = {
  import: { provider: "anthropic", model: "claude-opus-4-8" },
  condition: { provider: "anthropic", model: "claude-opus-4-8" },
  bio: { provider: "anthropic", model: "claude-opus-4-8" },
  chat: { provider: "anthropic", model: "claude-opus-4-8" },
};

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

// The env override value for a feature. Two accepted forms:
//   "claude-sonnet-5"            → model only; provider stays the code default's
//   "openai:gpt-5"               → provider:model, explicit provider
// Whitespace tolerated; empty string treated as "no override".
const overrideSchema = z
  .string()
  .trim()
  .min(1)
  .refine((v) => !v.startsWith(":") && !v.endsWith(":"), {
    message: "must be 'model' or 'provider:model', with no leading/trailing colon",
  })
  .refine((v) => (v.match(/:/g) ?? []).length <= 1, {
    message: "at most one ':' separating provider and model",
  });

// Parse one override string into a partial FeatureModel. Validates the provider
// name against the known set; the model half is any non-empty token.
function parseOverride(
  feature: AiFeature,
  raw: string,
  fallbackProvider: AiProvider,
): FeatureModel {
  const parsed = overrideSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AiConfigError(
      `Invalid AI model override for "${feature}" (${envVarFor(feature)}="${raw}"): ${parsed.error.issues[0]?.message}`,
    );
  }
  const value = parsed.data;
  const colon = value.indexOf(":");
  if (colon === -1) {
    return { provider: fallbackProvider, model: value };
  }
  const providerToken = value.slice(0, colon);
  const model = value.slice(colon + 1);
  if (!AI_PROVIDERS.includes(providerToken as AiProvider)) {
    throw new AiConfigError(
      `Unknown AI provider "${providerToken}" in ${envVarFor(feature)}. Known providers: ${AI_PROVIDERS.join(", ")}.`,
    );
  }
  return { provider: providerToken as AiProvider, model };
}

// The env var name that overrides a given feature, e.g. "AI_MODEL_IMPORT".
export function envVarFor(feature: AiFeature): string {
  return `AI_MODEL_${feature.toUpperCase()}`;
}

type ResolveOptions = {
  // Env source. Defaults to process.env; tests pass an explicit map so they
  // don't have to mutate the real environment.
  env?: Record<string, string | undefined>;
};

// Resolve the effective { provider, model } for a feature: env override if
// present and valid, else the code default. Throws AiConfigError if the resolved
// provider has no implemented adapter, so a misconfiguration surfaces at the
// call site as a clear message instead of a wrong or silent API call.
export function resolveFeatureModel(
  feature: AiFeature,
  options: ResolveOptions = {},
): FeatureModel {
  const env = options.env ?? process.env;
  const fallback = FEATURE_MODEL_DEFAULTS[feature];

  const rawOverride = env[envVarFor(feature)];
  const resolved =
    rawOverride && rawOverride.trim() !== ""
      ? parseOverride(feature, rawOverride, fallback.provider)
      : fallback;

  if (!IMPLEMENTED_PROVIDERS.has(resolved.provider)) {
    throw new AiConfigError(
      `AI feature "${feature}" is configured for provider "${resolved.provider}", which has no implemented client adapter yet. ` +
        `Implemented providers: ${[...IMPLEMENTED_PROVIDERS].join(", ")}.`,
    );
  }

  return resolved;
}

// Resolve every feature at once — for a config-dump / ops view. Never throws for
// an individual feature; instead reports the error string so one broken override
// doesn't hide the rest of the config.
export function resolveAllFeatureModels(
  options: ResolveOptions = {},
): Record<AiFeature, FeatureModel | { error: string }> {
  const out = {} as Record<AiFeature, FeatureModel | { error: string }>;
  for (const feature of AI_FEATURES) {
    try {
      out[feature] = resolveFeatureModel(feature, options);
    } catch (e) {
      out[feature] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}
