// The effective date shown on /privacy and /terms.
//
// Deliberately a hand-edited constant, NOT a build date: redeploying the app for
// an unrelated reason must never claim the policy changed. Bump this only when
// the wording of a legal page actually changes — a stale-looking date is honest,
// a date that moves on every deploy is not.
//
// ISO 8601, interpreted as UTC so the rendered day is identical everywhere.
export const LEGAL_LAST_UPDATED = "2026-09-04";

/** "2026-09-03" -> "September 3, 2026". UTC-pinned so server and client agree. */
export function formatLegalDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
