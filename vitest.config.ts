import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Wire the "@/*" path alias (from tsconfig) so tests can import app modules the
// same way the app does. Existing vault tests use relative imports and are
// unaffected.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Component tests opt into jsdom with a `@vitest-environment jsdom` docblock;
    // this file polyfills the layout APIs Radix primitives need there.
    setupFiles: ["./src/test/setup-dom.ts"],
    // env.ts parses public env at import time; unit tests that import app modules
    // (e.g. the authority lib) need these present. Dummy values — the integration
    // tests that talk to a real stack read their credentials from `supabase status`,
    // not from these, so they are unaffected.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "test-clerk-key",
      CLERK_SECRET_KEY: "test-clerk-secret",
    },
  },
});
