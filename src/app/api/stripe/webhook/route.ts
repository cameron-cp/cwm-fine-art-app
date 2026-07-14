import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { constructStripeEvent } from "@/lib/stripe/webhook";
import {
  requestOptionsFor,
  type StripeAccountContext,
} from "@/lib/stripe/context";
import { decideRefund } from "@/lib/stripe/reconcile";
import { buildInvoicePaymentPayload } from "@/lib/stripe/resolve";
import {
  idOf,
  readString,
  readUnix,
  subscriptionFacts,
  unixToIso,
} from "@/lib/stripe/stripe-fields";
import { getServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

// The ONLY automatic write path for payment status. Verifies the raw-body HMAC,
// resolves the target state via the pure reconcile functions (doing any live
// Stripe reads HERE, since the RPC is pure plpgsql), then applies it atomically
// via apply_stripe_event (dedup + write in one transaction). Mapping:
//   bad signature            -> 400 (no retry)
//   handled, RPC ok / no-op  -> 200
//   RPC/resolve error        -> 5xx (Stripe retries)
//   event we don't handle    -> 200 (ack, ignore)

async function resolvePayload(
  stripe: Stripe,
  service: SupabaseClient,
  event: Stripe.Event,
  ctx: StripeAccountContext,
): Promise<Record<string, unknown> | null> {
  // Every live Stripe read below acts within the account the event came from.
  const options = requestOptionsFor(ctx);
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode === "payment") {
        const invoiceId = session.metadata?.invoice_id;
        if (!invoiceId) return null;
        const piId = idOf(session.payment_intent);
        let piStatus = "processing";
        let method: string | null = null;
        if (piId) {
          const pi = await stripe.paymentIntents.retrieve(
            piId,
            undefined,
            options,
          );
          piStatus = pi.status;
          method = pi.payment_method_types?.[0] ?? null;
        }
        return buildInvoicePaymentPayload(service, {
          invoiceId,
          sessionId: session.id,
          piId,
          piStatus,
          amountCents: session.amount_total ?? 0,
          currency: session.currency ?? null,
          method,
        });
      }

      if (session.mode === "subscription") {
        const subId = idOf(session.subscription);
        const facts = subId
          ? subscriptionFacts(
              await stripe.subscriptions.retrieve(
                subId,
                { expand: ["items.data.price"] },
                options,
              ),
            )
          : null;
        const m = session.metadata ?? {};
        return {
          kind: "retainer_activation",
          checkout_session_id: session.id,
          subscription_id: subId,
          price_id: facts?.priceId ?? null,
          status: facts?.status ?? "active",
          current_period_end: facts?.currentPeriodEnd ?? null,
          party_id: m.party_id,
          amount_cents: m.amount_cents,
          interval: m.interval,
          description: m.description,
          currency: m.currency,
        };
      }

      // setup mode: payment method saved on the customer, no state write.
      return null;
    }

    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = pi.metadata?.invoice_id;
      if (!invoiceId) return null; // not an invoice PI (e.g. a subscription PI)
      return buildInvoicePaymentPayload(service, {
        invoiceId,
        sessionId: null,
        piId: pi.id,
        piStatus: pi.status,
        amountCents: pi.amount_received || pi.amount,
        currency: pi.currency,
        method: pi.payment_method_types?.[0] ?? null,
      });
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const piId = idOf(charge.payment_intent);
      if (!piId) return null;
      const pi = await stripe.paymentIntents.retrieve(piId, undefined, options);
      const invoiceId = pi.metadata?.invoice_id;
      if (!invoiceId) return null;
      const { fullyRefunded } = decideRefund({
        amountRefundedCents: charge.amount_refunded,
        chargeAmountCents: charge.amount,
      });
      return {
        kind: "invoice_refund",
        invoice_id: invoiceId,
        payment_intent_id: piId,
        fully_refunded: fullyRefunded,
        amount_paid_cents: charge.amount - charge.amount_refunded,
      };
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      // Subscription link location has shifted across API versions.
      const subId =
        readString(inv, "subscription") ??
        readString(
          (inv as { parent?: { subscription_details?: unknown } }).parent
            ?.subscription_details,
          "subscription",
        );
      if (!subId) return null;
      const paidAt = unixToIso(
        readUnix(
          (inv as { status_transitions?: unknown }).status_transitions,
          "paid_at",
        ),
      );
      return {
        kind: "retainer_payment",
        subscription_id: subId,
        stripe_invoice_id: inv.id,
        amount_cents: inv.amount_paid || inv.amount_due,
        status: event.type === "invoice.paid" ? "paid" : "failed",
        paid_at: paidAt,
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
      };
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const facts = subscriptionFacts(sub);
      return {
        kind: "retainer_status",
        subscription_id: sub.id,
        status:
          event.type === "customer.subscription.deleted"
            ? "canceled"
            : facts.status,
        current_period_end: facts.currentPeriodEnd,
      };
    }

    default:
      return null; // unhandled event → ack
  }
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const { STRIPE_WEBHOOK_SECRET } = getServerEnv();
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured." },
      { status: 500 },
    );
  }

  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  const verified = constructStripeEvent(stripe, raw, signature, STRIPE_WEBHOOK_SECRET);
  if ("error" in verified) {
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }
  const event = verified.data;

  // Account-context seam. On Connect, `event.account` is the connected account
  // id (`acct_...`) the event originated from; on platform events it is absent.
  // In V1 (single-tenant, platform-only) it is always null, so every live read
  // below acts as the platform account — identical to today. When Connect
  // webhooks arrive, this line already routes each event to its account with no
  // other change to the handler.
  const ctx: StripeAccountContext = {
    stripeAccountId: event.account ?? null,
  };

  let payload: Record<string, unknown> | null;
  try {
    const service = getServiceClient();
    payload = await resolvePayload(stripe, service, event, ctx);

    if (payload) {
      const { error } = await service.rpc("apply_stripe_event", {
        p_event_id: event.id,
        p_type: event.type,
        p_payload: payload,
      });
      if (error) {
        // Do NOT swallow — return 5xx so Stripe retries.
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook handler failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
