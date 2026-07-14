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
later without touching the call sites. Model selection is an engineer/ops
decision (Cameron), not a dealer-facing one — so this is **config, not a Settings
UI**.

## Decision

A single registry — `src/lib/ai/models.ts` — owns the provider + model for every
feature.

### Source of truth + override precedence

1. **Code default** (`FEATURE_MODEL_DEFAULTS`) — the reviewed, checked-in choice.
   All four features are pinned to `claude-opus-4-8`; this resolves the `import`
   drift deliberately in favor of the current flagship.
2. **Env override** (`AI_MODEL_<FEATURE>`) — wins over the default at runtime.
   Blank/unset falls through to the default.

`resolveFeatureModel(feature)` returns the effective `{ provider, model }`. Each
call site calls it instead of naming a model. There is now **zero** model string
hard-coded outside the registry (enforceable by grep).

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
3. Point a feature's default or env override at it.

No call site changes to _introduce_ the provider; the call sites already ask the
registry which model to use. (Cross-provider message/tool translation is
deliberately out of scope until a second provider actually lands — YAGNI.)

## How to change a feature's model

- **Permanently, reviewed:** edit `FEATURE_MODEL_DEFAULTS` in
  `src/lib/ai/models.ts`.
- **Per environment, no deploy:** set the env var, e.g.
  `AI_MODEL_CHAT=claude-sonnet-5` or `AI_MODEL_IMPORT=anthropic:claude-opus-4-8`.
  Restart to pick it up.

`resolveAllFeatureModels()` dumps the effective config for every feature (and
reports a per-feature error string rather than throwing) for an ops/debug view.

## Consequences

- One place to audit and change which model each feature runs on.
- A model change is a one-line diff or one env var, not a hunt across four files.
- The multi-provider future has a defined seam and a loud failure mode, without
  paying for a cross-provider abstraction we don't need yet.
