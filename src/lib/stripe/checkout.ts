import { getStripe } from "./client";
import { buildInvoiceCheckoutParams } from "./params";
import type { Invoice } from "@/lib/schemas/invoice";

type Result<T> = { data: T } | { error: string };

type InvoiceForCheckout = Pick<
  Invoice,
  | "id"
  | "invoice_prefix"
  | "invoice_number"
  | "total_cents"
  | "currency"
  | "bill_to_email"
  | "updated_at"
>;

// Create a Checkout Session to pay an invoice by card/ACH. Never throws for an
// expected failure (mirrors the Resend seam) — callers branch on { error }.
export async function createInvoiceCheckoutSession(args: {
  invoice: InvoiceForCheckout;
  stripeCustomerId: string | null;
  appUrl: string;
}): Promise<Result<{ id: string; url: string }>> {
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };

  const { invoice } = args;
  const params = buildInvoiceCheckoutParams({
    invoiceId: invoice.id,
    invoiceNumber: `${invoice.invoice_prefix}${invoice.invoice_number}`,
    totalCents: invoice.total_cents,
    currency: invoice.currency,
    billToEmail: invoice.bill_to_email,
    stripeCustomerId: args.stripeCustomerId,
    appUrl: args.appUrl,
  });

  try {
    const session = await stripe.checkout.sessions.create(params, {
      // Fold total_cents + updated_at into the key so an edit between two
      // "Request payment" clicks mints a fresh session instead of a Stripe 400,
      // while true double-submits still collapse to one session.
      idempotencyKey: `invoice-checkout-${invoice.id}-${invoice.total_cents}-${invoice.updated_at}`,
    });
    if (!session.url) return { error: "Stripe returned no checkout URL." };
    return { data: { id: session.id, url: session.url } };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to create checkout.",
    };
  }
}
