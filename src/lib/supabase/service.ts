import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv, publicEnv } from "@/lib/env";

// Sessionless service-role client for server paths that run WITHOUT a Clerk
// session (the Stripe webhook is the caller here) and so cannot use
// getSupabaseServer(), which forwards a user JWT for RLS. It is also the only
// role permitted to call the apply_stripe_event RPC (execute is revoked from
// authenticated/anon in migration 0013).
//
// FAILS LOUD when the key is missing rather than silently falling back to the
// anon key — an anon fallback would see zero rows under RLS and read as "no
// data" instead of surfacing the misconfiguration. Same posture as the render
// pages' getRenderServiceClient.
export function getServiceClient(): SupabaseClient {
  const env = getServerEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for the Stripe webhook. Refusing to fall back to the anon key.",
    );
  }
  return createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
