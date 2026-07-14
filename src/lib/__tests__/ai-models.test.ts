import { describe, expect, it } from "vitest";
import {
  AI_FEATURES,
  AiConfigError,
  assertSelectableModel,
  envVarFor,
  FEATURE_MODEL_DEFAULTS,
  FEATURE_META,
  MODEL_CATALOG,
  pickEffectiveModel,
  resolveAllFeatureModels,
  resolveFeatureModel,
  selectableModels,
} from "@/lib/ai/models";

// The AI model registry is the single source of truth for which provider+model
// each feature uses. These tests encode the invariants that make it safe to
// change a model per feature — via code default OR env — without a wrong or
// silent API call slipping through.

describe("registry completeness", () => {
  // Every feature must have a default AND metadata. A feature registered in the
  // union but missing either is a partial registration that would resolve to
  // undefined and blow up only at the call site — catch it here instead.
  it("every feature has a default and metadata", () => {
    for (const feature of AI_FEATURES) {
      expect(FEATURE_MODEL_DEFAULTS[feature], `${feature} default`).toBeDefined();
      expect(FEATURE_MODEL_DEFAULTS[feature].model.length).toBeGreaterThan(0);
      expect(FEATURE_META[feature], `${feature} meta`).toBeDefined();
    }
  });

  // The import feature had drifted onto an older Opus than the other three. The
  // registry's job is to make that choice deliberate and uniform — this test
  // fails the moment import silently drifts off the shared default again.
  it("resolves the import-drift by pinning all features to the same default model", () => {
    const models = AI_FEATURES.map((f) => FEATURE_MODEL_DEFAULTS[f].model);
    expect(new Set(models).size).toBe(1);
    expect(models[0]).toBe("claude-opus-4-8");
  });
});

describe("resolveFeatureModel — defaults", () => {
  it("returns the code default when no env override is set", () => {
    // Empty env → the checked-in default, provider included.
    expect(resolveFeatureModel("chat", { env: {} })).toEqual({
      provider: "anthropic",
      model: "claude-opus-4-8",
    });
  });

  it("treats a blank/whitespace override as no override", () => {
    // A blank .env line must not resolve to an empty model id.
    expect(resolveFeatureModel("bio", { env: { AI_MODEL_BIO: "   " } })).toEqual(
      FEATURE_MODEL_DEFAULTS.bio,
    );
  });
});

describe("resolveFeatureModel — env override wins", () => {
  it("overrides the model, keeping the default provider (model-only form)", () => {
    // Changing just the model — the common case while we're single-provider —
    // must not require naming the provider.
    expect(
      resolveFeatureModel("condition", { env: { AI_MODEL_CONDITION: "claude-haiku-4-5-20251001" } }),
    ).toEqual({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
  });

  it("overrides both provider and model (provider:model form)", () => {
    // The override targets one feature only; sibling features stay on default.
    const env = { AI_MODEL_IMPORT: "anthropic:claude-sonnet-5" };
    expect(resolveFeatureModel("import", { env })).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5",
    });
    expect(resolveFeatureModel("chat", { env })).toEqual(FEATURE_MODEL_DEFAULTS.chat);
  });

  it("uses the documented env var name per feature", () => {
    expect(envVarFor("import")).toBe("AI_MODEL_IMPORT");
    expect(envVarFor("chat")).toBe("AI_MODEL_CHAT");
  });
});

describe("resolveFeatureModel — malformed override is rejected loudly", () => {
  it("rejects a leading-colon value", () => {
    expect(() =>
      resolveFeatureModel("bio", { env: { AI_MODEL_BIO: ":gpt-5" } }),
    ).toThrow(AiConfigError);
  });

  it("rejects more than one colon", () => {
    expect(() =>
      resolveFeatureModel("bio", { env: { AI_MODEL_BIO: "openai:foo:bar" } }),
    ).toThrow(AiConfigError);
  });

  it("rejects an unknown provider token", () => {
    expect(() =>
      resolveFeatureModel("bio", { env: { AI_MODEL_BIO: "cohere:command-r" } }),
    ).toThrow(/Unknown AI provider "cohere"/);
  });
});

