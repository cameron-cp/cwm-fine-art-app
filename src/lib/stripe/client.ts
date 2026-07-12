import Stripe from "stripe";
import { getServerEnv } from "@/lib/env";

// Lazy singleton, mirroring the Resend seam (getResendClient): no key → no
// client, and callers turn that into a clean { error } rather than throwing at
// import time. So the whole payments feature runs "dark" until STRIPE_SECRET_KEY
// is set. apiVersion is pinned to the version this SDK ships against, so event
// shapes stay stable regardless of the account's dashboard setting.
//
// The pure request builders live in ./params (no env), so they can be
// unit-tested without a key; this module is the only one that reads the secret.
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const { STRIPE_SECRET_KEY } = getServerEnv();
  if (!STRIPE_SECRET_KEY) return null;
  if (!client) {
    client = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2026-06-24.dahlia",
    });
  }
  return client;
}
