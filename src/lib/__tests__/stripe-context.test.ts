import { describe, expect, it } from "vitest";
import {
  PLATFORM_CONTEXT,
  requestOptionsFor,
  resolveStripeContext,
} from "@/lib/stripe/context";

// The account-context seam is the load-bearing invariant for a future Stripe
// Connect migration: platform (null) must produce EMPTY request options (so V1
// behaves exactly as if the seam weren't there), and a connected account must
// produce `{ stripeAccount }` (so a Connect call is routed on-behalf-of). If
// either mapping breaks, V1 silently changes behavior or Connect calls hit the
// wrong account — so these are asserted exactly, not loosely.

describe("requestOptionsFor", () => {
  it("returns EMPTY options for the platform account (null) — V1 must be a no-op", () => {
    // Why {} and not { stripeAccount: null }: passing a null/undefined
    // stripeAccount to the SDK would still be a no-op, but an EMPTY object
    // guarantees the request is byte-for-byte identical to a pre-seam call.
    expect(requestOptionsFor({ stripeAccountId: null })).toEqual({});
  });

  it("routes to the connected account when an acct id is present (Connect path)", () => {
    expect(requestOptionsFor({ stripeAccountId: "acct_123" })).toEqual({
      stripeAccount: "acct_123",
    });
  });
});

describe("resolveStripeContext", () => {
  it("resolves to the platform account in V1 (single-tenant)", async () => {
    // The whole seam turns on this returning platform TODAY; when it returns a
    // connected account, nothing else in the app changes. Guarding the V1 value
    // ensures no accidental multi-tenant behavior ships before Connect is built.
    await expect(resolveStripeContext()).resolves.toEqual({
      stripeAccountId: null,
    });
    expect(PLATFORM_CONTEXT).toEqual({ stripeAccountId: null });
  });
});
