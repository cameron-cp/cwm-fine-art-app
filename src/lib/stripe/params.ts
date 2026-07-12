import type Stripe from "stripe";
import type { InvoiceCurrency } from "@/lib/schemas/invoice";
import type { RetainerInterval } from "@/lib/schemas/stripe";

// Pure Stripe request builders — no env, no network, no live client (Stripe is a
// type-only import here). This is what makes the money-integrity assertions
// unit-testable: given an invoice, the exact `unit_amount` and `currency` sent
// to Stripe are computed here and asserted in __tests__/stripe-checkout.test.ts.
//
// Boundary rules enforced in one place:
//  * Currency: stored uppercase ("USD"); Stripe wants lowercase. Lowercased HERE
//    only, never mutating the stored value.
//  * ACH is USD-only (paymentMethodTypesFor).
//  * Amounts are integer minor units → invoice cents pass straight through.

export function paymentMethodTypesFor(
  currency: InvoiceCurrency | string,
): Array<"card" | "us_bank_account"> {
  return currency.toUpperCase() === "USD"
    ? ["card", "us_bank_account"]
    : ["card"];
}

export interface InvoiceCheckoutArgs {
  invoiceId: string;
  invoiceNumber: string; // display, e.g. "CWFA-1001"
  totalCents: number;
  currency: string; // stored casing, e.g. "USD"
  billToEmail: string | null;
  stripeCustomerId: string | null;
  appUrl: string;
}

export function buildInvoiceCheckoutParams(
  args: InvoiceCheckoutArgs,
): Stripe.Checkout.SessionCreateParams {
  const currency = args.currency.toLowerCase();
  // Session metadata is NOT copied onto the PaymentIntent by Stripe, so the same
  // metadata is set on payment_intent_data too — the payment_intent.* handlers
  // key off invoice_id in the early-arrival case.
  const metadata = {
    invoice_id: args.invoiceId,
    expected_amount_cents: String(args.totalCents),
    expected_currency: currency,
  };
  return {
    mode: "payment",
    payment_method_types: paymentMethodTypesFor(args.currency),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: args.totalCents,
          product_data: { name: `Invoice ${args.invoiceNumber}` },
        },
      },
    ],
    invoice_creation: { enabled: true },
    client_reference_id: args.invoiceId,
    metadata,
    payment_intent_data: { metadata },
    ...(args.stripeCustomerId
      ? { customer: args.stripeCustomerId }
      : args.billToEmail
        ? { customer_email: args.billToEmail }
        : {}),
    success_url: `${args.appUrl}/invoices/${args.invoiceId}?paid=1`,
    cancel_url: `${args.appUrl}/invoices/${args.invoiceId}`,
  };
}

export interface SetupCheckoutArgs {
  stripeCustomerId: string;
  currency: string;
  appUrl: string;
  returnPath: string; // e.g. "/contacts/{id}"
}

export function buildSetupCheckoutParams(
  args: SetupCheckoutArgs,
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "setup",
    customer: args.stripeCustomerId,
    payment_method_types: paymentMethodTypesFor(args.currency),
    success_url: `${args.appUrl}${args.returnPath}?pm=1`,
    cancel_url: `${args.appUrl}${args.returnPath}`,
  };
}

export interface RetainerCheckoutArgs {
  stripeCustomerId: string;
  partyId: string;
  amountCents: number;
  currency: string;
  billingInterval: RetainerInterval;
  description: string;
  appUrl: string;
}

export function buildRetainerCheckoutParams(
  args: RetainerCheckoutArgs,
): Stripe.Checkout.SessionCreateParams {
  const currency = args.currency.toLowerCase();
  // The retainers row does not exist at session-creation time; the webhook
  // builds/backfills it from this metadata.
  const metadata = {
    party_id: args.partyId,
    amount_cents: String(args.amountCents),
    interval: args.billingInterval,
    description: args.description,
    currency,
  };
  return {
    mode: "subscription",
    customer: args.stripeCustomerId,
    payment_method_types: paymentMethodTypesFor(args.currency),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: args.amountCents,
          recurring: {
            interval: "month",
            interval_count: args.billingInterval === "quarter" ? 3 : 1,
          },
          product_data: { name: args.description },
        },
      },
    ],
    metadata,
    subscription_data: { metadata },
    success_url: `${args.appUrl}/retainers?created=1`,
    cancel_url: `${args.appUrl}/retainers/new`,
  };
}
