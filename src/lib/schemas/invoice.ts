import { z } from "zod";
import {
  optionalPriceCents,
  optionalText,
  optionalUuid,
  optionalYear,
  requiredPriceCents,
} from "./coercers";

// Invoice + line-item form schema. Amounts are integer cents. The server action
// recomputes totals and builds the RPC payload (adding invoice-owned image paths
// and party-name snapshots); this schema validates the operator's form input.

export const invoiceCurrencies = ["USD", "GBP", "EUR"] as const;
export const invoiceCurrency = z.enum(invoiceCurrencies);
export type InvoiceCurrency = (typeof invoiceCurrencies)[number];

export const CURRENCY_SYMBOLS: Record<InvoiceCurrency, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
};

// Provenance lines as objects for useFieldArray; flattened to text[] before persist.
export const provenanceLineSchema = z.object({
  value: z.string().trim().min(1, "Empty entry"),
});

export const invoiceLineItemSchema = z.object({
  artwork_id: optionalUuid,
  position: z.number().int().min(0).default(0),
  artist_name: optionalText,
  title: optionalText,
  year: optionalYear,
  medium: optionalText,
  dimensions_text: optionalText,
  edition: optionalText,
  signature_details: optionalText,
  catalogue_raisonne: optionalText,
  inventory_no: optionalText,
  provenance_lines: z.array(provenanceLineSchema).default([]),
  amount_cents: requiredPriceCents,
});

export const invoiceSchema = z.object({
  buyer_party_id: optionalUuid,
  on_behalf_of_party_id: optionalUuid,
  seller_party_id: optionalUuid,

  // Bill-to snapshot (editable after prefill from the buyer party).
  bill_to_name: z.string().trim().min(1, "Bill-to name is required"),
  bill_to_attention: optionalText,
  bill_to_address: optionalText,
  bill_to_email: optionalText,

  date_issued: z.string().trim().min(1, "Date issued is required"),
  payment_terms: z.string().trim().min(1).default("Net 14"),
  currency: invoiceCurrency.default("USD"),
  ship_from: optionalText,
  ship_to: optionalText,
  shipping_cents: optionalPriceCents,
  notes: optionalText,

  line_items: z.array(invoiceLineItemSchema).min(1, "Add at least one work"),
});

export type InvoiceFormInput = z.input<typeof invoiceSchema>;
export type InvoiceInput = z.output<typeof invoiceSchema>;

// Settings form schema -------------------------------------------------
// Settings columns are NOT NULL default '' — blanks are allowed (unlike the
// null-coercing optionalText). The account/ABA fields stay blank until Chloe
// fills them here.

const settingsText = z.string().trim().default("");

export const termsClauseSchema = z.object({
  title: z.string().trim().min(1, "Clause needs a title"),
  body: z.string().trim().min(1, "Clause needs a body"),
});

export const invoiceSettingsSchema = z.object({
  business_name: settingsText,
  business_legal_name: settingsText,
  business_address: settingsText,
  business_phone: settingsText,
  business_email: settingsText,
  remittance_intro: settingsText,
  remittance_beneficiary: settingsText,
  remittance_bank: settingsText,
  remittance_aba: settingsText,
  remittance_account: settingsText,
  payment_terms_default: z.string().trim().min(1).default("Net 14"),
  payment_terms_statement: settingsText,
  terms_intro: settingsText,
  terms_conditions: z.array(termsClauseSchema).default([]),
  invoice_prefix: z.string().trim().min(1).default("CWFA-"),
});

export type InvoiceSettingsFormInput = z.input<typeof invoiceSettingsSchema>;
export type InvoiceSettingsFormValues = z.output<typeof invoiceSettingsSchema>;

// DB row shapes ---------------------------------------------------------

export type TermsClause = { title: string; body: string };

export type InvoiceSettings = {
  singleton: boolean;
  business_name: string;
  business_legal_name: string;
  business_address: string;
  business_phone: string;
  business_email: string;
  remittance_intro: string;
  remittance_beneficiary: string;
  remittance_bank: string;
  remittance_aba: string;
  remittance_account: string;
  payment_terms_default: string;
  payment_terms_statement: string;
  terms_intro: string;
  terms_conditions: TermsClause[];
  invoice_prefix: string;
  next_invoice_number: number;
  updated_at: string;
};

// The snapshot stored on each invoice: invoice_settings minus the mutable
// numbering fields (next_invoice_number / singleton / updated_at).
export type InvoiceSettingsSnapshot = Omit<
  InvoiceSettings,
  "next_invoice_number" | "singleton" | "updated_at"
>;

export type Invoice = {
  id: string;
  invoice_number: number;
  invoice_prefix: string;
  buyer_party_id: string | null;
  on_behalf_of_party_id: string | null;
  seller_party_id: string | null;
  bill_to_name: string;
  bill_to_attention: string | null;
  bill_to_address: string | null;
  bill_to_email: string | null;
  on_behalf_of_name: string | null;
  seller_name: string | null;
  settings_snapshot: InvoiceSettingsSnapshot;
  date_issued: string;
  payment_terms: string;
  currency: string;
  ship_from: string | null;
  ship_to: string | null;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  notes: string | null;
  // Stripe payment state (migration 0013). payment_status defaults 'unpaid'.
  payment_status: import("@/lib/stripe/reconcile").InvoicePaymentStatus;
  amount_paid_cents: number;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  artwork_id: string | null;
  position: number;
  artist_name: string | null;
  title: string | null;
  year: number | null;
  medium: string | null;
  dimensions_text: string | null;
  edition: string | null;
  signature_details: string | null;
  catalogue_raisonne: string | null;
  inventory_no: string | null;
  provenance_lines: string[];
  image_path: string | null;
  amount_cents: number;
  created_at: string;
};
