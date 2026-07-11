import { Resend } from "resend";
import { getServerEnv } from "@/lib/env";

// Lazy singleton, mirroring how the app treats other optional integrations:
// no key configured → no client, and the caller (sendEmail) turns that into a
// clean { error } instead of throwing at import time.
let client: Resend | null = null;

export function getResendClient(): Resend | null {
  const { RESEND_API_KEY } = getServerEnv();
  if (!RESEND_API_KEY) return null;
  if (!client) client = new Resend(RESEND_API_KEY);
  return client;
}
