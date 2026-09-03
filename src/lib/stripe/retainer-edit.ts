import type { RetainerInterval } from "@/lib/schemas/stripe";

// What an edit to an existing retainer actually has to do. Pure decision, so the
// rules are unit-testable without a Stripe key or a database.
//
// A retainer exists in one of two states, and an edit means something different
// in each:
//
//   * `incomplete` — the collector never finished the authorizing Checkout, so
//     there is no Stripe subscription yet. Nothing exists at Stripe TO edit; the
//     stub row is corrected locally and the (unchanged) Checkout link still
//     mints its price from the row when they eventually pay.
//   * active / past_due — a live subscription. Prices are immutable at Stripe,
//     so any change means minting a new price and swapping the subscription item.
//
// One rule, deliberately not three: if ANY of amount / cadence / description
// changed on a live subscription, mint a new price. Description alone could in
// principle be a metadata-only write, but the description IS the product name on
// the collector's next Stripe invoice — treating it as cosmetic would leave her
// records and their receipt disagreeing. Prices are free and immutable; minting
// one is the normal Stripe pattern, not a workaround.

export type RetainerEditMode = "noop" | "local" | "stripe";

export interface RetainerEditCurrent {
  stripe_subscription_id: string | null;
  amount_cents: number | null;
  billing_interval: RetainerInterval | null;
  description: string | null;
}

export interface RetainerEditNext {
  amount_cents: number;
  billing_interval: RetainerInterval;
  description: string;
}

export interface RetainerEditPlan {
  mode: RetainerEditMode;
  /** Field names that differ, for the confirmation copy and for tests. */
  changed: Array<"amount_cents" | "billing_interval" | "description">;
}

export function planRetainerEdit(
  current: RetainerEditCurrent,
  next: RetainerEditNext,
): RetainerEditPlan {
  const changed: RetainerEditPlan["changed"] = [];
  if (current.amount_cents !== next.amount_cents) changed.push("amount_cents");
  if (current.billing_interval !== next.billing_interval) {
    changed.push("billing_interval");
  }
  if ((current.description ?? "") !== next.description) {
    changed.push("description");
  }

  if (changed.length === 0) return { mode: "noop", changed };
  return {
    mode: current.stripe_subscription_id ? "stripe" : "local",
    changed,
  };
}
