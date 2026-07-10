"use client";

import { Button, Callout, Flex } from "@radix-ui/themes";
import { useState } from "react";

type Props = {
  artworkId: string;
  title: string;
  size?: "1" | "2" | "3";
  variant?: "solid" | "soft";
};

export function GenerateTearsheetButton({
  artworkId,
  title,
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
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(title)}-tearsheet.pdf`;
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
        <Callout.Root color="red" size="1">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}
    </Flex>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "artwork";
}
