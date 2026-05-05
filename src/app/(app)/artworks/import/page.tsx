"use client";

import {
  Box,
  Button,
  Callout,
  Container,
  Flex,
  Heading,
  Text,
} from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function ImportArtworkPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  function handleFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("That doesn't look like a PDF.");
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/artworks/import", {
          method: "POST",
          body: fd,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error ?? `Import failed (${res.status})`);
        }
        const draftId = body?.data?.draftId;
        if (!draftId) {
          throw new Error("Import succeeded but didn't return a draft id.");
        }
        router.push(`/artworks/import/review?d=${encodeURIComponent(draftId)}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
      }
    });
  }

  return (
    <Container size="3" py="6">
      <Heading size="7" mb="2">
        Import tearsheet
      </Heading>
      <Text size="2" color="gray" mb="5" as="p">
        Drop a PDF factsheet — Claude will read it and prefill an artwork form for
        you. Reading takes about 5–8 seconds.
      </Text>

      {error && (
        <Callout.Root color="red" mb="4">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <Box
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (pending) return;
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`rounded-3 border-2 border-dashed px-6 py-12 transition-colors ${
          dragActive
            ? "border-[var(--accent-9)] bg-[var(--accent-a3)]"
            : "border-[var(--gray-a6)]"
        } ${pending ? "opacity-60" : ""}`}
      >
        <Flex direction="column" align="center" gap="4">
          {pending ? (
            <>
              <Text size="3" weight="medium">
                Reading tearsheet…
              </Text>
              <Text size="2" color="gray">
                About 5–8 seconds. Don't close this tab.
              </Text>
            </>
          ) : (
            <>
              <Text size="3" weight="medium">
                Drop a PDF here
              </Text>
              <Text size="2" color="gray">
                or
              </Text>
              <label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
                <Button asChild variant="soft">
                  <span style={{ cursor: "pointer" }}>Choose a file…</span>
                </Button>
              </label>
              <Text size="1" color="gray" mt="3">
                Single PDF, up to 10 MB and 5 pages.
              </Text>
            </>
          )}
        </Flex>
      </Box>
    </Container>
  );
}
