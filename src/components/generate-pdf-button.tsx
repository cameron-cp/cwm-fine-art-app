"use client";

import { Button, Flex } from "@radix-ui/themes";
import { Alert } from "@/components/alert";
import { useState } from "react";

// Generic "generate a PDF" button: POSTs to an endpoint that streams a PDF,
// then triggers a browser download. Used by invoices; the tearsheet button is a
// thin wrapper today and should be unified onto this next (fast-follow).
type Props = {
  endpoint: string;
  filename: string;
  label?: string;
  size?: "1" | "2" | "3";
  variant?: "solid" | "soft";
};

export function GeneratePdfButton({
  endpoint,
  filename,
  label = "Generate PDF",
  size = "3",
  variant = "solid",
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {
          // non-JSON error body; keep the status message
        }
        setError(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <Flex direction="column" gap="2">
      <Button onClick={onClick} loading={pending} size={size} variant={variant}>
        {label}
      </Button>
      {error && (
        <Alert tone="error">{error}</Alert>
      )}
    </Flex>
  );
}
