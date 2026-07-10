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
});
