// @vitest-environment jsdom

// The dealer's report, verbatim: "if the contact doesn't exist, this is a bad
// UX. you have to back all the way out to contacts and create a new one." Her
// case is Detroit Design District — a company that isn't in the system yet,
// paying for work she does with Amelia Patt-Zamir.
//
// These pin the invariant that makes the inline path worth having: creating the
// contact must not navigate, and the amount and description she already typed
// must survive it.
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
const AMELIA_ID = "22222222-2222-4222-8222-222222222222";

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

const createRetainer = vi.fn<(input: unknown) => Promise<unknown>>(async () => ({
  data: { url: "https://checkout.stripe.test/session" },
}));

vi.mock("../actions", () => ({
  createRetainer: (input: unknown) => createRetainer(input),
  updateRetainer: vi.fn(),
  cancelRetainer: vi.fn(),
  reconcileRetainer: vi.fn(),
  setRetainerAttention: vi.fn(),
}));

const { RetainerForm } = await import("../retainer-form");

const AMELIA = {
  id: AMELIA_ID,
  display_name: "Amelia Patt-Zamir",
  email: "amelia@example.com",
};

beforeEach(() => {
  push.mockClear();
  back.mockClear();
  createParty.mockClear();
  createRetainer.mockClear();
});

afterEach(cleanup);

function renderForm() {
  return render(
    <Theme>
      <RetainerForm parties={[AMELIA]} />
    </Theme>,
  );
}

describe("creating a contact from the retainer form", () => {
  it("does not navigate away, and keeps what was already typed", async () => {
    renderForm();

    // She starts the retainer first, then realizes the payer isn't in the system.
    const amount = screen.getByPlaceholderText("2500.00");
    await userEvent.type(amount, "2500");
    const description = screen.getByPlaceholderText("Advisory retainer");
    await userEvent.type(description, "Detroit advisory");

    await userEvent.click(screen.getAllByRole("button", { name: /New contact/ })[0]);

    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByPlaceholderText(/Howard Rachofsky/),
      "Detroit Design District",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /Create contact/ }),
    );

    await waitFor(() => expect(createParty).toHaveBeenCalled());
    // The whole point: no route change, so the half-entered retainer survives.
    expect(push).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    expect((amount as HTMLInputElement).value).toBe("2500");
    expect((description as HTMLTextAreaElement).value).toBe("Detroit advisory");
  });

  it("selects the new contact as the payer, so the retainer can be submitted", async () => {
    renderForm();
    await userEvent.type(screen.getByPlaceholderText("2500.00"), "2500");
    await userEvent.type(
      screen.getByPlaceholderText("Advisory retainer"),
      "Detroit advisory",
    );

    await userEvent.click(screen.getAllByRole("button", { name: /New contact/ })[0]);
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByPlaceholderText(/Howard Rachofsky/),
      "Detroit Design District",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /Create contact/ }),
    );
    await waitFor(() => expect(createParty).toHaveBeenCalled());

    // Direct evidence the selection landed. This is the assertion that caught
    // the real bug: setting the Select's value in the same commit that first
    // rendered its item lost a race with Radix's item registration, and the
    // field silently fell back to "Select payer…".
    await waitFor(() =>
      expect(screen.getByLabelText("Who pays").textContent).toContain(
        "Detroit Design District",
      ),
    );

    // Detroit has no email, so submitting must be blocked with the actionable
    // sentence rather than a Stripe error later — until an attention contact
    // with an inbox is named.
    await userEvent.click(
      screen.getByRole("button", { name: /Start retainer/ }),
    );
    expect(createRetainer).not.toHaveBeenCalled();
    expect(screen.getByText(/Stripe needs an email for receipts/)).toBeTruthy();
  });

  it("charges the company with Amelia as the attention contact", async () => {
    // The dealer's actual case, end to end: Detroit Design District pays, Amelia
    // is on the thread, and her email is what makes the retainer chargeable at
    // all — the company has none.
    renderForm();
    await userEvent.type(screen.getByPlaceholderText("2500.00"), "2500");
    await userEvent.type(
      screen.getByPlaceholderText("Advisory retainer"),
      "Detroit advisory",
    );

    await userEvent.click(screen.getAllByRole("button", { name: /New contact/ })[0]);
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByPlaceholderText(/Howard Rachofsky/),
      "Detroit Design District",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /Create contact/ }),
    );
    await waitFor(() => expect(createParty).toHaveBeenCalled());

    // Name Amelia as the attention contact.
    await userEvent.click(screen.getByLabelText("Attention contact"));
    await userEvent.click(
      await screen.findByRole("option", { name: /Amelia Patt-Zamir/ }),
    );

    await userEvent.click(screen.getByRole("button", { name: /Start retainer/ }));

    await waitFor(() => expect(createRetainer).toHaveBeenCalled());
    expect(createRetainer).toHaveBeenCalledWith({
      party_id: DDD_ID,
      attention_party_id: AMELIA_ID,
      amount_cents: 250_000,
      billing_interval: "month",
      description: "Detroit advisory",
      currency: "USD",
    });
  });

  it("keeps the payer out of the attention list", async () => {
    // The DB CHECK (0024) rejects payer == attention; the picker must not offer
    // the choice in the first place, or she'd hit a constraint error.
    renderForm();
    await userEvent.click(screen.getByLabelText("Who pays"));
    await userEvent.click(
      await screen.findByRole("option", { name: /Amelia Patt-Zamir/ }),
    );

    await userEvent.click(screen.getByLabelText("Attention contact"));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).not.toContain(
      "Amelia Patt-Zamir",
    );
  });
});
