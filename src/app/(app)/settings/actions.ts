"use server";

import { revalidatePath } from "next/cache";
import { invoiceSettingsSchema } from "@/lib/schemas/invoice";
import { getSupabaseServer } from "@/lib/supabase/server";

type Result<T> = { data: T } | { error: string };

export async function updateInvoiceSettings(
  input: unknown,
): Promise<Result<{ ok: true }>> {
  const parsed = invoiceSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  }

  const supabase = getSupabaseServer();
  // Single-row table keyed by singleton=true. next_invoice_number is owned by
  // the allocation RPC and is intentionally not editable here.
  const { error } = await supabase
    .from("invoice_settings")
    .update({
      business_name: parsed.data.business_name,
      business_legal_name: parsed.data.business_legal_name,
      business_address: parsed.data.business_address,
      business_phone: parsed.data.business_phone,
      business_email: parsed.data.business_email,
      remittance_intro: parsed.data.remittance_intro,
      remittance_beneficiary: parsed.data.remittance_beneficiary,
      remittance_bank: parsed.data.remittance_bank,
      remittance_aba: parsed.data.remittance_aba,
      remittance_account: parsed.data.remittance_account,
      payment_terms_default: parsed.data.payment_terms_default,
      payment_terms_statement: parsed.data.payment_terms_statement,
      terms_intro: parsed.data.terms_intro,
      terms_conditions: parsed.data.terms_conditions,
      invoice_prefix: parsed.data.invoice_prefix,
    })
    .eq("singleton", true);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/invoices");
  return { data: { ok: true } };
}
