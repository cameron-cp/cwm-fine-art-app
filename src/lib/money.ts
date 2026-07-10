// Money formatting for invoices. Invoice amounts render to the exact cent — the
// displayed total is the exact sum of displayed line amounts + shipping. NEVER
// use formatPriceCents (whole-dollar, maximumFractionDigits: 0) for invoice
// amounts: that rounds cents away and would mis-state a legal document.

export function formatInvoiceMoney(
  cents: number | null | undefined,
  currency = "USD",
): string {
  const value = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Unknown currency code — fall back to a 2-decimal amount + raw code.
    return `${value.toFixed(2)} ${currency}`;
  }
}

// Sum line-item amounts + shipping, all in integer cents. Kept as a pure helper
// so the form, the server action, and the tests share one definition of "total".
export function computeInvoiceTotals(
  lineAmountsCents: Array<number | null | undefined>,
  shippingCents: number | null | undefined,
): { subtotalCents: number; shippingCents: number; totalCents: number } {
  const subtotalCents = lineAmountsCents.reduce<number>(
    (sum, c) => sum + (c ?? 0),
    0,
  );
  const shipping = shippingCents ?? 0;
  return {
    subtotalCents,
    shippingCents: shipping,
    totalCents: subtotalCents + shipping,
  };
}
