import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decideInvoiceState,
  settlementFromPaymentIntentStatus,
} from "./reconcile";
import { requestOptionsFor, type StripeAccountContext } from "./context";

// Shared invoice-payment payload builder used by BOTH the webhook route and the
// reconcileInvoicePayment server action, so the settlement-first decision has a
// single implementation. Any live Stripe reads happen in the callers; this takes
// already-resolved settlement facts and looks up the live invoice total.

export async function loadInvoiceTotal(
  service: SupabaseClient,
  invoiceId: string,
): Promise<{ total_cents: number; currency: string } | null> {
  const { data } = await service
    .from("invoices")
    .select("total_cents, currency")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!data) return null;
  return {
    total_cents: data.total_cents as number,
    currency: data.currency as string,
  };
}

export interface SettlementFacts {
  invoiceId: string;
  sessionId: string | null;
  piId: string | null;
  piStatus: string;
  amountCents: number;
  currency: string | null;
  method: string | null;
}

export async function buildInvoicePaymentPayload(
  service: SupabaseClient,
  facts: SettlementFacts,
): Promise<Record<string, unknown> | null> {
  const invoice = await loadInvoiceTotal(service, facts.invoiceId);
  if (!invoice) return null;

  const decision = decideInvoiceState({
    signal: settlementFromPaymentIntentStatus(facts.piStatus),
    collectedAmountCents: facts.amountCents,
    collectedCurrency: facts.currency,
    liveTotalCents: invoice.total_cents,
    liveCurrency: invoice.currency,
  });

  return {
    kind: "invoice_payment",
    invoice_id: facts.invoiceId,
    checkout_session_id: facts.sessionId,
    payment_intent_id: facts.piId,
    amount_cents: facts.amountCents,
    currency: facts.currency,
    method: facts.method,
    target_invoice_status: decision.invoiceStatus,
    payment_row_status: decision.paymentRowStatus,
    amount_paid_cents: decision.amountPaidCents,
    paid_at: decision.paid ? new Date().toISOString() : null,
  };
}

// Retrieve a completed/settling Checkout Session and reduce it to settlement
// facts for an invoice payment. Used by reconcileInvoicePayment (the manual
// recovery path when a webhook never landed).
export async function settlementFromSession(
  stripe: Stripe,
  sessionId: string,
  ctx: StripeAccountContext,
): Promise<SettlementFacts | null> {
  const options = requestOptionsFor(ctx);
  const session = await stripe.checkout.sessions.retrieve(
    sessionId,
    undefined,
    options,
  );
  const invoiceId = session.metadata?.invoice_id;
  if (!invoiceId || session.mode !== "payment") return null;

  const piId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  let piStatus = "processing";
  let method: string | null = null;
  if (piId) {
    const pi = await stripe.paymentIntents.retrieve(piId, undefined, options);
    piStatus = pi.status;
    method = pi.payment_method_types?.[0] ?? null;
  }

  return {
    invoiceId,
    sessionId: session.id,
    piId,
    piStatus,
    amountCents: session.amount_total ?? 0,
    currency: session.currency ?? null,
    method,
  };
}
