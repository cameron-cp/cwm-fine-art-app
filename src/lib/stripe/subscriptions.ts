import { getStripe } from "./client";
import { buildRetainerCheckoutParams } from "./params";
import { ensureStripeCustomer } from "./customers";
import { requestOptionsFor, type StripeAccountContext } from "./context";
import type { Party } from "@/lib/schemas/party";
import type { Retainer, RetainerInterval } from "@/lib/schemas/stripe";

type Result<T> = { data: T } | { error: string };

// Subscription-mode Checkout for a retainer. The retainers row is created (as a
// stub) by the caller BEFORE redirect; here we only mint the Stripe session. The
// webhook fills stripe_subscription_id + stripe_price_id on completion.
export async function createRetainerCheckoutSession(args: {
  party: Pick<Party, "id" | "display_name" | "email" | "stripe_customer_id">;
  amountCents: number;
  currency: string;
  billingInterval: RetainerInterval;
  description: string;
  appUrl: string;
  ctx: StripeAccountContext;
}): Promise<Result<{ id: string; url: string }>> {
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };

  const customer = await ensureStripeCustomer(args.party, args.ctx);
  if ("error" in customer) return customer;

  try {
    const session = await stripe.checkout.sessions.create(
      buildRetainerCheckoutParams({
        stripeCustomerId: customer.data.id,
        partyId: args.party.id,
        amountCents: args.amountCents,
        currency: args.currency,
        billingInterval: args.billingInterval,
        description: args.description,
        appUrl: args.appUrl,
      }),
      requestOptionsFor(args.ctx),
    );
    if (!session.url) return { error: "Stripe returned no checkout URL." };
    return { data: { id: session.id, url: session.url } };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to create retainer.",
    };
  }
}

// Cancel a retainer. If it never activated (no subscription id — abandoned
// checkout), there is nothing to cancel at Stripe; the caller just marks the
// local row canceled.
export async function cancelRetainerSubscription(
  retainer: Pick<Retainer, "stripe_subscription_id">,
  ctx: StripeAccountContext,
): Promise<Result<{ canceled: boolean }>> {
  if (!retainer.stripe_subscription_id) return { data: { canceled: false } };

  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };

  try {
    await stripe.subscriptions.cancel(
      retainer.stripe_subscription_id,
      undefined,
      requestOptionsFor(ctx),
    );
    return { data: { canceled: true } };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to cancel retainer.",
    };
  }
}
