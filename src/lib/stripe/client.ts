import Stripe from "stripe";
import { getServerEnv } from "@/lib/env";

// Lazy singleton, mirroring the Resend seam (getResendClient): no key → no
// client, and callers turn that into a clean { error } rather than throwing at
// import time. So the whole payments feature runs "dark" until STRIPE_SECRET_KEY
// is set.
//
// apiVersion is pinned so shapes cannot shift under us on a dashboard change,
// and it is pinned to the ACCOUNT's version rather than the SDK's default.
// Webhook events are rendered in the account's version, so a lower pin meant the
// SDK types described one shape while the endpoint received another — the drift
// the `invoice.parent.subscription_details` fallback in stripe-fields.ts already
// absorbs one instance of. Matching the account removes the class instead of
// patching cases. `stripe listen` prints the account's version if this needs
// re-checking; bump both together.
//
// The pure request builders live in ./params (no env), so they can be
// unit-tested without a key; this module is the only one that reads the secret.
let client: Stripe | null = null;

// Whether the configured key is a LIVE key. Only used to build dashboard deep
// links, which need a /test/ segment for test-mode and sandbox objects. Reads
// the prefix rather than any account field so it works with no network call and
// before any Stripe request has been made.
export function isStripeLiveMode(): boolean {
  const { STRIPE_SECRET_KEY } = getServerEnv();
  return Boolean(STRIPE_SECRET_KEY?.startsWith("sk_live"));
}

export function getStripe(): Stripe | null {
  const { STRIPE_SECRET_KEY } = getServerEnv();
  if (!STRIPE_SECRET_KEY) return null;
  if (!client) {
    client = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2026-08-26.dahlia",
    });
  }
  return client;
}
