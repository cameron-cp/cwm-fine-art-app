// The ONE definition of "a party that may receive an outward action" — be
// invoiced, emailed a viewing-room invite, or charged a retainer.
//
// Unidentified parties (migration 0022) are real rows in the ownership graph but
// have nobody behind them to bill or email. Before 0022 all three pickers selected
// every party unconditionally, so a placeholder was billable and emailable.
//
// This is a shared helper rather than an inline `.eq()` at each call site on
// purpose: it makes the rule greppable (same reasoning as TITLE_ROLE in
// schemas/artwork-party.ts) and gives the test something to exercise, so deleting
// the filter from a picker fails a test instead of silently widening it.
//
// Deliberately NOT applied to: the Contacts list and its relationship-counterparty
// picker, or the Registrar chat's party search. Those are internal graph surfaces —
// hiding unidentified rows there would strand the only place she can rename them.
export const CONTACTABLE_PARTY_COLUMN = "is_unidentified";

// `Q` is inferred straight from the argument and handed back unchanged, so the
// caller keeps its exact builder type (and its row type) with no widening. The
// cast is what keeps it that way: declaring the parameter as a structural
// `{ eq(...): Q }` instead makes TypeScript solve for Q against PostgREST's
// builder generics, which overflows (TS2589) on a select carrying an embedded
// join — the invoice buyer query is exactly that. One contained cast beats
// re-inlining the rule at three call sites.
export function onlyContactableParties<Q>(query: Q): Q {
  return (query as { eq(column: string, value: unknown): Q }).eq(
    CONTACTABLE_PARTY_COLUMN,
    false,
  );
}
