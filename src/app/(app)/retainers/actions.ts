"use server";

import { revalidatePath } from "next/cache";
import { publicEnv } from "@/lib/env";
import {
  retainerCreateSchema,
  retainerUpdateSchema,
  type Retainer,
} from "@/lib/schemas/stripe";
import type { Party } from "@/lib/schemas/party";
import { getStripe } from "@/lib/stripe/client";
import { requestOptionsFor, resolveStripeContext } from "@/lib/stripe/context";
import {
  planRetainerEdit,
  type RetainerEditMode,
} from "@/lib/stripe/retainer-edit";
import { resolveReceiptEmail } from "@/lib/stripe/receipt-email";
import {
  cancelRetainerSubscription,
  createRetainerCheckoutSession,
  updateRetainerSubscription,
} from "@/lib/stripe/subscriptions";
import { idOf, subscriptionFacts } from "@/lib/stripe/stripe-fields";
import { getServiceClient } from "@/lib/supabase/service";
import { getSupabaseServer } from "@/lib/supabase/server";

type Result<T> = { data: T } | { error: string };

// Start a retainer: create the Stripe subscription Checkout and persist an
// `incomplete` retainers stub (carrying the session id — the fallback recovery
// key) BEFORE redirect. session.subscription is null until the customer pays, so
// it cannot be captured now; the webhook fills it on completion.
export async function createRetainer(
  input: unknown,
): Promise<Result<{ url: string }>> {
  const parsed = retainerCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid retainer" };
  }
  const data = parsed.data;

  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return { error: "NEXT_PUBLIC_APP_URL is not configured." };

  const supabase = getSupabaseServer();
  const { data: partyRow } = await supabase
    .from("parties")
    .select("id, display_name, email, stripe_customer_id")
    .eq("id", data.party_id)
    .maybeSingle();
  if (!partyRow) return { error: "Contact not found." };
  const party = partyRow as Pick<
    Party,
    "id" | "display_name" | "email" | "stripe_customer_id"
  >;

  // A company payer often has no inbox on file while the person she deals with
  // does, so the receipt address can come from either — see
  // src/lib/stripe/receipt-email.ts for the precedence and why.
  let attention: Pick<Party, "id" | "display_name" | "email"> | null = null;
  if (data.attention_party_id) {
    if (data.attention_party_id === data.party_id) {
      return { error: "The attention contact must be someone other than the payer." };
    }
    const { data: attentionRow } = await supabase
      .from("parties")
      .select("id, display_name, email")
      .eq("id", data.attention_party_id)
      .maybeSingle();
    if (!attentionRow) return { error: "Attention contact not found." };
    attention = attentionRow as Pick<Party, "id" | "display_name" | "email">;
  }

  const receipt = resolveReceiptEmail(party, attention);
  if (!receipt) {
    return {
      error: attention
        ? "Neither the payer nor the attention contact has an email, and Stripe needs one for receipts."
        : "Add an email to this contact, or name an attention contact who has one.",
    };
  }

  const session = await createRetainerCheckoutSession({
    // The Stripe Customer keeps the PAYER's name — their accounting needs the
    // company on the receipt — while the email is whichever address will
    // actually be read. diffCustomerFields treats a null local email as "leave
    // alone", so a later edit of the company contact cannot blank this back out.
    party: { ...party, email: receipt.email },
    amountCents: data.amount_cents,
    currency: data.currency,
    billingInterval: data.billing_interval,
    description: data.description,
    appUrl,
    ctx: await resolveStripeContext(),
  });
  if ("error" in session) return { error: session.error };

  // Cancel any prior abandoned checkout stub for this party so phantom drafts
  // don't pile up, then insert the new stub.
  await supabase
    .from("retainers")
    .update({ status: "canceled" })
    .eq("party_id", party.id)
    .eq("status", "incomplete");
  await supabase.from("retainers").insert({
    party_id: party.id,
    attention_party_id: attention?.id ?? null,
    stripe_checkout_session_id: session.data.id,
    description: data.description,
    amount_cents: data.amount_cents,
    currency: data.currency,
    billing_interval: data.billing_interval,
    status: "incomplete",
  });

  revalidatePath("/retainers");
  return { data: { url: session.data.url } };
}

