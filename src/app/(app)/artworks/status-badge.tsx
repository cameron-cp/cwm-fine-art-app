import { StatusTag, type StatusTone } from "@/components/status-tag";
import type { ArtworkStatus } from "@/lib/schemas/artwork";

const MAP: Record<ArtworkStatus, { tone: StatusTone; label: string }> = {
  available: { tone: "positive", label: "Available" },
  on_hold: { tone: "warning", label: "On hold" },
  sold: { tone: "muted", label: "Sold" },
};

export function StatusBadge({ status }: { status: ArtworkStatus }) {
  const { tone, label } = MAP[status];
  return <StatusTag tone={tone}>{label}</StatusTag>;
}
