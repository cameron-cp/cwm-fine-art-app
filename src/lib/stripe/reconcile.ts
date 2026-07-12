// The single source of truth for invoice payment reconciliation.
//
// This is pure, deterministic logic — no Stripe calls, no DB — so it is
// exhaustively unit-tested (see __tests__/stripe-reconcile.test.ts). The webhook
// route resolves the target state HERE and passes it to the apply_stripe_event
// RPC, which only persists it atomically. Keeping the money decision in one
// tested place (rather than in plpgsql) is the deliberate choice behind
// migration 0013.
//
// The rule is SETTLEMENT-FIRST: a payment's amount is only reconciled once funds
// have actually settled (PaymentIntent `succeeded`). ACH debits report
// `processing` for days before settling, and must never stamp an invoice paid
// prematurely.

export type InvoicePaymentStatus =
  | "unpaid"
  | "processing"
  | "paid"
  | "review"
  | "refunded";

export type PaymentRowStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded"
  | "superseded";

// Coarse settlement signal derived from a Stripe PaymentIntent.
export type SettlementSignal = "processing" | "succeeded" | "failed";

// Our normalized retainer (Stripe Subscription) status.
export type RetainerStatusInput =
  | "incomplete"
  | "active"
  | "past_due"
  | "canceled";

// Map a raw Stripe PaymentIntent.status to our coarse signal. Only `succeeded`
// means money is settled; `processing` is in-flight (ACH); everything else
// (requires_payment_method, canceled, requires_action, …) is a non-settlement
// we treat as failed for invoice-state purposes.
export function settlementFromPaymentIntentStatus(
  piStatus: string,
): SettlementSignal {
  switch (piStatus) {
    case "succeeded":
      return "succeeded";
    case "processing":
      return "processing";
    default:
      return "failed";
  }
}

export interface DecideInput {
  signal: SettlementSignal;
  // Amount/currency Stripe actually collected (from the event). Currency is
  // whatever Stripe reports (lowercase, e.g. "usd").
  collectedAmountCents: number | null;
  collectedCurrency: string | null;
  // The CURRENT live invoice total/currency (currency stored uppercase, "USD").
  liveTotalCents: number;
  liveCurrency: string;
}

export interface InvoiceDecision {
  // Target invoice.payment_status BEFORE the terminal-state guard. Refunds are
  // handled by decideRefund, so this never returns 'refunded'.
  invoiceStatus: Exclude<InvoicePaymentStatus, "refunded">;
  paymentRowStatus: PaymentRowStatus;
  amountPaidCents: number;
  // True only when settled AND amount+currency match the live total.
  paid: boolean;
}

// Settlement-first decision. `succeeded` reconciles the collected amount against
// the LIVE total (not the amount expected at checkout-creation time) — so if the
// dealer edits the invoice back to what was actually collected, a later
// reconcile promotes review -> paid.
export function decideInvoiceState(input: DecideInput): InvoiceDecision {
  if (input.signal === "processing") {
    return {
      invoiceStatus: "processing",
      paymentRowStatus: "processing",
      amountPaidCents: 0,
      paid: false,
    };
  }

  if (input.signal === "failed") {
    // A plain decline/cancel is 'unpaid', NOT 'review'. 'review' is reserved for
    // a SETTLED payment whose amount ≠ the live total.
    return {
      invoiceStatus: "unpaid",
      paymentRowStatus: "failed",
      amountPaidCents: 0,
      paid: false,
    };
  }

  // signal === 'succeeded': funds settled → reconcile amount + currency.
  const collected = input.collectedAmountCents ?? 0;
  const amountMatches = collected === input.liveTotalCents;
  const currencyMatches =
    (input.collectedCurrency ?? "").toLowerCase() ===
    input.liveCurrency.toLowerCase();

  if (amountMatches && currencyMatches) {
    return {
      invoiceStatus: "paid",
      paymentRowStatus: "succeeded",
      amountPaidCents: collected,
      paid: true,
    };
  }

  // Settled, but the amount/currency doesn't match the live invoice → never
  // silently paid. Recoverable: a later matching event promotes it.
  return {
    invoiceStatus: "review",
    paymentRowStatus: "succeeded",
    amountPaidCents: collected,
    paid: false,
  };
}

// Terminal-state guard — mirrors the guard in apply_stripe_event (0013). A late
// or duplicate event must never regress a terminal state. 'review' is NOT
// terminal (a later matching succeeded event promotes it to paid). The only move
// out of 'paid' is to 'refunded'. This is what makes out-of-order delivery
// converge to the correct end state.
export function nextInvoiceStatus(
  current: InvoicePaymentStatus,
  incoming: InvoicePaymentStatus,
): InvoicePaymentStatus {
  if (current === "refunded") return "refunded";
  if (current === "paid") return incoming === "refunded" ? "refunded" : "paid";
  return incoming;
}

export interface RefundInput {
  amountRefundedCents: number;
  chargeAmountCents: number;
}

// Only a FULL refund flips the invoice to 'refunded'. A partial refund leaves
// the invoice 'paid' and is recorded on the payment row only.
export function decideRefund(input: RefundInput): { fullyRefunded: boolean } {
  return {
    fullyRefunded:
      input.chargeAmountCents > 0 &&
      input.amountRefundedCents >= input.chargeAmountCents,
  };
}
