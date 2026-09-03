// @vitest-environment jsdom

// Whether a collector is wired up to Stripe used to be invisible: a customer
// came into being only as a side effect of saving a card or starting a retainer,
// and the panel's only tell was whether a "Manage methods" button happened to
// render. A dealer about to invoice someone needs to know before she tries.
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const connectStripeCustomer = vi.fn<(id: string) => Promise<unknown>>(
  async () => ({ data: { stripeCustomerId: "cus_new123" } }),
);

vi.mock("@/app/(app)/contacts/actions", () => ({
  addPaymentMethod: vi.fn(async () => ({ data: { url: "https://stripe.test/setup" } })),
  openBillingPortal: vi.fn(async () => ({ data: { url: "https://stripe.test/portal" } })),
  connectStripeCustomer: (id: string) => connectStripeCustomer(id),
}));

const { ContactPaymentMethods } = await import(
  "@/components/contact-payment-methods"
);

const PARTY_ID = "11111111-1111-1111-1111-111111111111";

afterEach(() => {
  cleanup();
  connectStripeCustomer.mockClear();
});

describe("ContactPaymentMethods — connection state", () => {
  it("shows the customer id and a dashboard link when connected", () => {
    render(
      <Theme>
        <ContactPaymentMethods
          id={PARTY_ID}
          hasCustomer
          stripeCustomerId="cus_abc123"
          dashboardUrl="https://dashboard.stripe.com/test/customers/cus_abc123"
        />
      </Theme>,
    );
    expect(screen.getByText("Connected to Stripe")).toBeTruthy();
    const link = screen.getByRole("link", { name: /cus_abc123/ });
    // The /test/ segment matters: without it the link 404s for every sandbox
    // object, which is the only mode this app has run in.
    expect(link.getAttribute("href")).toBe(
      "https://dashboard.stripe.com/test/customers/cus_abc123",
    );
  });

  it("offers a Connect action when the contact has no customer", async () => {
    // The gap: previously there was no way to create the Stripe customer except
    // by starting a payment flow she may not be ready to start.
    render(
      <Theme>
        <ContactPaymentMethods
          id={PARTY_ID}
          hasCustomer={false}
          stripeCustomerId={null}
          dashboardUrl={null}
        />
      </Theme>,
    );
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Manage methods/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Connect to Stripe/ }));
    expect(connectStripeCustomer).toHaveBeenCalledWith(PARTY_ID);
    expect(await screen.findByText(/cus_new123/)).toBeTruthy();
  });

  it("hides Manage methods until a customer exists", () => {
    // billingPortal.sessions.create errors without a customer, so offering the
    // button before one exists would only ever produce a Stripe error.
    render(
      <Theme>
        <ContactPaymentMethods
          id={PARTY_ID}
          hasCustomer
          stripeCustomerId="cus_abc123"
          dashboardUrl="https://dashboard.stripe.com/test/customers/cus_abc123"
        />
      </Theme>,
    );
    expect(screen.getByRole("button", { name: /Manage methods/ })).toBeTruthy();
  });
});
