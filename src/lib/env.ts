import { z } from "zod";

// Coerce empty strings (from blank .env entries) to undefined for optional fields.
const optionalSecret = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().min(1).optional(),
);

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  CLERK_SECRET_KEY: z.string().min(1),
  BROWSERLESS_API_KEY: optionalSecret,
  TEARSHEET_RENDER_SECRET: optionalSecret,
  ANTHROPIC_API_KEY: optionalSecret,
});

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

export function getServerEnv() {
  return serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    BROWSERLESS_API_KEY: process.env.BROWSERLESS_API_KEY,
    TEARSHEET_RENDER_SECRET: process.env.TEARSHEET_RENDER_SECRET,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  });
}
