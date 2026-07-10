import { describe, expect, it } from "vitest";
import { computeInvoiceTotals, formatInvoiceMoney } from "@/lib/money";
import { formatPriceCents } from "@/lib/supabase/storage";

// The B1 regression: invoice amounts must render to the exact cent. The whole-
// dollar formatPriceCents (tearsheets) must NEVER be used for invoice money.
describe("formatInvoiceMoney — exact cents", () => {
  it("renders the plan's fixture total to the cent", () => {
    // subtotal $15,500.50 + shipping $450.75 = $15,951.25. Rounding to whole
    // dollars here would mis-state a legal document by up to a dollar.
    expect(formatInvoiceMoney(1_595_125, "USD")).toBe("$15,951.25");
  });

  it("keeps trailing-zero cents (no dropping to whole dollars)", () => {
    expect(formatInvoiceMoney(1_250_050, "USD")).toBe("$12,500.50");
    expect(formatInvoiceMoney(300_000, "USD")).toBe("$3,000.00");
  });

  it("renders GBP and EUR with the right symbol", () => {
    expect(formatInvoiceMoney(1_595_125, "GBP")).toBe("£15,951.25");
    expect(formatInvoiceMoney(1_595_125, "EUR")).toBe("€15,951.25");
  });

  it("treats null/undefined as zero", () => {
    expect(formatInvoiceMoney(null, "USD")).toBe("$0.00");
    expect(formatInvoiceMoney(undefined, "USD")).toBe("$0.00");
  });

  it("differs from the whole-dollar formatter — proving they are not interchangeable", () => {
    // formatPriceCents drops the cents; formatInvoiceMoney keeps them.
    expect(formatPriceCents(1_595_125, "USD")).toBe("$15,951");
    expect(formatInvoiceMoney(1_595_125, "USD")).toBe("$15,951.25");
    expect(formatPriceCents(1_595_125, "USD")).not.toBe(
      formatInvoiceMoney(1_595_125, "USD"),
    );
  });
});

describe("computeInvoiceTotals — server-side recompute", () => {
  it("sums line amounts + shipping in integer cents", () => {
    const t = computeInvoiceTotals([1_250_050, 300_000], 45_075);
    expect(t.subtotalCents).toBe(1_550_050);
    expect(t.shippingCents).toBe(45_075);
    expect(t.totalCents).toBe(1_595_125);
  });

  it("the displayed line amounts sum to the displayed total (falsifiable invariant)", () => {
    const lines = [1_250_050, 300_000];
    const shipping = 45_075;
    const t = computeInvoiceTotals(lines, shipping);
    // Reconstruct the total from the *displayed* strings, cent-for-cent.
    const parseDisplayed = (s: string) =>
      Math.round(Number(s.replace(/[^0-9.]/g, "")) * 100);
    const displayedSum =
      lines.reduce((a, c) => a + parseDisplayed(formatInvoiceMoney(c)), 0) +
      parseDisplayed(formatInvoiceMoney(shipping));
    expect(displayedSum).toBe(parseDisplayed(formatInvoiceMoney(t.totalCents)));
    expect(displayedSum).toBe(1_595_125);
  });

  it("missing shipping defaults to zero", () => {
    const t = computeInvoiceTotals([500], null);
    expect(t).toEqual({ subtotalCents: 500, shippingCents: 0, totalCents: 500 });
  });
});
