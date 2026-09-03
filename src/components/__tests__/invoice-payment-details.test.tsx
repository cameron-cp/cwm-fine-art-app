// @vitest-environment jsdom

// "Was this invoice paid, and when?" was unanswerable in the app: the header
// badge said `paid` and nothing said when, for how much, or by what means, even
// though invoice_payments had held every attempt since migration 0013. These
// assert the panel actually surfaces that, including the case the badge cannot
// express on its own — money arrived, but not the amount owed.
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InvoicePaymentDetails } from "@/components/invoice-payment-details";
import type { InvoicePayment } from "@/lib/schemas/stripe";

afterEach(cleanup);

function payment(overrides: Partial<InvoicePayment> = {}): InvoicePayment {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    invoice_id: "22222222-2222-2222-2222-222222222222",
    stripe_checkout_session_id: "cs_test_1",
    stripe_payment_intent_id: "pi_test_1",
    amount_cents: 1_295_125,
    currency: "USD",
    method: "card",
    status: "succeeded",
    created_at: "2026-08-14T15:42:09.000Z",
    updated_at: "2026-08-14T15:42:09.000Z",
    ...overrides,
  };
}

function renderPanel(props: Partial<Parameters<typeof InvoicePaymentDetails>[0]> = {}) {
  return render(
    <Theme>
      <InvoicePaymentDetails
        status="paid"
        paidAt="2026-08-14T15:42:09.000Z"
        amountPaidCents={1_295_125}
        totalCents={1_295_125}
        currency="USD"
        payments={[payment()]}
        {...props}
      />
    </Theme>,
  );
}

describe("InvoicePaymentDetails", () => {
  it("states the amount collected and the settlement date", () => {
    // The date is the answer to "when" — a status badge alone can never give it,
    // and she needs it to reconcile against her bank.
    renderPanel();
    expect(screen.getByText(/Paid/)).toBeTruthy();
    // Twice on purpose: once in the summary line, once in the attempt row.
    expect(screen.getAllByText(/\$12,951\.25/)).toHaveLength(2);
    expect(screen.getAllByText(/2026-08-14 15:42/).length).toBeGreaterThan(0);
  });

  it("names the shortfall when less arrived than the invoice asks", () => {
    // This is exactly what payment_status 'review' means, and the badge can only
    // say the word "Review". A dealer chasing a $500 gap should not have to
    // subtract two numbers herself.
    renderPanel({
      status: "review",
      amountPaidCents: 1_245_125,
      totalCents: 1_295_125,
      payments: [payment({ amount_cents: 1_245_125 })],
    });
    expect(screen.getByText(/Short by/)).toBeTruthy();
    expect(screen.getByText(/\$500\.00/)).toBeTruthy();
  });

  it("shows a failed attempt alongside the successful one", () => {
    // A declined card followed by a bank transfer used to look identical to a
    // single clean payment. Both rows must be visible, with their methods.
    renderPanel({
      payments: [
        payment({
          id: "33333333-3333-3333-3333-333333333333",
          method: "us_bank_account",
          status: "succeeded",
        }),
        payment({
          id: "44444444-4444-4444-4444-444444444444",
          method: "card",
          status: "failed",
          created_at: "2026-08-13T09:01:00.000Z",
        }),
      ],
    });
    expect(screen.getByText("Bank (ACH)")).toBeTruthy();
    expect(screen.getByText("Card")).toBeTruthy();
    expect(screen.getByText("failed")).toBeTruthy();
    expect(screen.getByText("succeeded")).toBeTruthy();
  });

  it("says nothing was collected rather than showing a zero", () => {
    // An unpaid invoice showing "Paid $0.00 on —" would read as a bug and, worse,
    // could be misread as settled.
    renderPanel({
      status: "unpaid",
      paidAt: null,
      amountPaidCents: 0,
      payments: [],
    });
    expect(screen.getByText(/Nothing collected yet/)).toBeTruthy();
    expect(screen.queryByText(/\$0\.00/)).toBeNull();
  });

  it("renders money in the tabular mono class the design system requires", () => {
    // Prices are ALWAYS tabular mono (.num) so columns of figures line up —
    // binding rule in docs/design/design-system.md.
    const { container } = renderPanel();
    const nums = container.querySelectorAll(".num");
    expect(nums.length).toBeGreaterThan(0);
    expect(
      Array.from(nums).some((n) => n.textContent?.includes("$12,951.25")),
    ).toBe(true);
  });
});
