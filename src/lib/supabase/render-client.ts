import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv, publicEnv } from "@/lib/env";

// Service-role client for the token-gated PDF render pages. Unlike the old
// inline getServiceClient() in the tearsheet page, this FAILS LOUD if the
// service-role key is missing — a silent anon fallback would render a page with
// no rows (RLS) instead of surfacing the misconfiguration, and for invoices it
// would silently drop the wire/bank details. Never falls back to the anon key.
export function getRenderServiceClient(): SupabaseClient {
  const env = getServerEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to render PDFs. Refusing to fall back to the anon key.",
    );
  }
  return createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}
