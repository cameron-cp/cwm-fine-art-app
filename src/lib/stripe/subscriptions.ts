import { getStripe } from "./client";
import { buildRetainerCheckoutParams, buildRetainerPriceParams } from "./params";
import { ensureStripeCustomer } from "./customers";
import { requestOptionsFor, type StripeAccountContext } from "./context";
import { subscriptionFacts, type SubscriptionFacts } from "./stripe-fields";
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

// Change what a live retainer charges. Stripe prices are immutable, so this
// mints a fresh price and swaps the subscription's single item onto it.
//
// proration_behavior: "none" is deliberate. A retainer is a standing fee, not
// metered usage: raising it mid-period should not fire an immediate catch-up
// charge at the collector, and lowering it should not hand back a credit she
// never agreed to. The new amount takes effect on the next cycle, which is what
// "we're moving you to $3k a month" means to both parties. The subscription
// metadata is rewritten in the same call so a later webhook rebuilding the
// mirror from metadata sees the current figures, not the original ones.
export async function updateRetainerSubscription(args: {
  subscriptionId: string;
  amountCents: number;
  currency: string;
  billingInterval: RetainerInterval;
  description: string;
  ctx: StripeAccountContext;
}): Promise<Result<SubscriptionFacts>> {
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };

  try {
    const options = requestOptionsFor(args.ctx);
    const current = await stripe.subscriptions.retrieve(
      args.subscriptionId,
      undefined,
      options,
    );
    const itemId = current.items.data[0]?.id;
    if (!itemId) {
      return { error: "That Stripe subscription has no billable item." };
    }

    const price = await stripe.prices.create(
      buildRetainerPriceParams({
        amountCents: args.amountCents,
        currency: args.currency,
        billingInterval: args.billingInterval,
        description: args.description,
      }),
      options,
    );

    const updated = await stripe.subscriptions.update(
      args.subscriptionId,
      {
        items: [{ id: itemId, price: price.id }],
        proration_behavior: "none",
        metadata: {
          ...(current.metadata ?? {}),
          amount_cents: String(args.amountCents),
          interval: args.billingInterval,
          description: args.description,
          currency: args.currency.toLowerCase(),
        },
        expand: ["items.data.price"],
      },
      options,
    );

    return { data: subscriptionFacts(updated) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to update retainer.",
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
