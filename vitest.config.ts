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
    // Skip git worktrees checked out under .claude/ — they hold full copies of
    // this suite, and the integration tests there race the tracked ones for the
    // same local Postgres (duplicate-key failures on shared fixtures).
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
    // The *-rpc integration files all talk to ONE local Postgres, and several
    // assert on global state: invoice-rpc pins the next invoice number, so any
    // create_invoice from a file running beside it burns a number and fails the
    // assertion. Run files one at a time — correctness over a second of wall clock.
    fileParallelism: false,
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
