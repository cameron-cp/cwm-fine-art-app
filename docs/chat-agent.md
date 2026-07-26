# The Registrar — conversational agent over the dealer's graph

## What this is

A free-text chat that answers from — and writes to — Chloe's own records. The
north-star utterance:

> "John Smith is looking for a 1960s Joan Mitchell."

One sentence, three operations:

1. **Capture** — record John Smith's interest (artist = Joan Mitchell,
   era = 1960s) as typed `collector_interests` rows, source
   `inferred_from_conversation`.
2. **Search** — find every 1960s Joan Mitchell she knows about — her inventory
   AND works she merely tracks — with who owns each one.
3. **Recall** — surface what her second brain already knows: "you discussed
   *Untitled, 1962* with the Hendersons; they had high pricing expectations."

The chat is the front door; the existing screens are the audit surface. Every
answer must cite its records (links to the artwork / party / note it used) —
an oracle that can't show provenance is the wrong product for a business that
runs on provenance.

## Why the schema needed one addition (migration 0016)

"They are owned by these people" was unanswerable before 0016:

- `artworks` implicitly meant *her stock*.
- Ownership lived only in `provenance_lines[]` — free text, unqueryable.
- `current_party_address_id` (0009) is deliberately *location*, not title.

0016 adds:

- **`artworks.record_kind`** — `'inventory'` (her stock; the default, so every
  existing row keeps its meaning) vs `'tracked'` (a work she knows about but
  does not hold — market intelligence). Tracked works make "10 Joan Mitchells"
  mean *the market as she sees it*, not just what's in her racks.
- **`artwork_ownerships`** — structured `artwork ↔ party` title edges with
  history (`ended_on is null` = current), plus `source` + `confidence`
  mirroring `collector_interests` (0014) so downstream consumers can weight by
  how she knows. Joint ownership is allowed (two current rows); the same party
  can't hold two *current* rows on one work.

Provenance stays as display text on tearsheets; ownerships are the queryable
layer. Folding text provenance into edges is future work, not this slice.

**Superseded by 0019.** `artwork_ownerships` is now **`artwork_parties`**, with a
`role` column — she attaches a contact to a work as its `owner` (the primary
case) but also as `consignor`, `advisor`, `gallery`, `agent`, `custodian`,
`conservator`, `lender`, or `other`. Everything above still holds for the title
edge; the open-link uniqueness rule is now per `(artwork, party, role)`.

`role = 'owner'` is the ONLY thing that means title. Every owner projection
filters on it — `search_artworks.current_owners`, `get_artwork.ownership_history`,
and `get_party.currently_owns`. Non-title edges ship as their own keys
(`get_artwork.other_parties`, `get_party.other_work_links`) so the model states
the role it was given instead of blurring an advisor into an owner. The rename
was deliberate: it makes an un-patched read fail loudly rather than silently
report the wrong thing.

## Architecture

```
/chat (client UI)
  └─ POST /api/chat  { messages }        Clerk-gated (middleware default)
       └─ runRegistrar()                 src/lib/chat/agent.ts
            Anthropic tool-use loop (same SDK pattern as import/condition/bio)
            ├─ search_artworks           inventory + tracked, owners embedded
            ├─ get_artwork               full record: provenance, ownerships
            ├─ search_parties            people/orgs by name, with roles
            ├─ get_party                 interests + relationships + ownerships
            ├─ search_notes              vault_entities/vault_edges (first UI
            │                            consumer of the 0005 index)
            └─ log_collector_interest    THE ONE WRITE — validated by
                                         interestSchema, reported back verbatim
```

- **Model**: `claude-opus-4-8`, matching the condition-report and bio
  integrations. System prompt is frozen for prompt-cache hits (import-route
  precedent).
- **Loop**: execute `tool_use` blocks server-side, feed `tool_result` back,
  max 8 rounds, non-streaming v1 (the app already tolerates Browserless-length
  waits; streaming is a fast-follow).
- **Auth/RLS**: the route uses `getSupabaseServer()` — the user-JWT client —
  so the agent can only ever see what the signed-in dealer can see. No
  service-role reads in the chat path.
- **Citations**: every tool executor returns machine `refs`
  (`{kind, id, label}`) alongside the model-facing JSON. The route surfaces
  them as `toolEvents`; the UI renders them as a "records consulted" trail of
  links under each answer.

### The write rule

`log_collector_interest` is the only mutation. The system prompt instructs the
model to log only facts the dealer *states* (not speculation), to default
`source = inferred_from_conversation`, `confidence = likely` unless she is
explicit, and to report exactly what was recorded. Input is validated by the
same `interestSchema` as the manual editor — the chat cannot write a shape the
form couldn't. Artist names resolve via `match_artist_by_name` (0004) with an
ILIKE fallback; an unresolvable artist is reported back as a question, never
guessed into free text.

Interests whose only era payload is a decade land as
`dimension = 'era', value = '1960s'` — same self-healing free-text taxonomy as
the editor.

## Out of scope for this slice (deliberately)

- Streaming responses; conversation persistence (each visit starts fresh)
- Interaction capture as first-class rows ("met Sarah, she balked at 400") —
  next write tool, wants its own table
- FTS / embeddings (ADR 0004 defers FTS; ILIKE is fine at single-dealer scale)
- Matchmaking ("who should see this?") — it's a *question to this agent*, not
  a separate feature; arrives free once interests accumulate
- Public sharing / viewing rooms

## UI ("Ask", `/chat`)

Design-system notes (also §Conversation in `docs/design/design-system.md`):
speaker labels as letterspaced uppercase micro-caps (YOU / REGISTRAR), turns
separated by hairline rules on the plaster ground, no bubbles, no shadows.
Send is the view's single claret action. Record citations render as underlined
links with a mono id feel; the recorded-interest confirmation renders as a
sage-dot line, museum-label style.
