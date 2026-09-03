import { describe, expect, it } from "vitest";
import {
  buildDashboardUrl,
  buildRetainerCheckoutParams,
  buildRetainerPriceParams,
  diffCustomerFields,
  recurringFor,
} from "@/lib/stripe/params";
import { planRetainerEdit } from "@/lib/stripe/retainer-edit";

// Editing a retainer touches live money on somebody else's card, and editing a
// contact can rewrite the identity Stripe bills. These lock the decisions that
// would be expensive to get wrong and silent when they are.

describe("planRetainerEdit", () => {
  const live = {
    stripe_subscription_id: "sub_123",
    amount_cents: 250_000,
    billing_interval: "month" as const,
    description: "Advisory retainer",
  };

  it("does nothing when nothing changed", () => {
    // Re-saving an untouched form must not mint a Stripe price or rewrite the
    // subscription. Prices are immutable and permanent: a stray save on every
    // page visit would litter the account with identical prices and re-stamp the
    // subscription for no reason.
    const plan = planRetainerEdit(live, {
      amount_cents: 250_000,
      billing_interval: "month",
      description: "Advisory retainer",
    });
    expect(plan.mode).toBe("noop");
    expect(plan.changed).toEqual([]);
  });

  it("goes to Stripe when the amount changes on a live subscription", () => {
    const plan = planRetainerEdit(live, {
      amount_cents: 300_000,
      billing_interval: "month",
      description: "Advisory retainer",
    });
    expect(plan.mode).toBe("stripe");
    expect(plan.changed).toEqual(["amount_cents"]);
  });

  it("goes to Stripe for a description-only change", () => {
    // The description IS the product name on the collector's next Stripe
    // invoice. Treating it as cosmetic (local-only) would leave her records and
    // their receipt disagreeing about what they are paying for.
    const plan = planRetainerEdit(live, {
      amount_cents: 250_000,
      billing_interval: "month",
      description: "Advisory retainer — 2026 season",
    });
    expect(plan.mode).toBe("stripe");
    expect(plan.changed).toEqual(["description"]);
  });

  it("stays local when the collector never completed checkout", () => {
    // No subscription exists at Stripe yet, so there is nothing to swap a price
    // onto. Calling Stripe here would fail on a null subscription id; correcting
    // the stub row is the whole job.
    const plan = planRetainerEdit(
      { ...live, stripe_subscription_id: null },
      {
        amount_cents: 300_000,
        billing_interval: "quarter",
        description: "Advisory retainer",
      },
    );
    expect(plan.mode).toBe("local");
    expect(plan.changed).toEqual(["amount_cents", "billing_interval"]);
  });

  it("treats a null description and an empty string as the same", () => {
    // A retainer created without a description holds null; the form submits "".
    // Reporting that as a change would push a pointless price swap on first save.
    const plan = planRetainerEdit(
      { ...live, description: null },
      { amount_cents: 250_000, billing_interval: "month", description: "" },
    );
    expect(plan.mode).toBe("noop");
  });
});

describe("recurringFor / buildRetainerPriceParams — cadence", () => {
  it("bills a quarter as month x 3, not a 3-month interval", () => {
    // Stripe has no "quarter" interval. Getting interval_count wrong here means
    // charging a quarterly collector every month — 3x their agreed rate.
    expect(recurringFor("quarter")).toEqual({
      interval: "month",
      interval_count: 3,
    });
    expect(recurringFor("month")).toEqual({
      interval: "month",
      interval_count: 1,
    });
  });

  it("prices an edit exactly as the original checkout would have", () => {
    // Two code paths now build a retainer price: the initial Checkout session
    // and an edit's price swap. If they ever disagree about a cadence, editing a
    // quarterly retainer would silently convert it to monthly. Both read
    // recurringFor, and this asserts they still agree.
    const args = {
      amountCents: 250_000,
      currency: "USD",
      billingInterval: "quarter" as const,
      description: "Advisory retainer",
    };
    const price = buildRetainerPriceParams(args);
    const checkout = buildRetainerCheckoutParams({
      ...args,
      stripeCustomerId: "cus_1",
      partyId: "11111111-1111-1111-1111-111111111111",
      appUrl: "https://app.example.com",
    });
    const checkoutPrice = checkout.line_items?.[0]?.price_data;

    expect(price.recurring).toEqual(checkoutPrice?.recurring);
    expect(price.unit_amount).toBe(checkoutPrice?.unit_amount);
    expect(price.currency).toBe(checkoutPrice?.currency);
  });

  it("lowercases the currency and passes cents through exactly", () => {
    const price = buildRetainerPriceParams({
      amountCents: 129_512,
      currency: "USD",
      billingInterval: "month",
      description: "Retainer",
    });
    expect(price.currency).toBe("usd");
    expect(price.unit_amount).toBe(129_512);
    expect(price.product_data?.name).toBe("Retainer");
  });
});

describe("diffCustomerFields", () => {
  it("returns null when the app and Stripe already agree", () => {
    // Saving a contact whose name/email did not change must make zero Stripe
    // requests — otherwise every unrelated edit (a phone number, a note) bills
    // a round trip and can fail a save for no reason.
    expect(
      diffCustomerFields(
        { name: "Jane Collector", email: "jane@example.com" },
        { name: "Jane Collector", email: "jane@example.com" },
      ),
    ).toBeNull();
  });

  it("sends only the field that changed", () => {
    expect(
      diffCustomerFields(
        { name: "Jane Collector-Reyes", email: "jane@example.com" },
        { name: "Jane Collector", email: "jane@example.com" },
      ),
    ).toEqual({ name: "Jane Collector-Reyes" });
  });

  it("never blanks a Stripe email the app does not have", () => {
    // Absent is not cleared. The collector may have given Stripe an address at
    // Checkout that she never typed into the app; blanking it would kill receipt
    // delivery for a live retainer — the one field a subscription cannot lose.
    expect(
      diffCustomerFields(
        { name: "Jane Collector", email: null },
        { name: "Jane Collector", email: "jane@example.com" },
      ),
    ).toBeNull();
  });

  it("never blanks a Stripe name either", () => {
    expect(
      diffCustomerFields(
        { name: "", email: "jane@example.com" },
        { name: "Jane Collector", email: "jane@example.com" },
      ),
    ).toBeNull();
  });
});

describe("buildDashboardUrl", () => {
  it("routes test-mode objects through /test/", () => {
    // A dashboard link built without the mode segment 404s for every sandbox and
    // test-mode object, which is the only mode this app has run in so far.
    expect(buildDashboardUrl("customers", "cus_1", false)).toBe(
      "https://dashboard.stripe.com/test/customers/cus_1",
    );
    expect(buildDashboardUrl("subscriptions", "sub_1", true)).toBe(
      "https://dashboard.stripe.com/subscriptions/sub_1",
    );
  });
});