describe("resolveFeatureModel — provider-implemented guard (the extensibility seam)", () => {
  it("throws for a known-but-unimplemented provider so no silent wrong call happens", () => {
    // "openai" is a valid provider name (config can reference it) but has no
    // adapter yet. Pointing a feature at it must fail at resolve time with a
    // message naming what IS implemented — not fall through to the Anthropic SDK.
    expect(() =>
      resolveFeatureModel("chat", { env: { AI_MODEL_CHAT: "openai:gpt-5" } }),
    ).toThrow(/no implemented client adapter yet/);
  });

  it("allows the implemented provider (anthropic) through", () => {
    expect(() =>
      resolveFeatureModel("chat", { env: { AI_MODEL_CHAT: "anthropic:claude-sonnet-5" } }),
    ).not.toThrow();
  });
});

describe("pickEffectiveModel — precedence DB > env > code", () => {
  it("a stored (DB) selection wins over both env and code default", () => {
    // The dealer picked Sonnet in the UI; even with an env override present, the
    // explicit UI choice must win.
    const stored = { provider: "anthropic" as const, model: "claude-sonnet-5" };
    const env = { AI_MODEL_CHAT: "claude-haiku-4-5-20251001" };
    expect(pickEffectiveModel("chat", stored, { env })).toEqual(stored);
  });

  it("falls back to env override when there is no stored selection", () => {
    expect(
      pickEffectiveModel("chat", null, { env: { AI_MODEL_CHAT: "claude-haiku-4-5-20251001" } }),
    ).toEqual({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
  });

  it("falls back to the code default when neither DB nor env is set", () => {
    expect(pickEffectiveModel("chat", undefined, { env: {} })).toEqual(
      FEATURE_MODEL_DEFAULTS.chat,
    );
  });

  it("guards a stored selection on an unimplemented provider (defends against stale DB rows)", () => {
    // If the catalog once offered a provider that was later un-implemented, a
    // lingering DB row must fail loudly, not silently call the wrong SDK.
    const stored = { provider: "openai" as const, model: "gpt-5" };
    expect(() => pickEffectiveModel("chat", stored)).toThrow(/no implemented client adapter/);
  });
});

describe("assertSelectableModel — save-time catalog validation", () => {
  it("accepts a model that is in an implemented provider's catalog", () => {
    expect(assertSelectableModel("anthropic", "claude-opus-4-8")).toEqual({
      provider: "anthropic",
      model: "claude-opus-4-8",
    });
  });

  it("rejects a model not in the catalog", () => {
    expect(() => assertSelectableModel("anthropic", "claude-opus-9")).toThrow(
      /not in the anthropic catalog/,
    );
  });

  it("rejects an unimplemented provider even if a model id is given", () => {
    expect(() => assertSelectableModel("openai", "gpt-5")).toThrow(
      /no implemented client adapter/,
    );
  });
});

describe("selectableModels — UI catalog only exposes implemented providers", () => {
  it("lists anthropic models and no unimplemented provider's models", () => {
    const list = selectableModels();
    expect(list.length).toBe(MODEL_CATALOG.anthropic.length);
    expect(list.every((m) => m.provider === "anthropic")).toBe(true);
    // Every listed model must round-trip through save validation.
    for (const m of list) {
      expect(() => assertSelectableModel(m.provider, m.model)).not.toThrow();
    }
  });
});

describe("resolveAllFeatureModels — config dump isolates a bad override", () => {
  it("reports one broken feature's error without hiding the healthy ones", () => {
    // One malformed override must not blank out the whole config view.
    const all = resolveAllFeatureModels({ env: { AI_MODEL_BIO: "openai:gpt-5" } });
    expect(all.bio).toHaveProperty("error");
    expect(all.chat).toEqual(FEATURE_MODEL_DEFAULTS.chat);
    expect(all.import).toEqual(FEATURE_MODEL_DEFAULTS.import);
  });
});
