import { beforeEach, describe, expect, it } from "vitest";
import { __resetThrottle, throttleToken } from "../throttle";

// The per-token throttle is the only rate limit on the public surface. It must
// allow a legit page load's burst of events but bound a forged flood, and it must
// reset each window so a normal repeat visit isn't punished.

const MAX = 300;

beforeEach(() => __resetThrottle());

describe("throttleToken", () => {
  it("allows a full page-load burst under the per-minute cap", () => {
    let ok = true;
    for (let i = 0; i < MAX; i++) ok = ok && throttleToken("tok", 1000).ok;
    expect(ok).toBe(true);
  });

  it("blocks the request that exceeds the cap within the window", () => {
    for (let i = 0; i < MAX; i++) throttleToken("tok", 1000);
    expect(throttleToken("tok", 1000)).toEqual({ ok: false, retryAfterMs: 60_000 });
  });

  it("counts each token independently (one collector's flood can't lock out another)", () => {
    for (let i = 0; i < MAX + 5; i++) throttleToken("flooder", 1000);
    expect(throttleToken("other", 1000).ok).toBe(true);
  });

  it("resets after the window elapses (a later legitimate visit is allowed)", () => {
    for (let i = 0; i < MAX; i++) throttleToken("tok", 1000);
    expect(throttleToken("tok", 1000).ok).toBe(false);
    // 60s later → fresh window.
    expect(throttleToken("tok", 1000 + 60_000).ok).toBe(true);
  });
});
