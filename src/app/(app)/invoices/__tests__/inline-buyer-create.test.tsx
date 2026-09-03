// @vitest-environment jsdom

// The retainer form was the reported case, but the invoice form had the same
// dead end: no buyer in the list meant backing out to /contacts and losing every
// line item already entered. These pin that the inline path works here too,
// including the Radix item-registration race that silently dropped the selection
// (see the flushSync comment in invoice-form.tsx).
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back, replace: vi.fn(), refresh: vi.fn() }),
}));

const DDD_ID = "11111111-1111-4111-8111-111111111111";

const createParty = vi.fn(async (values: { display_name: string }) => ({
  data: { id: DDD_ID, display_name: values.display_name },
}));

vi.mock("@/app/(app)/contacts/actions", () => ({
  createParty: (values: { display_name: string }) => createParty(values),
  updateParty: vi.fn(),
  deleteParty: vi.fn(),
  addPaymentMethod: vi.fn(),
  openBillingPortal: vi.fn(),
  connectStripeCustomer: vi.fn(),
  createRelationship: vi.fn(),
  updateRelationship: vi.fn(),
  deleteRelationship: vi.fn(),
}));

vi.mock("../actions", () => ({
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
}));

const { InvoiceForm } = await import("../invoice-form");

beforeEach(() => {
  push.mockClear();
  back.mockClear();
  createParty.mockClear();
});

afterEach(cleanup);

describe("creating a buyer from the invoice form", () => {
  it("selects the new contact and prefills bill-to without navigating", async () => {
    render(
      <Theme>
        <InvoiceForm artworks={[]} parties={[]} />
      </Theme>,
    );

    await userEvent.click(screen.getByRole("button", { name: /New contact/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByPlaceholderText(/Howard Rachofsky/),
      "Detroit Design District",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /Create contact/ }),
    );

    await waitFor(() => expect(createParty).toHaveBeenCalled());
    // No route change — the invoice in progress is untouched.
    expect(push).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();

    // The selection landed (the race the flushSync guards against) …
    await waitFor(() =>
      expect(screen.getByLabelText("Buyer contact").textContent).toContain(
        "Detroit Design District",
      ),
    );
    // … and choosing a buyer prefills the bill-to snapshot, as picking an
    // existing contact does.
    await waitFor(() =>
      expect(
        (
          screen.getByPlaceholderText(
            /Full legal name or entity/,
          ) as HTMLInputElement
        ).value,
      ).toBe("Detroit Design District"),
    );
  });
});
