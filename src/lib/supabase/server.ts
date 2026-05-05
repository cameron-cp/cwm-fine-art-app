import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

// Server-side Supabase client. Uses Clerk's third-party JWT integration:
// each request forwards the Clerk session token, and Supabase RLS reads it.
// Requires Clerk to be enabled as a Third-Party Auth provider in the Supabase dashboard.
export function getSupabaseServer() {
  return createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    async accessToken() {
      const { getToken } = await auth();
      return (await getToken()) ?? null;
    },
  });
}
