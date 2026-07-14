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
  // Separate from the tearsheet secret: the invoice render page exposes bank
  // ABA / account numbers, so a tearsheet-secret leak must not reach invoices.
  INVOICE_RENDER_SECRET: optionalSecret,
  // Gates the viewing-room PDF leave-behind render page (/room/render/[id]).
  // Separate secret from tearsheet/invoice so a leak is compartmentalized.
  VIEWING_ROOM_RENDER_SECRET: optionalSecret,
  ANTHROPIC_API_KEY: optionalSecret,
  // Resend. Sending is guarded on RESEND_API_KEY being present, so the app
  // runs fine without it (mirrors BROWSERLESS_API_KEY). EMAIL_FROM must be a
  // Resend-verified sender; "Name <addr@domain>" or a bare address both work.
  // EMAIL_REPLY_TO defaults replies to a real inbox (e.g. her Gmail) so a
  // collector's reply lands where she reads mail, not on the sending domain.
  RESEND_API_KEY: optionalSecret,
  EMAIL_FROM: optionalSecret,
  EMAIL_REPLY_TO: optionalSecret,
  // Stripe. Optional so the payments feature runs "dark" until configured
  // (mirrors RESEND_API_KEY/BROWSERLESS_API_KEY). No NEXT_PUBLIC_STRIPE_* key:
  // all card/bank entry is on Stripe-hosted pages, so only server secrets exist.
  // STRIPE_WEBHOOK_SECRET verifies the raw-body HMAC on the webhook route.
  STRIPE_SECRET_KEY: optionalSecret,
  STRIPE_WEBHOOK_SECRET: optionalSecret,
  // Wikimedia etiquette wants a descriptive User-Agent on the keyless authority
  // APIs (Wikidata/Getty). Optional — the authority lib has a safe default.
  AUTHORITY_USER_AGENT: optionalSecret,
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
    INVOICE_RENDER_SECRET: process.env.INVOICE_RENDER_SECRET,
    VIEWING_ROOM_RENDER_SECRET: process.env.VIEWING_ROOM_RENDER_SECRET,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    AUTHORITY_USER_AGENT: process.env.AUTHORITY_USER_AGENT,
  });
}
