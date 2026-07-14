"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AI_FEATURES, AiConfigError, type AiFeature } from "@/lib/ai/models";
import { resetAiModelSetting, saveAiModelSetting } from "@/lib/ai/settings";
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

// The dropdown submits either "default" (revert to env/code) or a
// "provider:model" pair. Feature is constrained to the known AI features.
const aiModelSchema = z.object({
  feature: z.enum(AI_FEATURES as unknown as [AiFeature, ...AiFeature[]]),
  // "default" | "<provider>:<model>"
  value: z.string().min(1),
});

export async function updateAiModel(input: unknown): Promise<Result<{ ok: true }>> {
  const parsed = aiModelSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid selection" };
  }
  const { feature, value } = parsed.data;
  const supabase = getSupabaseServer();

  try {
    if (value === "default") {
      await resetAiModelSetting(supabase, feature);
    } else {
      const colon = value.indexOf(":");
      if (colon === -1) return { error: "Selection must be provider:model." };
      const provider = value.slice(0, colon);
      const model = value.slice(colon + 1);
      await saveAiModelSetting(supabase, feature, provider, model);
    }
  } catch (e) {
    if (e instanceof AiConfigError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Could not save the model choice." };
  }

  revalidatePath("/settings");
  return { data: { ok: true } };
}
