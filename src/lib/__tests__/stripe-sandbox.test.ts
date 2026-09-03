import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getStripe } from "@/lib/stripe/client";
import { PLATFORM_CONTEXT } from "@/lib/stripe/context";
import { syncStripeCustomer } from "@/lib/stripe/customers";
import { updateRetainerSubscription } from "@/lib/stripe/subscriptions";

// Integration tests for the two seams that reach into a LIVE Stripe account:
// pushing a contact rename onto its Customer, and swapping a running
// subscription's price. The pure decision functions are covered in
// stripe-retainer-edit.test.ts; what those cannot tell us is whether Stripe
// accepts the request shapes at all — a wrong positional argument or an
// unsupported price field only shows up against the real API.
//
// SAFETY: gated on an `sk_test` key, so this can never run against live keys
// and never touches a real collector's subscription. Skipped (not failed) with
// no key at all, mirroring the local-Postgres gate in stripe-rpc.test.ts, so a
// contributor without a sandbox stays green.
//
// Every object it creates is torn down in afterAll.

const key = process.env.STRIPE_SECRET_KEY;
const sandbox = Boolean(key?.startsWith("sk_test"));
const d = sandbox ? describe : describe.skip;

d("Stripe sandbox seams", () => {
  const stripe = getStripe()!;
  const ctx = PLATFORM_CONTEXT;
  let customerId = "";
  let subscriptionId = "";

  beforeAll(async () => {
    const customer = await stripe.customers.create({
      name: "Convergence Fixture",
      email: "fixture-before@example.com",
      metadata: { fixture: "stripe-sandbox.test.ts" },
    });
    customerId = customer.id;

    // pm_card_visa is Stripe's shared test payment method; attaching it lets the
    // subscription activate without a hosted Checkout, which is the only way to
    // get a live subscription to edit inside a test.
    // Attaching mints a NEW payment method id — the shared `pm_card_visa` token
    // is not itself attachable as a default, so use what attach hands back.
    const method = await stripe.paymentMethods.attach("pm_card_visa", {
      customer: customerId,
    });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: method.id },
    });

    // A subscription item's inline `price_data` takes a product ID, not
    // `product_data` — which is precisely why the app builds retainer prices
    // through prices.create (buildRetainerPriceParams) instead.
    const price = await stripe.prices.create({
      currency: "usd",
      unit_amount: 250_000,
      recurring: { interval: "month", interval_count: 1 },
      product_data: { name: "Fixture retainer" },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
      metadata: { fixture: "stripe-sandbox.test.ts" },
    });
    subscriptionId = subscription.id;
  }, 60_000);

  afterAll(async () => {
    if (subscriptionId) {
      await stripe.subscriptions.cancel(subscriptionId).catch(() => {});
    }
    if (customerId) {
      await stripe.customers.del(customerId).catch(() => {});
    }
  }, 60_000);

  it("pushes a contact rename onto the Stripe Customer", async () => {
    // The gap this closes: renaming a collector in the app used to leave Stripe
    // billing the old name forever, on receipts she cannot edit.
    const result = await syncStripeCustomer(
      {
        display_name: "Convergence Fixture-Reyes",
        email: "fixture-after@example.com",
        stripe_customer_id: customerId,
      },
      ctx,
    );
    expect(result).toEqual({ data: { synced: true } });

    const remote = await stripe.customers.retrieve(customerId);
    expect(remote.deleted).toBeFalsy();
    if (!remote.deleted) {
      expect(remote.name).toBe("Convergence Fixture-Reyes");
      expect(remote.email).toBe("fixture-after@example.com");
    }
  }, 30_000);

  it("makes no Stripe write when nothing changed", async () => {
    // Second call with the values Stripe now already holds. synced:false proves
    // the diff short-circuited instead of issuing a redundant update.
    const result = await syncStripeCustomer(
      {
        display_name: "Convergence Fixture-Reyes",
        email: "fixture-after@example.com",
        stripe_customer_id: customerId,
      },
      ctx,
    );
    expect(result).toEqual({ data: { synced: false } });
  }, 30_000);

  it("swaps a live subscription onto a new amount and cadence", async () => {
    // $2,500/month -> $3,000/quarter. Asserts against what Stripe reports back,
    // not what we asked for: an accepted-but-ignored field would pass a
    // request-shape test and fail here.
    const result = await updateRetainerSubscription({
      subscriptionId,
      amountCents: 300_000,
      currency: "USD",
      billingInterval: "quarter",
      description: "Fixture retainer — revised",
      ctx,
    });
    expect("error" in result ? result.error : null).toBeNull();
    if ("error" in result) return;

    expect(result.data.status).toBe("active");

    const remote = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    });
    const price = remote.items.data[0]?.price;
    expect(price?.unit_amount).toBe(300_000);
    expect(price?.recurring?.interval).toBe("month");
    expect(price?.recurring?.interval_count).toBe(3);
    // The mirror must point at the price Stripe actually has, or a later webhook
    // rebuild would resurrect the old figure.
    expect(result.data.priceId).toBe(price?.id);
    expect(remote.metadata?.amount_cents).toBe("300000");
    expect(remote.metadata?.interval).toBe("quarter");
  }, 60_000);
});
