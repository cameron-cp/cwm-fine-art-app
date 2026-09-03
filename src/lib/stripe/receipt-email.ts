// Where a retainer's Stripe receipts go.
//
// Stripe sends subscription invoices to the CUSTOMER's email, and the customer
// is the payer — Detroit Design District, not Amelia. Companies frequently have
// no inbox on file (or only a general one the dealer doesn't have), while the
// person she actually deals with always does. Before this, createRetainer simply
// refused: "Add an email to this contact before starting a retainer", which for
// a company payer meant inventing an address or abandoning the retainer.
//
// So the payer's own email wins when it exists — their accounts-payable address
// is the right destination and the dealer may have entered it deliberately — and
// the attention contact's email is the fallback. The result is set as the Stripe
// Customer's email, which is what Stripe actually reads; the customer's NAME
// stays the company, so their receipts still say Detroit Design District.
//
// Pure so the precedence is testable without a Stripe key: getting it backwards
// would quietly redirect a company's invoices to an individual's inbox.

export interface ReceiptParty {
  email: string | null;
}

export type ReceiptEmailSource = "payer" | "attention";

export interface ReceiptEmailResult {
  email: string;
  source: ReceiptEmailSource;
}

export function resolveReceiptEmail(
  payer: ReceiptParty,
  attention: ReceiptParty | null,
): ReceiptEmailResult | null {
  const payerEmail = payer.email?.trim();
  if (payerEmail) return { email: payerEmail, source: "payer" };

  const attentionEmail = attention?.email?.trim();
  if (attentionEmail) return { email: attentionEmail, source: "attention" };

  return null;
}
