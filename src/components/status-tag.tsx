import type { ReactNode } from "react";

// Design system: status is a semantic dot + uppercase word (never a candy pill).
// The palette rations chroma to sage / amber / ink — there is no danger red, so
// negative + warning states both read amber, and neutral states read ink-muted.
// See docs/design/design-system.md.

export type StatusTone = "positive" | "warning" | "muted";

const TONE_COLOR: Record<StatusTone, string> = {
  positive: "var(--sage)",
  warning: "var(--amber)",
  muted: "var(--ink-3)",
};

/** Map the Radix-ish color names our status metas already carry onto a tone. */
export function toneFromColor(color: string): StatusTone {
  if (color === "green" || color === "grass" || color === "jade") return "positive";
  if (["amber", "orange", "yellow", "red", "tomato", "ruby"].includes(color)) return "warning";
  return "muted";
}

export function StatusTag({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className="inline-flex items-center gap-[7px] whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.14em]"
      style={{ color }}
    >
      <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}
