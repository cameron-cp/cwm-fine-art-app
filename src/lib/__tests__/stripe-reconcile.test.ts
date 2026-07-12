import { describe, expect, it } from "vitest";
import {
  decideInvoiceState,
  decideRefund,
  nextInvoiceStatus,
  settlementFromPaymentIntentStatus,
  type InvoicePaymentStatus,
} from "@/lib/stripe/reconcile";

// These encode the money + settlement invariants of Stripe reconciliation. They
// are the real logic the webhook and reconcile actions run — the RPC only
// persists what decideInvoiceState returns.

describe("settlementFromPaymentIntentStatus", () => {
  it("treats only 'succeeded' as settled and 'processing' as in-flight", () => {
    // Business rule: ACH reports 'processing' for days before funds settle. If
    // we mapped anything but 'succeeded' to settled we'd stamp invoices paid
    // before the money exists.
    expect(settlementFromPaymentIntentStatus("succeeded")).toBe("succeeded");
    expect(settlementFromPaymentIntentStatus("processing")).toBe("processing");
    expect(settlementFromPaymentIntentStatus("requires_payment_method")).toBe("failed");
    expect(settlementFromPaymentIntentStatus("canceled")).toBe("failed");
  });
});

describe("decideInvoiceState — settlement-first + amount reconciliation", () => {
  const live = { liveTotalCents: 500_000, liveCurrency: "USD" };

  it("marks PAID only when settled AND amount+currency match the live total", () => {
    // The exact-cent match is the whole point: a collector paying $5,000.00 to
    // the cent on a $5,000.00 invoice is paid.
    const d = decideInvoiceState({
      signal: "succeeded",
      collectedAmountCents: 500_000,
      collectedCurrency: "usd",
      ...live,
    });
    expect(d.invoiceStatus).toBe("paid");
    expect(d.paid).toBe(true);
    expect(d.amountPaidCents).toBe(500_000);
  });

  it("routes a settled-but-short payment to REVIEW, never silently paid", () => {
    // One cent short must NOT read as paid on a legal document.
    const d = decideInvoiceState({
      signal: "succeeded",
      collectedAmountCents: 499_999,
      collectedCurrency: "usd",
      ...live,
    });
    expect(d.invoiceStatus).toBe("review");
    expect(d.paid).toBe(false);
    // Amount actually collected is still recorded (for the dealer to see).
    expect(d.amountPaidCents).toBe(499_999);
  });

  it("routes a currency mismatch to REVIEW even when the number matches", () => {
    // 500000 "eur" collected against a 500000 "USD" invoice is not payment in
    // full — different currency entirely.
    const d = decideInvoiceState({
      signal: "succeeded",
      collectedAmountCents: 500_000,
      collectedCurrency: "eur",
      ...live,
    });
    expect(d.invoiceStatus).toBe("review");
  });

  it("holds an in-flight ACH debit at PROCESSING without evaluating amount", () => {
    const d = decideInvoiceState({
      signal: "processing",
      collectedAmountCents: 500_000,
      collectedCurrency: "usd",
      ...live,
    });
    expect(d.invoiceStatus).toBe("processing");
    expect(d.paid).toBe(false);
    expect(d.amountPaidCents).toBe(0); // nothing settled yet
  });

  it("returns a failed payment to UNPAID (a decline is not 'review')", () => {
    // 'review' is reserved for a SETTLED payment whose amount ≠ the live total.
    const d = decideInvoiceState({
      signal: "failed",
      collectedAmountCents: null,
      collectedCurrency: null,
      ...live,
    });
    expect(d.invoiceStatus).toBe("unpaid");
    expect(d.paymentRowStatus).toBe("failed");
  });
});

describe("nextInvoiceStatus — terminal-state guard (out-of-order convergence)", () => {
  it("never regresses a paid invoice on a late/duplicate non-refund event", () => {
    // A duplicate 'processing' arriving after 'paid' must not un-pay it.
    expect(nextInvoiceStatus("paid", "processing")).toBe("paid");
    expect(nextInvoiceStatus("paid", "unpaid")).toBe("paid");
    expect(nextInvoiceStatus("paid", "paid")).toBe("paid");
  });

  it("allows the one legal transition out of paid: paid -> refunded", () => {
    expect(nextInvoiceStatus("paid", "refunded")).toBe("refunded");
  });

  it("keeps refunded terminal", () => {
    expect(nextInvoiceStatus("refunded", "paid")).toBe("refunded");
    expect(nextInvoiceStatus("refunded", "processing")).toBe("refunded");
  });

  it("treats review as NON-terminal — a later match promotes it to paid", () => {
    expect(nextInvoiceStatus("review", "paid")).toBe("paid");
  });

  it("converges to paid regardless of event ORDER (the ACH ordering case)", () => {
    // Fold the two possible deliveries of {processing-then-succeeded} in each
    // order through the guard; both must end at 'paid'.
    const succeeded: InvoicePaymentStatus = "paid";
    const processing: InvoicePaymentStatus = "processing";
    const start: InvoicePaymentStatus = "unpaid";

    // Normal order: processing then succeeded.
    let s = nextInvoiceStatus(start, processing);
    s = nextInvoiceStatus(s, succeeded);
    expect(s).toBe("paid");

    // Reversed (payment_intent.succeeded delivered before session.completed):
    let r = nextInvoiceStatus(start, succeeded);
    r = nextInvoiceStatus(r, processing);
    expect(r).toBe("paid");
  });
});

describe("decideRefund — full vs partial", () => {
  it("flips to refunded only on a FULL refund", () => {
    expect(decideRefund({ amountRefundedCents: 500_000, chargeAmountCents: 500_000 }).fullyRefunded).toBe(true);
  });
  it("leaves a partial refund as not-fully-refunded (invoice stays paid)", () => {
    expect(decideRefund({ amountRefundedCents: 100_000, chargeAmountCents: 500_000 }).fullyRefunded).toBe(false);
  });
  it("does not treat a zero-amount charge as fully refunded", () => {
    expect(decideRefund({ amountRefundedCents: 0, chargeAmountCents: 0 }).fullyRefunded).toBe(false);
  });
});
