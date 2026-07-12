import { z } from "zod";

// Shared Zod coercers for form inputs. Extracted from artwork.ts so invoices and
// parties reuse the exact same empty-string / money / year handling (single
// source of truth).

// "" | null | undefined → null; otherwise a trimmed non-empty string.
export const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().min(1).nullable(),
);

// Bare domain / path → https:// URL; blank → null. Lets a user paste
// "gagosian.com" or "linkedin.com/in/x" without the scheme and still get a valid URL.
export function normalizeUrl(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (t === "") return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

// "" → null; otherwise a valid (scheme-normalized) URL.
export const optionalUrl = z.preprocess(
  normalizeUrl,
  z.string().url("Enter a valid URL").nullable(),
);

// "" | null | undefined → null; otherwise a UUID. For nullable FK selects (a Radix
// Select resolves its "__none__" sentinel to null before this ever sees it).
export const optionalUuid = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().uuid().nullable(),
);

// "" | null | undefined → null; otherwise a YYYY-MM-DD string (what <input type="date">
// emits). Validates shape only — Postgres `date` rejects an invalid calendar date on write.
export const optionalDate = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
    .nullable(),
);

// "" → null; otherwise an integer year.
export const optionalYear = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().min(1).max(3000).nullable(),
);

// "1,200" | "1200.50" | "$1,200" → integer cents; blank/invalid → null.
function toCentsOrNull(v: unknown): number | null | unknown {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "number") return Math.round(v * 100);
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.]/g, "");
    if (cleaned === "") return null;
    const num = Number(cleaned);
    if (!Number.isFinite(num)) return null;
    return Math.round(num * 100);
  }
  return v;
}

// Optional money field (blank allowed) → integer cents or null.
export const optionalPriceCents = z.preprocess(
  toCentsOrNull,
  z.number().int().min(0).nullable(),
);

// Required money field (e.g. a line-item amount) → integer cents; blank fails.
export const requiredPriceCents = z.preprocess(
  toCentsOrNull,
  z.number({ message: "Amount is required" }).int().min(0),
);
