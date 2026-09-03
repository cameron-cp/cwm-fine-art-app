import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getStripe } from "@/lib/stripe/client";
import { PLATFORM_CONTEXT } from "@/lib/stripe/context";
import { syncStripeCustomer } from "@/lib/stripe/customers";
import { buildCustomerCreateParams } from "@/lib/stripe/params";
import { resolveReceiptEmail } from "@/lib/stripe/receipt-email";
import { updateRetainerSubscription } from "@/lib/stripe/subscriptions";
import { readString, subscriptionFacts } from "@/lib/stripe/stripe-fields";

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
  let companyCustomerId = "";

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
    if (companyCustomerId) {
      await stripe.customers.del(companyCustomerId).catch(() => {});
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

  it("bills a company payer at the attention contact's address", async () => {
    // The dealer's case: Detroit Design District has no inbox, Amelia does.
    // Asserted against what Stripe stores, because this is the pairing that
    // decides whether a company's receipts arrive at all.
    const receipt = resolveReceiptEmail(
      { email: null },
      { email: "amelia-fixture@example.com" },
    );
    expect(receipt).toEqual({
      email: "amelia-fixture@example.com",
      source: "attention",
    });

    const company = await stripe.customers.create(
      buildCustomerCreateParams({
        partyId: "33333333-3333-4333-8333-333333333333",
        displayName: "Detroit Design District",
        email: receipt!.email,
      }),
    );
    companyCustomerId = company.id;

    const remote = await stripe.customers.retrieve(company.id);
    expect(remote.deleted).toBeFalsy();
    if (!remote.deleted) {
      expect(remote.name).toBe("Detroit Design District");
      expect(remote.email).toBe("amelia-fixture@example.com");
      expect(remote.metadata?.party_id).toBe(
        "33333333-3333-4333-8333-333333333333",
      );
    }

    // And a later edit of the company contact — which still has no email —
    // must not blank Amelia's address back off it.
    const synced = await syncStripeCustomer(
      {
        display_name: "Detroit Design District",
        email: null,
        stripe_customer_id: company.id,
      },
      ctx,
    );
    expect(synced).toEqual({ data: { synced: false } });
    const after = await stripe.customers.retrieve(company.id);
    if (!after.deleted) {
      expect(after.email).toBe("amelia-fixture@example.com");
    }
  }, 60_000);

  it("still finds the version-sensitive fields the webhook depends on", async () => {
    // These are the two reads that have MOVED between Stripe API versions, and
    // the reason client.ts pins the account's version rather than the SDK
    // default: a mismatch means the SDK types describe one shape while the
    // endpoint receives another.
    //
    //   * current_period_end migrated from the subscription to its items.
    //   * an invoice's subscription link migrated to parent.subscription_details.
    //
    // stripe-fields.ts navigates both defensively, but "defensively" is only
    // worth anything if something proves the field is actually found — a null
    // here would silently store "next charge: —" on every retainer.
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    });
    const facts = subscriptionFacts(sub);
    expect(facts.currentPeriodEnd).not.toBeNull();
    expect(Date.parse(facts.currentPeriodEnd!)).toBeGreaterThan(Date.now());

    // The subscription's first invoice, read the way the webhook reads it.
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 1,
    });
    const inv = invoices.data[0];
    expect(inv).toBeDefined();
    const linkedSubId =
      readString(inv, "subscription") ??
      readString(
        (inv as { parent?: { subscription_details?: unknown } }).parent
          ?.subscription_details,
        "subscription",
      );
    expect(linkedSubId).toBe(subscriptionId);
  }, 60_000);

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
