"use client";

import { Button, Flex } from "@radix-ui/themes";
import { useState } from "react";
import { Alert } from "@/components/alert";

// Clerk-gated PDF leave-behind export. Mirrors GenerateTearsheetButton: POST the
// authenticated route, download the returned PDF blob.
export function RoomExportButton({ roomId }: { roomId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/pdf`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "viewing-room.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Flex direction="column" gap="2" align="end">
      <Button onClick={onClick} loading={pending} variant="outline" color="gray">
        Export PDF
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </Flex>
  );
}
