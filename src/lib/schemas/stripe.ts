import { z } from "zod";
import { requiredPriceCents } from "./coercers";
import { invoiceCurrency } from "./invoice";
import type {
  InvoicePaymentStatus,
  PaymentRowStatus,
  RetainerStatusInput,
} from "@/lib/stripe/reconcile";

// Stripe-side domain types + the one operator-facing form (create retainer).

export const retainerIntervals = ["month", "quarter"] as const;
export const retainerInterval = z.enum(retainerIntervals);
export type RetainerInterval = (typeof retainerIntervals)[number];

export type RetainerStatus = RetainerStatusInput;

// Create-retainer form. Amount is entered in dollars in the UI and converted to
// integer cents before it reaches this schema (mirrors the invoice form seam).
// A party is required (Stripe needs a customer) and, separately, the action
// enforces that the party has an email (Stripe receipts).
export const retainerCreateSchema = z.object({
  party_id: z.string().uuid("Choose a contact"),
  amount_cents: requiredPriceCents,
  billing_interval: retainerInterval,
  description: z.string().trim().min(1, "Add a short description"),
  currency: invoiceCurrency.default("USD"),
});

export type RetainerCreateInput = z.output<typeof retainerCreateSchema>;
export type RetainerCreateFormInput = z.input<typeof retainerCreateSchema>;

// DB row shapes -------------------------------------------------------

export type InvoicePayment = {
  id: string;
  invoice_id: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  amount_cents: number | null;
  currency: string | null;
  method: string | null;
  status: PaymentRowStatus;
  created_at: string;
  updated_at: string;
};

export type Retainer = {
  id: string;
  party_id: string;
  stripe_checkout_session_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  description: string | null;
  amount_cents: number | null;
  currency: string;
  billing_interval: RetainerInterval | null;
  status: RetainerStatus;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
};

export type RetainerPayment = {
  id: string;
  retainer_id: string;
  stripe_invoice_id: string | null;
  amount_cents: number | null;
  status: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  created_at: string;
};

// UI presentation for an invoice payment status. Radix Badge colors.
export const INVOICE_PAYMENT_STATUS_META: Record<
  InvoicePaymentStatus,
  { label: string; color: "green" | "amber" | "gray" | "orange" }
> = {
  paid: { label: "Paid", color: "green" },
  processing: { label: "Processing", color: "amber" },
  unpaid: { label: "Unpaid", color: "gray" },
  review: { label: "Review", color: "orange" },
  refunded: { label: "Refunded", color: "gray" },
};
