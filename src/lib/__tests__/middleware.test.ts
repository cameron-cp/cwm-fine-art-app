import { describe, expect, it } from "vitest";
import { createRouteMatcher } from "@clerk/nextjs/server";
import { isPublicRoute } from "@/middleware";

// The middleware is the SOLE auth gate — (app)/layout.tsx has no auth.protect().
// So the public-route list must expose ONLY the token-gated collector surface and
// nothing else. The load-bearing bug this guards against: an un-anchored
// "/room(.*)" pattern ALSO matches "/rooms", "/rooms/new", and "/api/rooms/[id]/pdf"
// (the dealer curation UI + the Clerk-gated PDF route), silently making the whole
// dealer feature public. The shipped patterns must be slash-anchored "/room/(.*)".

// createRouteMatcher matches against req.nextUrl.pathname (see Clerk's routeMatcher).
const req = (pathname: string) => ({ nextUrl: { pathname } }) as never;

describe("middleware public-route anchoring (the real shipped matcher)", () => {
  it("makes ONLY the tokenized collector routes public", () => {
    // Public: a per-recipient room and its event beacon.
    expect(isPublicRoute(req("/room/abc123token"))).toBe(true);
    expect(isPublicRoute(req("/api/room/abc123token/event"))).toBe(true);
  });

  it("keeps every dealer route PROTECTED — the /room(.*) collision regression", () => {
    // If someone reverts the patterns to the un-anchored "/room(.*)" /
    // "/api/room(.*)", each of these flips to `true` and the test fails — which is
    // exactly the leak we must never ship (dealer UI + PDF export going public).
    expect(isPublicRoute(req("/rooms"))).toBe(false);
    expect(isPublicRoute(req("/rooms/new"))).toBe(false);
    expect(isPublicRoute(req("/rooms/some-uuid"))).toBe(false);
    expect(isPublicRoute(req("/api/rooms/some-uuid/pdf"))).toBe(false);
  });

  it("proves the collision is real: un-anchored /room(.*) WOULD leak /rooms", () => {
    // This is the mistake, reproduced in isolation so the reason for the anchor is
    // documented and falsifiable — the un-anchored form matches the dealer list.
    const unanchored = createRouteMatcher(["/room(.*)", "/api/room(.*)"]);
    expect(unanchored(req("/rooms"))).toBe(true); // the leak
    expect(unanchored(req("/rooms/new"))).toBe(true); // the leak
    expect(unanchored(req("/api/rooms/x/pdf"))).toBe(true); // the leak
    // ...whereas our shipped anchored matcher does not:
    expect(isPublicRoute(req("/rooms"))).toBe(false);
  });

  it("makes the legal pages public — they exist for logged-out readers", () => {
    // These are the app's only indexable public surface. If they fall back under
    // auth.protect(), Google's OAuth verification reviewer and every collector
    // sent a link sees a redirect to sign-in instead of the policy.
    expect(isPublicRoute(req("/privacy"))).toBe(true);
    expect(isPublicRoute(req("/terms"))).toBe(true);
  });

  it("does not let the legal patterns widen into dealer routes", () => {
    // "/terms(.*)" is deliberately un-anchored (there is no /terms* dealer route
    // to collide with), but "/privacy" is exact — a "/privacy(.*)" would be the
    // same class of mistake as "/room(.*)" the day a /privacy-settings page for
    // the dealer gets added. These assertions fail if either widens.
    expect(isPublicRoute(req("/privacy-settings"))).toBe(false);
    expect(isPublicRoute(req("/privacy/export"))).toBe(false);
    expect(isPublicRoute(req("/settings"))).toBe(false);
    expect(isPublicRoute(req("/artworks"))).toBe(false);
  });
});
