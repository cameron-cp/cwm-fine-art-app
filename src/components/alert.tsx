import type { ReactNode } from "react";

// Design system: transient alert / callout banner. One primitive, four tones,
// all on-palette (success=sage, warning=amber, error=functional-red, info=neutral).
// Quiet by design — a tone-colored left rule + glyph on a raised paper surface,
// never a saturated candy fill. See docs/design/design-system.md ("Alerts").

export type AlertTone = "info" | "success" | "warning" | "error";

const TONE: Record<AlertTone, { color: string; glyph: string }> = {
  info: { color: "var(--ink-3)", glyph: "i" },
  success: { color: "var(--sage)", glyph: "✓" },
  warning: { color: "var(--amber)", glyph: "!" },
  error: { color: "var(--danger)", glyph: "✕" },
};

export function Alert({
  tone = "info",
  className,
  children,
}: {
  tone?: AlertTone;
  className?: string;
  children: ReactNode;
}) {
  const { color, glyph } = TONE[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex gap-[10px] border border-[var(--rule)] bg-[var(--paper-2)] px-3 py-[10px] text-[13px] leading-snug text-[var(--ink-2)] ${className ?? ""}`}
      style={{ borderLeftColor: color, borderLeftWidth: 2 }}
    >
      <span aria-hidden className="select-none font-semibold leading-[1.5]" style={{ color }}>
        {glyph}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
