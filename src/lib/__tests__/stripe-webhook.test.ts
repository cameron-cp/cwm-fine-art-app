import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { constructStripeEvent } from "@/lib/stripe/webhook";

// The webhook is the only automatic write path for money, so its signature
// boundary is non-negotiable: a tampered body must be rejected (→ route 400).
// We use Stripe's own test-header signer, so this exercises the real HMAC path,
// not a stub.

const stripe = new Stripe("sk_test_dummy", { apiVersion: "2026-06-24.dahlia" });
const secret = "whsec_test_secret_value";

function sign(payload: string): string {
  return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

describe("constructStripeEvent — HMAC boundary", () => {
  it("accepts a correctly signed payload", () => {
    const payload = JSON.stringify({
      id: "evt_ok",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    const res = constructStripeEvent(stripe, payload, sign(payload), secret);
    expect("data" in res).toBe(true);
    if ("data" in res) expect(res.data.id).toBe("evt_ok");
  });

  it("rejects a payload mutated by one byte AFTER signing", () => {
    const payload = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    const header = sign(payload);
    // Flip a byte: the signature no longer matches the body.
    const tampered = payload.replace('"evt_1"', '"evt_2"');
    const res = constructStripeEvent(stripe, tampered, header, secret);
    expect("error" in res).toBe(true);
  });

  it("rejects a signature made with the wrong secret", () => {
    const payload = JSON.stringify({ id: "evt_2", type: "x", data: { object: {} } });
    const wrong = new Stripe("sk_test_dummy", {
      apiVersion: "2026-06-24.dahlia",
    }).webhooks.generateTestHeaderString({ payload, secret: "whsec_wrong" });
    const res = constructStripeEvent(stripe, payload, wrong, secret);
    expect("error" in res).toBe(true);
  });

  it("rejects a missing signature header", () => {
    const res = constructStripeEvent(stripe, "{}", null, secret);
    expect("error" in res).toBe(true);
  });
});
