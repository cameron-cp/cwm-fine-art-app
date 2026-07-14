import { randomBytes } from "node:crypto";

// The recipient link is a capability URL: possession of the opaque token IS the
// authorization. 192 bits of entropy, URL-safe, ~32 chars — NOT a UUID (a UUID is
// only 122 bits and is often assumed guessable/enumerable). Minted once per
// invited collector so every view attributes to a named CRM contact.
export function generateRoomToken(): string {
  return randomBytes(24).toString("base64url");
}

export type TokenCheck =
  | { ok: true }
  | { ok: false; reason: "revoked" | "expired" };

// The single validity rule, shared by the page render AND every event write, so a
// stale open tab can't keep writing after the dealer revokes (the event route
// re-runs this on every POST, not just at page load). Pure + injectable clock so
// it is unit-testable without a DB. "unknown token" is the caller's concern — a
// missing row never reaches this function.
export function checkRecipientToken(
  r: { revoked_at: string | null; expires_at: string | null },
  now: Date = new Date(),
): TokenCheck {
  if (r.revoked_at) return { ok: false, reason: "revoked" };
  if (r.expires_at && new Date(r.expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}
