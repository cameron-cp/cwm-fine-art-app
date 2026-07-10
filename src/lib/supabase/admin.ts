// Supabase service-role client. ONLY for the vault sync script (and its tests).
// NEVER import this from anything that runs in the browser, an API route, an
// RSC, a middleware, or any Next.js runtime. Service-role bypasses RLS.
//
// An ESLint no-restricted-imports rule (in eslint.config.mjs) blocks imports
// outside scripts/** and src/lib/vault/**, and the runtime guard below throws
// if this module is loaded in a Next.js / browser context.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("supabase admin client cannot be imported in a browser context");
}
if (process.env.NEXT_RUNTIME) {
  throw new Error(
    `supabase admin client cannot be imported in Next.js runtime (NEXT_RUNTIME=${process.env.NEXT_RUNTIME})`,
  );
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
