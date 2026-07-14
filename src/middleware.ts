import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Exported so middleware.test.ts can exercise the exact shipped pattern list
// (a regression guard against reintroducing the un-anchored /room(.*) collision).
export const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/tearsheet/render(.*)", // Browserless hits this with a shared-secret token
  "/invoice/render(.*)", // Browserless hits this with INVOICE_RENDER_SECRET
  "/api/stripe/webhook(.*)", // Stripe webhook; gated by raw-body HMAC (STRIPE_WEBHOOK_SECRET)
  // Viewing rooms — the app's first logged-out collector surface. MUST be
  // slash-anchored: "/room(.*)" would ALSO match "/rooms", "/rooms/new", and
  // "/api/rooms/[id]/pdf" (the dealer curation UI + the Clerk-gated PDF route),
  // making them public. "/room/(.*)" matches only /room/{token}. See
  // docs/decisions/0008-viewing-rooms.md and the middleware.test.ts regression.
  "/room/(.*)", // per-recipient collector room (DB token-gated)
  "/api/room/(.*)", // room event beacon (DB token-gated, revocation re-checked)
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
