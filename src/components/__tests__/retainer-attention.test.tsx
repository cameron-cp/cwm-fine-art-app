// @vitest-environment jsdom

// The payer and the person she deals with are two different facts, and the line
// that carries the second one must not quietly disappear or turn into the first.
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RetainerAttention } from "@/components/retainer-attention";

afterEach(cleanup);

const AMELIA = {
  id: "22222222-2222-4222-8222-222222222222",
  display_name: "Amelia Patt-Zamir",
  email: "amelia@example.com",
};

describe("RetainerAttention", () => {
  it("names the contact and links to their card", () => {
    render(
      <Theme>
        <RetainerAttention attention={AMELIA} />
      </Theme>,
    );
    const link = screen.getByRole("link", { name: /Amelia Patt-Zamir/ });
    expect(link.getAttribute("href")).toBe(`/contacts/${AMELIA.id}`);
    expect(screen.getByText(/Attn:/)).toBeTruthy();
  });

  it("shows the email in tabular mono, because that is the address receipts go to", () => {
    // When the payer is a company with no inbox, THIS is where Stripe sends the
    // invoice — so it has to be readable on the retainer, not just inferable.
    const { container } = render(
      <Theme>
        <RetainerAttention attention={AMELIA} />
      </Theme>,
    );
    const mono = container.querySelector(".num");
    expect(mono?.textContent).toContain("amelia@example.com");
  });

  it("renders nothing for the ordinary one-person retainer", () => {
    // No attention contact must mean no empty "Attn:" label sitting there.
    const { container } = render(
      <Theme>
        <RetainerAttention attention={null} />
      </Theme>,
    );
    expect(container.textContent).not.toContain("Attn");
  });

  it("omits the email separator when the contact has none", () => {
    const { container } = render(
      <Theme>
        <RetainerAttention attention={{ ...AMELIA, email: null }} />
      </Theme>,
    );
    expect(screen.getByRole("link", { name: /Amelia Patt-Zamir/ })).toBeTruthy();
    expect(container.querySelector(".num")).toBeNull();
  });
});
