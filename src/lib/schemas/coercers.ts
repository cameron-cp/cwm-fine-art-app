import { z } from "zod";

// Shared Zod coercers for form inputs. Extracted from artwork.ts so invoices and
// parties reuse the exact same empty-string / money / year handling (single
// source of truth).

// "" | null | undefined → null; otherwise a trimmed non-empty string.
export const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().min(1).nullable(),
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
