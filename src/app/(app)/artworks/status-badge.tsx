import type { ArtworkStatus } from "@/lib/schemas/artwork";

// Design system: status is a semantic dot + uppercase word, never a candy pill.
// Colors are semantic tokens (sage/amber/ink), never the claret accent.
const MAP: Record<ArtworkStatus, { color: string; label: string }> = {
  available: { color: "var(--sage)", label: "Available" },
  on_hold: { color: "var(--amber)", label: "On hold" },
  sold: { color: "var(--ink-3)", label: "Sold" },
};

export function StatusBadge({ status }: { status: ArtworkStatus }) {
  const { color, label } = MAP[status];
  return (
    <span
      className="inline-flex items-center gap-[7px] whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.14em]"
      style={{ color }}
    >
      <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
