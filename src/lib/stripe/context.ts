import type Stripe from "stripe";

// The Stripe ACCOUNT-CONTEXT seam.
//
// Every Stripe API call in this app flows through a StripeAccountContext, even
// though V1 is single-tenant. This exists so that adding Stripe Connect later
// (the multi-tenant spin-out) is a PURELY ADDITIVE change: the context will
// resolve to a connected account `acct_xxx`, and NOTHING above this seam — no
// seam function, server action, or webhook handler — changes. Only
// `resolveStripeContext` below gets a real implementation.
//
// `stripeAccountId: null` means "operate as the PLATFORM account itself" — i.e.
// Chloe's own Stripe account in V1.

export type StripeAccountContext = { stripeAccountId: string | null };

// The V1 / platform context: act as our own account. Exported as a named
// constant so call sites read intentionally (resolveStripeContext returns this
// today) and so tests have a stable reference.
export const PLATFORM_CONTEXT: StripeAccountContext = { stripeAccountId: null };

export async function resolveStripeContext(): Promise<StripeAccountContext> {
  // TODAY (single-tenant): always the platform account.
  //
  // When multi-tenant, resolve the current tenant's connected
  // `stripe_account_id` here (e.g. from the Clerk session / org → a per-tenant
  // column) and return `{ stripeAccountId: "acct_..." }`. Every caller already
  // threads this context through to requestOptionsFor(), so ONLY this function
  // changes — the whole point of the seam.
  return PLATFORM_CONTEXT;
}

// Translate a context into the Stripe per-request options.
//   platform (null)     → {}                              (act as ourselves)
//   connected account   → { stripeAccount: "acct_..." }   (act on their behalf)
//
// This is how the Stripe Node SDK targets a Connect account on a PER-REQUEST
// basis (vs. a per-client setting), so a single platform client serves every
// tenant. The returned object is spread into each SDK call's request-options
// argument, alongside per-call options like `idempotencyKey`.
//
// NOTE: the SDK is migrating toward `stripeContext` over `stripeAccount`; they
// are currently identical. We use `stripeAccount` (still supported, documented,
// and what the plan specifies); revisit if the SDK drops it.
export function requestOptionsFor(
  ctx: StripeAccountContext,
): Stripe.RequestOptions {
  return ctx.stripeAccountId ? { stripeAccount: ctx.stripeAccountId } : {};
}
