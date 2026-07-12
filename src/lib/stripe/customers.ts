import { getStripe } from "./client";
import { buildSetupCheckoutParams } from "./params";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Party } from "@/lib/schemas/party";

type Result<T> = { data: T } | { error: string };

// Lazily create one Stripe Customer per party and persist parties.stripe_customer_id.
// Idempotent: if the party already has one, return it. If the persisting write
// fails (e.g. a concurrent create won the race), re-fetch the stored id rather
// than surfacing a raw DB error.
export async function ensureStripeCustomer(
  party: Pick<Party, "id" | "display_name" | "email" | "stripe_customer_id">,
): Promise<Result<{ id: string }>> {
  if (party.stripe_customer_id) return { data: { id: party.stripe_customer_id } };

  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };
  const supabase = getSupabaseServer();

  try {
    const customer = await stripe.customers.create({
      name: party.display_name,
      ...(party.email ? { email: party.email } : {}),
      metadata: { party_id: party.id },
    });

    const { error } = await supabase
      .from("parties")
      .update({ stripe_customer_id: customer.id })
      .eq("id", party.id);

    if (error) {
      const { data } = await supabase
        .from("parties")
        .select("stripe_customer_id")
        .eq("id", party.id)
        .maybeSingle();
      if (data?.stripe_customer_id) return { data: { id: data.stripe_customer_id } };
      return { error: error.message };
    }

    return { data: { id: customer.id } };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to create customer.",
    };
  }
}

// Setup-mode Checkout to save a card/bank on file (no charge).
export async function createSetupCheckoutSession(args: {
  party: Pick<Party, "id" | "display_name" | "email" | "stripe_customer_id">;
  appUrl: string;
  returnPath: string;
}): Promise<Result<{ url: string }>> {
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };

  const customer = await ensureStripeCustomer(args.party);
  if ("error" in customer) return customer;

  try {
    const session = await stripe.checkout.sessions.create(
      buildSetupCheckoutParams({
        stripeCustomerId: customer.data.id,
        currency: "USD",
        appUrl: args.appUrl,
        returnPath: args.returnPath,
      }),
    );
    if (!session.url) return { error: "Stripe returned no setup URL." };
    return { data: { url: session.url } };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to start setup.",
    };
  }
}

// Billing Portal so the collector can manage saved payment methods. NOTE: this
// requires a live-mode Customer Portal configuration in the Stripe dashboard,
// else billingPortal.sessions.create errors (see .env.example).
export async function createBillingPortalSession(args: {
  party: Pick<Party, "id" | "display_name" | "email" | "stripe_customer_id">;
  appUrl: string;
  returnPath: string;
}): Promise<Result<{ url: string }>> {
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };
  if (!args.party.stripe_customer_id) {
    return { error: "No payment methods on file yet." };
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: args.party.stripe_customer_id,
      return_url: `${args.appUrl}${args.returnPath}`,
    });
    return { data: { url: session.url } };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to open billing portal.",
    };
  }
}
