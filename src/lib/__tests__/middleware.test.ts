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
});
