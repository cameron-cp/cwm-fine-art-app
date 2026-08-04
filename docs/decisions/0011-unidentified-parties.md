# 0011 — Unidentified parties

**Status:** accepted · **Migration:** `0022_party_unidentified.sql`

## The problem

An advisor has a work. The owner behind that advisor is "private collectors in
Palm Beach, FL" and that is all the dealer will ever be told. The advisor edge is
easy — a real contact, `role='advisor'` in `artwork_parties` (0019). The owner is
the problem: `role='owner'` needs a `party_id`, and there is no party to name.

This is not a rare shape. In the advisor-mediated market an opaque owner is the
normal case, so whatever we do here decides how well the tracked-works feature
works where the dealer needs it most.

## Options considered

**Free text on the advisor row.** Put "owner is a private collector in Palm
Beach" in `artwork_parties.notes`. Zero schema change. Rejected: the owner stops
being a node, so "what else do these Palm Beach collectors have" — the exact
question 0016/0019 exist to answer — becomes unanswerable, and when she learns the
name she re-keys by hand while earlier works stay orphaned.

**A `provenance_lines[]` entry.** Rejected: that array is tearsheet display text
about the chain of past ownership, not a claim about who holds the work today.
Different field, different meaning.

**Reuse `entity_type='other'` + `confidence='tentative'`.** Rejected: nothing
about those values stops the row appearing in the invoice buyer picker, which is
the dangerous half of the problem.

## Decision

A real `parties` row, flagged: `parties.is_unidentified boolean not null default
false`.

The payoff is what happens when she learns the name — she renames one row and
every edge already hanging off it (the owner link, recorded interests, other works
traced to the same collectors) is retroactively correct. No re-keying, no orphans.

The flag is load-bearing, not cosmetic. Every picker that selects a party for an
**outward action** filters it out, via the shared
[`onlyContactableParties`](../../src/lib/parties/contactable.ts) helper:

| Surface | Consequence if it leaked |
| --- | --- |
| Invoice buyer ([`invoices/options.ts`](<../../src/app/(app)/invoices/options.ts>)) | a bill addressed to a placeholder |
| Viewing-room recipient ([`rooms/[id]/page.tsx`](<../../src/app/(app)/rooms/[id]/page.tsx>)) | a real invite email with nowhere to go |
| Retainer subscriber ([`retainers/new/page.tsx`](<../../src/app/(app)/retainers/new/page.tsx>)) | a Stripe charge attempt |

Before 0022 all three selected every party unconditionally. A DB CHECK
(`parties_unidentified_no_stripe_customer`) is the backstop on the money path, and
`updateParty` pre-checks it so flagging a contact with a saved card returns a
sentence rather than a raw constraint error.

Internal graph surfaces deliberately **do not** filter: the Contacts list, its
relationship-counterparty picker, and the Registrar chat's party search. Hiding
these rows in Contacts would strand the only surface that can rename them; the
chat needs them to answer "who holds this" and is told in its system prompt to
report what they hold without treating the placeholder as a contactable person.

Contacts shows them by default with a dashed `UNIDENTIFIED` meta tag rather than
hiding them behind a filter — hiding by default would make the flag feel like a
delete, and she'd need to know a filter existed to find them again. An
`ident` filter isolates or excludes them on demand.

## Consequences

- `role='owner'` can now point at a party that is not a nameable person. Anything
  presenting an owner to the dealer should surface the unidentified flag alongside
  it, as the chat tools do.
- A new picker with a real-world consequence must call `onlyContactableParties`.
  The source assertions in
  [`party-unidentified.test.ts`](../../src/lib/__tests__/party-unidentified.test.ts)
  cover the three that exist; a fourth belongs in that list.
- Still open: nothing merges an unidentified party into a named one if she creates
  the real contact separately before connecting the two. Dedupe is a later problem
  (the canonical-artist work, 0015, is the precedent to follow).
