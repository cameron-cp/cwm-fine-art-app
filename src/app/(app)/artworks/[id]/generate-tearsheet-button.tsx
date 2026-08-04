"use client";

import { Button, Flex } from "@radix-ui/themes";
import { useState } from "react";
import { Alert } from "@/components/alert";
import { parseContentDispositionFilename } from "@/lib/pdf/filename";

type Props = {
  artworkId: string;
  size?: "1" | "2" | "3";
  variant?: "solid" | "soft" | "outline";
};

export function GenerateTearsheetButton({
  artworkId,
  size = "3",
  variant = "solid",
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/tearsheet/${artworkId}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Tearsheet failed (${res.status})`);
      }
      // The server names the file ("Picasso, Pablo, Homme au béret basque, 1946 -
      // Tearsheet.pdf") so the accents survive; the old client-side slug turned
      // "béret" into "b-ret".
      const named =
        parseContentDispositionFilename(res.headers.get("content-disposition")) ??
        "Tearsheet.pdf";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = named;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tearsheet failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Flex direction="column" gap="2">
      <Button onClick={onClick} loading={pending} size={size} variant={variant}>
        Generate Tearsheet
      </Button>
      {error && (
        <Alert tone="error">{error}</Alert>
      )}
    </Flex>
  );
}
