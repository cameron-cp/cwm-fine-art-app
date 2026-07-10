import { Badge } from "@radix-ui/themes";
import type { ArtworkStatus } from "@/lib/schemas/artwork";

const MAP: Record<ArtworkStatus, { color: "green" | "amber" | "gray"; label: string }> = {
  available: { color: "green", label: "Available" },
  on_hold: { color: "amber", label: "On hold" },
  sold: { color: "gray", label: "Sold" },
};

export function StatusBadge({ status }: { status: ArtworkStatus }) {
  const { color, label } = MAP[status];
  return (
    <Badge color={color} variant="soft">
      {label}
    </Badge>
  );
}
