import type Stripe from "stripe";

// Signature verification, isolated so it can be unit-tested without env or a
// live key (the Stripe instance is passed in; HMAC verification uses the webhook
// secret, not the API key). The route calls this over the RAW request body.
export function constructStripeEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string | null,
  webhookSecret: string,
): { data: Stripe.Event } | { error: string } {
  if (!signature) return { error: "Missing Stripe-Signature header." };
  try {
    return { data: stripe.webhooks.constructEvent(rawBody, signature, webhookSecret) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Invalid webhook signature.",
    };
  }
}
