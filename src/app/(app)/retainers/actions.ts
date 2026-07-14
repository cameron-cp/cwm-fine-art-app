"use server";

import { revalidatePath } from "next/cache";
import { publicEnv } from "@/lib/env";
import { retainerCreateSchema } from "@/lib/schemas/stripe";
import type { Party } from "@/lib/schemas/party";
import { getStripe } from "@/lib/stripe/client";
import { requestOptionsFor, resolveStripeContext } from "@/lib/stripe/context";
import {
  cancelRetainerSubscription,
  createRetainerCheckoutSession,
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
  // Stripe requires an email for subscription receipts.
  if (!party.email) {
    return { error: "Add an email to this contact before starting a retainer." };
  }

  const session = await createRetainerCheckoutSession({
    party,
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
