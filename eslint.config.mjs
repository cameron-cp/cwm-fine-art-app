import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Block accidental imports of the Supabase service-role client. It's only
// allowed in scripts/** and src/lib/vault/** (and the file itself).
const SERVICE_ROLE_IMPORT_RULE = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "**/lib/supabase/admin",
              "**/lib/supabase/admin.ts",
              "@/lib/supabase/admin",
            ],
            message:
              "supabase admin client is service-role; only import it from scripts/** or src/lib/vault/**",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  SERVICE_ROLE_IMPORT_RULE,
  // Allow imports of admin.ts from sync code, the script entry, and the file itself.
  {
    files: [
      "scripts/**/*.{ts,tsx,js,mjs}",
      "src/lib/vault/**/*.{ts,tsx}",
      "src/lib/supabase/admin.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
