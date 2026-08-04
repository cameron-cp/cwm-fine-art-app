# 0009 — Per-feature AI model registry

Status: accepted (2026-07-14)

## Context

The app has four AI features, each a single model-calling function:

| Feature     | Call site                        | What it does                                        |
| ----------- | -------------------------------- | --------------------------------------------------- |
| `import`    | `src/lib/import/anthropic.ts`    | Extract artwork data from an uploaded factsheet PDF |
| `condition` | `src/lib/condition/anthropic.ts` | Extract findings from a condition report PDF/image  |
| `bio`       | `src/lib/artist/bio.ts`          | Draft an artist bio and fact-check life dates       |
| `chat`      | `src/lib/chat/agent.ts`          | The Registrar tool-use agent over the dealer's data |

Each call site hard-coded its model string. They had already drifted: `import`
was pinned to `claude-opus-4-7` while the other three were on `claude-opus-4-8`,
with nothing surfacing the divergence. We want to (a) choose the model per
feature in one reviewed place, (b) change it per feature at runtime without a
code deploy, and (c) be ready to move a feature onto a non-Anthropic provider
later without touching the call sites. The model per feature is chosen from an
in-app **Settings UI** (`/settings` → "AI models"), so the choice can be changed
without a deploy and without editing env; env + code remain as the fallback
defaults for any feature never touched in the UI.

## Decision

A single registry — `src/lib/ai/models.ts` — owns the provider + model catalog
and the code defaults; a thin server layer — `src/lib/ai/settings.ts` — persists
the dealer's per-feature choice in the `ai_feature_settings` table (migration
0018) and merges it with the defaults.

### Source of truth + precedence

The effective model for a feature is resolved in this order (highest first):

1. **DB selection** (`ai_feature_settings` row) — what the dealer picked in the
   Settings UI. Absence of a row = "use the default".
2. **Env override** (`AI_MODEL_<FEATURE>`) — a deploy-level pin for a feature the
   dealer hasn't chosen in the UI.
3. **Code default** (`FEATURE_MODEL_DEFAULTS`) — the reviewed, checked-in choice.
   All four features are pinned to `claude-opus-4-8`; this resolves the `import`
   drift deliberately in favor of the current flagship.

`pickEffectiveModel(feature, storedRow, {env})` is the pure precedence function
(unit-tested); `getEffectiveFeatureModel(feature, supabase)` wraps it with the DB
read and is what the call sites use. Each call site is passed the resolved
`model`; there is **zero** model string hard-coded at any call site (grep-enforced).

### The catalog + save validation

`MODEL_CATALOG` lists the selectable models per provider — this is what the UI
dropdown renders and what a save is validated against. `assertSelectableModel`
rejects a write whose provider isn't implemented or whose model isn't in that
provider's catalog, so the DB can never hold an unusable selection. A stale DB
row on a since-un-implemented provider still fails loudly at resolve time (the
same guard as env/code).

### Env override format

`AI_MODEL_<FEATURE>` accepts two forms:

- `claude-sonnet-5` — model only; provider stays the code default's provider.
  This is the common case while we're single-provider.
- `openai:gpt-5` — `provider:model`; sets both explicitly.

Malformed values (leading/trailing colon, multiple colons, unknown provider
token) throw `AiConfigError` at resolve time — a bad `.env` fails loudly, not
silently.

### Override format

`AI_MODEL_<FEATURE>` accepts two forms:

- `claude-sonnet-5` — model only; provider stays the code default's provider.
  This is the common case while we're single-provider.
- `openai:gpt-5` — `provider:model`; sets both explicitly.

Malformed values (leading/trailing colon, multiple colons, unknown provider
token) throw `AiConfigError` at resolve time — a bad `.env` fails loudly, not
silently.

### The provider-extensibility seam

`provider` is a first-class field on every entry. `AI_PROVIDERS` is the set of
provider **names** config may reference; `IMPLEMENTED_PROVIDERS` is the subset
with a working client adapter (today: just `anthropic`). Pointing a feature at a
named-but-unimplemented provider (e.g. `openai:gpt-5`) throws with a message
listing what IS implemented — it never falls through to the Anthropic SDK.

Adding a provider later is:

1. `AI_PROVIDERS` already lists common names — add any missing one.
2. Write the client adapter at the call sites (the SDK-specific message/tool
   plumbing) and add the provider to `IMPLEMENTED_PROVIDERS`.
3. Add its models to `MODEL_CATALOG` (they'll appear in the UI dropdown) and/or
   point a feature's default/env override at it.

No call site changes to _introduce_ the provider; the call sites already ask the
registry which model to use. (Cross-provider message/tool translation is
deliberately out of scope until a second provider actually lands — YAGNI.)

## How to change a feature's model

- **From the app (the normal path):** `/settings` → "AI models" → pick a model
  per feature, or choose "Default" to revert. Persists immediately in
  `ai_feature_settings`; no deploy.
- **Per environment, no UI:** set `AI_MODEL_<FEATURE>`, e.g.
  `AI_MODEL_CHAT=claude-sonnet-5` or `AI_MODEL_IMPORT=anthropic:claude-opus-4-8`.
  Overridden by any UI choice for that feature.
- **Change the built-in default:** edit `FEATURE_MODEL_DEFAULTS` in
  `src/lib/ai/models.ts`.

`resolveAllFeatureModels()` dumps the effective env/code config (ignoring the DB
layer) for an ops/debug view.

## Consequences

- One place to audit which model each feature runs on, changeable from the app.
- A model change is a dropdown, not a hunt across four files or a deploy.
- The multi-provider future has a defined seam and a loud failure mode, without
  paying for a cross-provider abstraction we don't need yet.
- New surface area (a DB table + Settings section). The table degrades safely: a
  read error falls back to env/code defaults rather than taking AI features down.
