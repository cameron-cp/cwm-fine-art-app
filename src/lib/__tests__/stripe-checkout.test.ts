import { describe, expect, it } from "vitest";
import {
  buildInvoiceCheckoutParams,
  buildRetainerCheckoutParams,
  paymentMethodTypesFor,
} from "@/lib/stripe/params";

// Money-integrity boundary: what the app tells Stripe to charge must equal the
// invoice total to the cent, with no float rounding and no currency mangling.

describe("buildInvoiceCheckoutParams — money integrity", () => {
  const base = {
    invoiceId: "11111111-1111-1111-1111-111111111111",
    invoiceNumber: "CWFA-1001",
    billToEmail: "collector@example.com",
    stripeCustomerId: null,
    appUrl: "https://app.example.com",
  };

  it("charges exactly total_cents — integer minor units, no rounding", () => {
    // $12,951.25 invoice → Stripe unit_amount must be 1295125, not 1295125.0001
    // or a re-rounded value.
    const params = buildInvoiceCheckoutParams({
      ...base,
      totalCents: 1_295_125,
      currency: "USD",
    });
    const item = params.line_items?.[0];
    expect(item?.price_data?.unit_amount).toBe(1_295_125);
    expect(Number.isInteger(item?.price_data?.unit_amount)).toBe(true);
    expect(item?.quantity).toBe(1);
  });

  it("lowercases the currency for Stripe without touching stored casing", () => {
    const params = buildInvoiceCheckoutParams({
      ...base,
      totalCents: 100,
      currency: "USD",
    });
    expect(params.line_items?.[0]?.price_data?.currency).toBe("usd");
  });

  it("propagates invoice_id in BOTH session and PaymentIntent metadata", () => {
    // Stripe does not copy session metadata onto the PI, so the payment_intent.*
    // handlers would have no invoice_id to key off without this duplication.
    const params = buildInvoiceCheckoutParams({
      ...base,
      totalCents: 100,
      currency: "USD",
    });
    expect(params.metadata?.invoice_id).toBe(base.invoiceId);
    expect(params.payment_intent_data?.metadata?.invoice_id).toBe(base.invoiceId);
    expect(params.metadata?.expected_amount_cents).toBe("100");
  });

  it("uses customer id when present, else falls back to bill-to email", () => {
    const withCustomer = buildInvoiceCheckoutParams({
      ...base,
      totalCents: 100,
      currency: "USD",
      stripeCustomerId: "cus_123",
    });
    expect(withCustomer.customer).toBe("cus_123");
    expect(withCustomer.customer_email).toBeUndefined();

    const withEmail = buildInvoiceCheckoutParams({
      ...base,
      totalCents: 100,
      currency: "USD",
      stripeCustomerId: null,
    });
    expect(withEmail.customer_email).toBe("collector@example.com");
  });
});

describe("paymentMethodTypesFor — ACH is USD-only", () => {
  it("offers card + ACH for USD", () => {
    expect(paymentMethodTypesFor("USD")).toEqual(["card", "us_bank_account"]);
  });
  it("offers card only for non-USD (ACH would error at Checkout otherwise)", () => {
    expect(paymentMethodTypesFor("GBP")).toEqual(["card"]);
    expect(paymentMethodTypesFor("EUR")).toEqual(["card"]);
  });
});

describe("buildRetainerCheckoutParams — cadence + amount", () => {
  const base = {
    stripeCustomerId: "cus_123",
    partyId: "22222222-2222-2222-2222-222222222222",
    amountCents: 250_000,
    currency: "USD",
    description: "Monthly advisory retainer",
    appUrl: "https://app.example.com",
  };

  it("maps 'quarter' to a 3-month recurring interval", () => {
    const params = buildRetainerCheckoutParams({ ...base, billingInterval: "quarter" });
    const recurring = params.line_items?.[0]?.price_data?.recurring;
    expect(recurring?.interval).toBe("month");
    expect(recurring?.interval_count).toBe(3);
  });

  it("maps 'month' to a 1-month interval and charges the exact amount", () => {
    const params = buildRetainerCheckoutParams({ ...base, billingInterval: "month" });
    expect(params.line_items?.[0]?.price_data?.recurring?.interval_count).toBe(1);
    expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(250_000);
  });

  it("carries retainer metadata on the subscription for the webhook to build the row", () => {
    const params = buildRetainerCheckoutParams({ ...base, billingInterval: "month" });
    expect(params.subscription_data?.metadata?.party_id).toBe(base.partyId);
    expect(params.subscription_data?.metadata?.amount_cents).toBe("250000");
  });
});
