import { describe, expect, it } from "vitest";
import { resolveReceiptEmail } from "@/lib/stripe/receipt-email";
import { buildCustomerCreateParams } from "@/lib/stripe/params";
import { mergePartyOptions } from "@/components/party-picker";

// The driving case: Detroit Design District pays, Amelia Patt-Zamir is the
// person she deals with. Stripe sends subscription receipts to the Customer's
// email, and a company often has no inbox on file while Amelia always does.

describe("resolveReceiptEmail", () => {
  it("prefers the payer's own address when they have one", () => {
    // A company that HAS given her an accounts-payable address must keep it.
    // Falling through to the individual would route the company's invoices to a
    // private inbox and quietly cut AP out of the loop.
    expect(
      resolveReceiptEmail(
        { email: "ap@detroitdesign.example" },
        { email: "amelia@example.com" },
      ),
    ).toEqual({ email: "ap@detroitdesign.example", source: "payer" });
  });

  it("falls back to the attention contact when the payer has no inbox", () => {
    // Before this, createRetainer refused outright ("Add an email to this
    // contact"), so a company payer could not be charged at all.
    expect(
      resolveReceiptEmail({ email: null }, { email: "amelia@example.com" }),
    ).toEqual({ email: "amelia@example.com", source: "attention" });
  });

  it("treats a whitespace-only email as absent", () => {
    // A stray space saved in the contact form must not become the destination
    // for every receipt — Stripe would reject it or send into the void.
    expect(
      resolveReceiptEmail({ email: "   " }, { email: "amelia@example.com" }),
    ).toEqual({ email: "amelia@example.com", source: "attention" });
  });

  it("returns null when neither party has an address", () => {
    // The caller must refuse rather than create a subscription whose receipts
    // go nowhere — a silent failure the dealer would only find at renewal.
    expect(resolveReceiptEmail({ email: null }, { email: null })).toBeNull();
    expect(resolveReceiptEmail({ email: null }, null)).toBeNull();
  });

  it("still works for the ordinary one-person retainer", () => {
    expect(resolveReceiptEmail({ email: "jane@example.com" }, null)).toEqual({
      email: "jane@example.com",
      source: "payer",
    });
  });
});

describe("mergePartyOptions", () => {
  it("puts a newly created contact in alphabetical position, not at the end", () => {
    // She looks for the name where the list is sorted; appending it would send
    // her hunting at the bottom of a long picker.
    const merged = mergePartyOptions(
      [
        { id: "a", display_name: "Amelia Patt-Zamir", email: "a@example.com" },
        { id: "z", display_name: "Zoe Winter", email: null },
      ],
      [{ id: "d", display_name: "Detroit Design District", email: null }],
    );
    expect(merged.map((p) => p.display_name)).toEqual([
      "Amelia Patt-Zamir",
      "Detroit Design District",
      "Zoe Winter",
    ]);
  });

  it("de-dupes when a refetch hands back the locally-created contact", () => {
    // The server list can already contain what we created; showing it twice
    // would give the picker two identical options with the same id.
    const merged = mergePartyOptions(
      [{ id: "d", display_name: "Detroit Design District", email: null }],
      [{ id: "d", display_name: "Detroit Design District", email: null }],
    );
    expect(merged).toHaveLength(1);
  });
});

describe("buildCustomerCreateParams", () => {
  it("keeps the company as the name while the email belongs to a person", () => {
    // The pairing that makes a company payer work: Detroit Design District must
    // be the NAME (their accounting needs it on the receipt) while the delivery
    // address is Amelia's. Swapping these puts an individual's name on a
    // company's invoices.
    const receipt = resolveReceiptEmail(
      { email: null },
      { email: "amelia@example.com" },
    );
    expect(receipt?.source).toBe("attention");
    expect(
      buildCustomerCreateParams({
        partyId: "11111111-1111-4111-8111-111111111111",
        displayName: "Detroit Design District",
        email: receipt!.email,
      }),
    ).toEqual({
      name: "Detroit Design District",
      email: "amelia@example.com",
      metadata: { party_id: "11111111-1111-4111-8111-111111111111" },
    });
  });

  it("omits email entirely rather than sending null", () => {
    // Stripe rejects an explicit null here; the key must be absent.
    const params = buildCustomerCreateParams({
      partyId: "11111111-1111-4111-8111-111111111111",
      displayName: "Detroit Design District",
      email: null,
    });
    expect("email" in params).toBe(false);
  });
});
