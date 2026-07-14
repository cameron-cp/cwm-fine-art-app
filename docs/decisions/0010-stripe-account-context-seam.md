# 0010 — Stripe account-context seam (Connect-ready from day one)

**Status:** accepted · **Date:** 2026-07-14

## Context

V1 is single-tenant: one Stripe account (Chloe's own), so every API call operates
as the platform account. But the multi-tenant spin-out (Stripe **Connect**, where
each dealer has a connected account `acct_xxx`) is a plausible next chapter. If the
seam hard-codes "act as ourselves," retrofitting Connect later means editing every
Stripe call site — the exact kind of shotgun change that breaks a money rail.

## Decision

Route **every** Stripe API call through a single account-context abstraction from
day one, even though V1 never populates it.

- `src/lib/stripe/context.ts` defines `StripeAccountContext = { stripeAccountId: string | null }`
  (`null` = the platform account itself), `resolveStripeContext()` (returns the
  platform context today), and `requestOptionsFor(ctx)` — which maps `null → {}`
  and an account id → `{ stripeAccount: "acct_..." }`, the Stripe Node SDK's
  per-request on-behalf-of options.
- Every seam function (`createInvoiceCheckoutSession`, `ensureStripeCustomer`,
  `createSetupCheckoutSession`, `createBillingPortalSession`,
  `createRetainerCheckoutSession`, `cancelRetainerSubscription`,
  `settlementFromSession`) takes a `ctx` and spreads `requestOptionsFor(ctx)` into
  its SDK call's request-options argument.
- Callers (invoice/contact/retainer server actions) call `resolveStripeContext()`
  and thread the result through. The **webhook** derives its context from
  `event.account` (the connected-account id on Connect events; absent on platform
  events) so each event is applied against the account it came from.

In V1 the context always resolves to `{ stripeAccountId: null }`, so
`requestOptionsFor` returns `{}` and every call is byte-for-byte identical to a
pre-seam call. **Zero behavior change today.**

## What the future Connect migration touches

Only three things, all additive — no seam function, server action, or webhook
handler is edited:

1. **`resolveStripeContext()`** — give it a real body that resolves the current
   tenant's connected `stripe_account_id` (from the session/org).
2. **A per-tenant `stripe_account_id` column** (on an org/tenant table that does
   not exist yet) plus Connect onboarding to populate it.
3. **`event.account` routing** in the webhook is *already* wired — it just starts
   carrying real account ids instead of always being null.

Everything above the seam already threads the context, so the change surface is
those three points and nothing else. This ADR builds only the seam **shape** —
not Connect itself (no onboarding, no tenant tables, no new columns).