// Edit a retainer's amount, cadence, or description. planRetainerEdit decides
// whether that means a Stripe price swap (live subscription), a local-only
// correction (checkout never completed), or nothing at all — see
// src/lib/stripe/retainer-edit.ts for why those are the three cases.
//
// Stripe goes first when it is involved: if the price swap fails, the local row
// must stay as it was, or the app would claim a figure Stripe will never charge.
export async function updateRetainer(
  id: string,
  input: unknown,
): Promise<Result<{ id: string; mode: RetainerEditMode }>> {
  const parsed = retainerUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid retainer" };
  }
  const next = parsed.data;

  const supabase = getSupabaseServer();
  const { data: row } = await supabase
    .from("retainers")
    .select(
      "id, status, stripe_subscription_id, amount_cents, billing_interval, description, currency",
    )
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Retainer not found." };
  const current = row as Pick<
    Retainer,
    | "id"
    | "status"
    | "stripe_subscription_id"
    | "amount_cents"
    | "billing_interval"
    | "description"
    | "currency"
  >;

  if (current.status === "canceled") {
    return {
      error: "This retainer is canceled. Start a new one instead of editing it.",
    };
  }

  const plan = planRetainerEdit(current, next);
  if (plan.mode === "noop") return { data: { id, mode: plan.mode } };

  const update: Record<string, unknown> = {
    amount_cents: next.amount_cents,
    billing_interval: next.billing_interval,
    description: next.description,
    currency: next.currency,
  };

  if (plan.mode === "stripe") {
    const result = await updateRetainerSubscription({
      subscriptionId: current.stripe_subscription_id as string,
      amountCents: next.amount_cents,
      currency: next.currency,
      billingInterval: next.billing_interval,
      description: next.description,
      ctx: await resolveStripeContext(),
    });
    if ("error" in result) return { error: result.error };
    // Mirror what Stripe now reports rather than what we asked for.
    update.stripe_price_id = result.data.priceId;
    update.status = result.data.status;
    update.current_period_end = result.data.currentPeriodEnd;
  }

  const { error } = await supabase.from("retainers").update(update).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/retainers");
  revalidatePath(`/retainers/${id}`);
  return { data: { id, mode: plan.mode } };
}

// Change (or clear) who the retainer is addressed to. Deliberately its own
// action rather than a field on updateRetainer: this touches nobody's money, so
// it must never mint a Stripe price or run the edit planner. Passing null clears
// the attention line.
export async function setRetainerAttention(
  id: string,
  attentionPartyId: string | null,
): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  const { data: row } = await supabase
    .from("retainers")
    .select("id, party_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Retainer not found." };

  // Pre-check the 0024 CHECK so she gets a sentence instead of a raw constraint
  // violation (the deleteParty / addInterest convention).
  if (attentionPartyId && attentionPartyId === (row as { party_id: string }).party_id) {
    return { error: "The attention contact must be someone other than the payer." };
  }

  const { error } = await supabase
    .from("retainers")
    .update({ attention_party_id: attentionPartyId })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/retainers");
  revalidatePath(`/retainers/${id}`);
  return { data: { id } };
}

// Cancel a retainer. If it never activated (no subscription id), just mark the
// local row canceled — nothing to cancel at Stripe.
export async function cancelRetainer(id: string): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();
  const { data: retainer } = await supabase
    .from("retainers")
    .select("id, stripe_subscription_id")
    .eq("id", id)
    .maybeSingle();
  if (!retainer) return { error: "Retainer not found." };

  const result = await cancelRetainerSubscription(
    {
      stripe_subscription_id: retainer.stripe_subscription_id as string | null,
    },
    await resolveStripeContext(),
  );
  if ("error" in result) return { error: result.error };

  const { error } = await supabase
    .from("retainers")
    .update({ status: "canceled" })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/retainers");
  revalidatePath(`/retainers/${id}`);
  return { data: { id } };
}

// Manual recovery: re-fetch the (now complete) session, fill the subscription
// details, and re-apply via apply_stripe_event. Mirrors reconcileInvoicePayment.
export async function reconcileRetainer(
  id: string,
): Promise<Result<{ status: string }>> {
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };

  const supabase = getSupabaseServer();
  const { data: retainer } = await supabase
    .from("retainers")
    .select("stripe_checkout_session_id")
    .eq("id", id)
    .maybeSingle();
  const sessionId = retainer?.stripe_checkout_session_id as
    | string
    | null
    | undefined;
  if (!sessionId) return { error: "No checkout session to reconcile." };

  try {
    const options = requestOptionsFor(await resolveStripeContext());
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      undefined,
      options,
    );
    const subId = idOf(session.subscription);
    if (!subId) {
      return { error: "Retainer checkout is not complete yet." };
    }
    const facts = subscriptionFacts(
      await stripe.subscriptions.retrieve(
        subId,
        { expand: ["items.data.price"] },
        options,
      ),
    );
    const m = session.metadata ?? {};

    const service = getServiceClient();
    const { error } = await service.rpc("apply_stripe_event", {
      p_event_id: `manual-retainer-${sessionId}-${Date.now()}`,
      p_type: "manual.reconcile",
      p_payload: {
        kind: "retainer_activation",
        checkout_session_id: sessionId,
        subscription_id: facts.subscriptionId,
        price_id: facts.priceId,
        status: facts.status,
        current_period_end: facts.currentPeriodEnd,
        party_id: m.party_id,
        amount_cents: m.amount_cents,
        interval: m.interval,
        description: m.description,
        currency: m.currency,
      },
    });
    if (error) return { error: error.message };

    revalidatePath("/retainers");
    revalidatePath(`/retainers/${id}`);
    return { data: { status: facts.status } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Reconcile failed." };
  }
}
