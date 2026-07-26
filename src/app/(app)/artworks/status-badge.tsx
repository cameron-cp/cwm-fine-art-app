import { StatusTag } from "@/components/status-tag";
import { ARTWORK_STATUS_META, type ArtworkStatus } from "@/lib/schemas/artwork";

export function StatusBadge({ status }: { status: ArtworkStatus }) {
  const { tone, label } = ARTWORK_STATUS_META[status];
  return <StatusTag tone={tone}>{label}</StatusTag>;
}
