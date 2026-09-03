import { getStripe } from "./client";
import {
  buildCustomerCreateParams,
  buildSetupCheckoutParams,
  diffCustomerFields,
} from "./params";
import { requestOptionsFor, type StripeAccountContext } from "./context";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Party } from "@/lib/schemas/party";

type Result<T> = { data: T } | { error: string };

// Lazily create one Stripe Customer per party and persist parties.stripe_customer_id.
// Idempotent: if the party already has one, return it. If the persisting write
// fails (e.g. a concurrent create won the race), re-fetch the stored id rather
// than surfacing a raw DB error.
export async function ensureStripeCustomer(
  party: Pick<Party, "id" | "display_name" | "email" | "stripe_customer_id">,
  ctx: StripeAccountContext,
): Promise<Result<{ id: string }>> {
  if (party.stripe_customer_id) return { data: { id: party.stripe_customer_id } };

  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };
  const supabase = getSupabaseServer();

  try {
    const customer = await stripe.customers.create(
      buildCustomerCreateParams({
        partyId: party.id,
        displayName: party.display_name,
        email: party.email,
      }),
      requestOptionsFor(ctx),
    );

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

// Push app-side contact edits (name, email) onto the existing Stripe Customer so
// the two stop drifting: her receipts, Billing Portal, and Stripe dashboard all
// read the name she just typed.
//
// Never fatal to the caller. A contact save is the dealer's record-keeping and
// must not be held hostage to Stripe being reachable — `updateParty` reports the
// sync failure as a warning and keeps the local write. Returns synced:false for
// the ordinary no-op cases (no customer yet, nothing changed, customer deleted
// at Stripe) so only real failures surface as errors.
export async function syncStripeCustomer(
  party: Pick<Party, "display_name" | "email" | "stripe_customer_id">,
  ctx: StripeAccountContext,
): Promise<Result<{ synced: boolean }>> {
  if (!party.stripe_customer_id) return { data: { synced: false } };

  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };

  try {
    const options = requestOptionsFor(ctx);
    const remote = await stripe.customers.retrieve(
      party.stripe_customer_id,
      undefined,
      options,
    );
    // A customer deleted in the Stripe dashboard still leaves its id on our
    // row. Nothing to sync onto, and re-creating one here would be a surprise
    // side effect of renaming a contact.
    if (remote.deleted) return { data: { synced: false } };

    const changes = diffCustomerFields(
      { name: party.display_name, email: party.email },
      { name: remote.name ?? "", email: remote.email ?? null },
    );
    if (!changes) return { data: { synced: false } };

    await stripe.customers.update(party.stripe_customer_id, changes, options);
    return { data: { synced: true } };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to update Stripe customer.",
    };
  }
}

// Setup-mode Checkout to save a card/bank on file (no charge).
export async function createSetupCheckoutSession(args: {
  party: Pick<Party, "id" | "display_name" | "email" | "stripe_customer_id">;
  appUrl: string;
  returnPath: string;
  ctx: StripeAccountContext;
}): Promise<Result<{ url: string }>> {
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };

  const customer = await ensureStripeCustomer(args.party, args.ctx);
  if ("error" in customer) return customer;

  try {
    const session = await stripe.checkout.sessions.create(
      buildSetupCheckoutParams({
        stripeCustomerId: customer.data.id,
        currency: "USD",
        appUrl: args.appUrl,
        returnPath: args.returnPath,
      }),
      requestOptionsFor(args.ctx),
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
  ctx: StripeAccountContext;
}): Promise<Result<{ url: string }>> {
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };
  if (!args.party.stripe_customer_id) {
    return { error: "No payment methods on file yet." };
  }

  try {
    const session = await stripe.billingPortal.sessions.create(
      {
        customer: args.party.stripe_customer_id,
        return_url: `${args.appUrl}${args.returnPath}`,
      },
      requestOptionsFor(args.ctx),
    );
    return { data: { url: session.url } };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to open billing portal.",
    };
  }
}
