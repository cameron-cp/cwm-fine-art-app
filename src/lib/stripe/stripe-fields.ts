import type Stripe from "stripe";
import type { RetainerStatusInput } from "./reconcile";

// Small, defensive readers for Stripe object fields. Subscription period fields
// and the invoice→subscription link have shifted location across API versions,
// so these navigate `unknown` rather than trusting a fixed shape (no `any`).

export function unixToIso(n: number | null | undefined): string | null {
  return typeof n === "number" && n > 0 ? new Date(n * 1000).toISOString() : null;
}

export function readUnix(obj: unknown, key: string): number | null {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === "number" ? v : null;
  }
  return null;
}

export function readString(obj: unknown, key: string): string | null {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === "string" ? v : null;
  }
  return null;
}

export function idOf(
  v: string | { id: string } | null | undefined,
): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

export function mapSubStatus(status: string): RetainerStatusInput {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "incomplete";
  }
}

export interface SubscriptionFacts {
  subscriptionId: string;
  priceId: string | null;
  status: RetainerStatusInput;
  currentPeriodEnd: string | null;
}

// Reduce a (price-expanded) Subscription to the facts the retainer mirror needs.
export function subscriptionFacts(sub: Stripe.Subscription): SubscriptionFacts {
  return {
    subscriptionId: sub.id,
    priceId: sub.items.data[0]?.price?.id ?? null,
    status: mapSubStatus(sub.status),
    currentPeriodEnd: unixToIso(
      readUnix(sub.items.data[0], "current_period_end") ??
        readUnix(sub, "current_period_end"),
    ),
  };
}
