// @vitest-environment jsdom

// Editing a retainer changes a recurring charge on somebody else's card. Two
// things have to hold: the form must prefill from the stored row (so a save that
// only touches the description cannot silently reset the amount), and it must
// say out loud that a new figure lands on the NEXT charge — the app uses
// proration_behavior: "none", so no catch-up charge and no credit.
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const updateRetainer = vi.fn<(id: string, values: unknown) => Promise<unknown>>(
  async () => ({ data: { id: RETAINER_ID, mode: "stripe" } }),
);
const createRetainer = vi.fn(async () => ({ data: { url: "https://stripe.test/co" } }));

vi.mock("../actions", () => ({
  createRetainer: () => createRetainer(),
  updateRetainer: (id: string, values: unknown) => updateRetainer(id, values),
  cancelRetainer: vi.fn(),
  reconcileRetainer: vi.fn(),
}));

const { RetainerForm } = await import("../retainer-form");

const RETAINER_ID = "11111111-1111-1111-1111-111111111111";

afterEach(() => {
  cleanup();
  updateRetainer.mockClear();
});

function renderEdit(isLive = true) {
  return render(
    <Theme>
      <RetainerForm
        parties={[]}
        retainer={{
          id: RETAINER_ID,
          amount_cents: 250_000,
          billing_interval: "month",
          description: "Advisory retainer",
          isLive,
        }}
      />
    </Theme>,
  );
}

describe("RetainerForm — edit mode", () => {
  it("prefills the stored amount in dollars", () => {
    // 250000 cents must render as 2500.00, not 250000 or 2500. A form that
    // prefilled cents into a dollars field would 100x the charge on save.
    renderEdit();
    expect(screen.getByDisplayValue("2500.00")).toBeTruthy();
    expect(screen.getByDisplayValue("Advisory retainer")).toBeTruthy();
  });

  it("hides the contact picker, because the subscriber cannot be reassigned", () => {
    // Moving a retainer to another collector is a cancel + restart at Stripe;
    // offering a picker here could only produce a row that contradicts the
    // subscription.
    renderEdit();
    expect(screen.queryByText(/Choose a contact/)).toBeNull();
  });

  it("warns that a change lands on the next charge, not now", () => {
    renderEdit(true);
    expect(screen.getByText(/takes effect/)).toBeTruthy();
    expect(screen.getByText(/no credit is issued/)).toBeTruthy();
  });

  it("omits the warning when checkout was never completed", () => {
    // Nothing exists at Stripe yet, so there is no billing cycle to land on and
    // the warning would just be confusing.
    renderEdit(false);
    expect(screen.queryByText(/takes effect/)).toBeNull();
  });

  it("submits exact cents for a dollars-and-cents amount", async () => {
    // $3,012.34 must reach the action as 301234. This is the float seam: 3012.34
    // * 100 is 301233.99999999994 in IEEE754, so the rounding has to be there.
    renderEdit();
    const amount = screen.getByDisplayValue("2500.00");
    await userEvent.clear(amount);
    await userEvent.type(amount, "3012.34");
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    expect(updateRetainer).toHaveBeenCalledWith(RETAINER_ID, {
      amount_cents: 301_234,
      billing_interval: "month",
      description: "Advisory retainer",
      currency: "USD",
    });
  });

  it("refuses a zero or negative amount before calling the server", async () => {
    renderEdit();
    const amount = screen.getByDisplayValue("2500.00");
    await userEvent.clear(amount);
    await userEvent.type(amount, "0");
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    expect(updateRetainer).not.toHaveBeenCalled();
    expect(screen.getByText(/greater than 0/)).toBeTruthy();
  });
});
