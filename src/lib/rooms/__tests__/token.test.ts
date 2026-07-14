import { describe, expect, it } from "vitest";
import { checkRecipientToken, generateRoomToken } from "../token";

// The token IS the authorization for a logged-out collector, so the validity rule
// must fail closed. Each case pins a way a link stops working; if any flips, a
// revoked or expired collector could keep viewing (or writing events).

const T0 = new Date("2026-07-14T12:00:00Z");

describe("checkRecipientToken", () => {
  it("accepts a live link (not revoked, no expiry)", () => {
    expect(checkRecipientToken({ revoked_at: null, expires_at: null }, T0)).toEqual({ ok: true });
  });

  it("accepts a link whose expiry is still in the future", () => {
    const future = new Date(T0.getTime() + 60_000).toISOString();
    expect(checkRecipientToken({ revoked_at: null, expires_at: future }, T0).ok).toBe(true);
  });

  it("REJECTS a revoked link even if the expiry is still in the future", () => {
    // Revocation must dominate — the dealer pulling the link is immediate.
    const future = new Date(T0.getTime() + 60_000).toISOString();
    expect(
      checkRecipientToken({ revoked_at: "2026-07-14T11:00:00Z", expires_at: future }, T0),
    ).toEqual({ ok: false, reason: "revoked" });
  });

  it("REJECTS an expired link (expiry in the past, boundary = expired)", () => {
    const past = new Date(T0.getTime() - 1).toISOString();
    expect(checkRecipientToken({ revoked_at: null, expires_at: past }, T0)).toEqual({
      ok: false,
      reason: "expired",
    });
    // Exactly at expiry is treated as expired (<=), not still-valid.
    expect(checkRecipientToken({ revoked_at: null, expires_at: T0.toISOString() }, T0).ok).toBe(
      false,
    );
  });
});

describe("generateRoomToken", () => {
  it("mints a URL-safe ~32-char token with no padding (192 bits base64url)", () => {
    const t = generateRoomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // URL-safe alphabet, no + / =
    expect(t.length).toBe(32); // 24 bytes → 32 base64url chars
  });

  it("is unique across mints (a shared token would cross-attribute collectors)", () => {
    const set = new Set(Array.from({ length: 200 }, () => generateRoomToken()));
    expect(set.size).toBe(200);
  });
});
