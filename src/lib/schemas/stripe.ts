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
  // The person she deals with, when the payer is a company: Detroit Design
  // District pays, Amelia Patt-Zamir is on the thread. Optional — the common
  // retainer is one person paying for themselves. A DB CHECK (0024) enforces
  // that this is not the payer itself.
  attention_party_id: z.string().uuid().nullish(),
  amount_cents: requiredPriceCents,
  billing_interval: retainerInterval,
  description: z.string().trim().min(1, "Add a short description"),
  currency: invoiceCurrency.default("USD"),
});

export type RetainerCreateInput = z.output<typeof retainerCreateSchema>;
export type RetainerCreateFormInput = z.input<typeof retainerCreateSchema>;

// Edit-retainer form. Same money/cadence fields as create, minus party_id: a
// retainer's subscriber is fixed once the Stripe subscription exists (moving one
// to another collector is a cancel + restart, not an edit), so re-submitting a
// party here could only ever contradict the row.
export const retainerUpdateSchema = retainerCreateSchema.omit({
  party_id: true,
  // The attention contact IS editable, but through its own action: changing it
  // is a local-only correction that must never mint a Stripe price, and
  // planRetainerEdit's three-way decision is about money, not about who to
  // email. Folding it in here would make a name fix look like a price change.
  attention_party_id: true,
});

export type RetainerUpdateInput = z.output<typeof retainerUpdateSchema>;
export type RetainerUpdateFormInput = z.input<typeof retainerUpdateSchema>;

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
  attention_party_id: string | null;
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
