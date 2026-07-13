"use client";

import { Box, Card, Flex, Spinner, Text, TextField } from "@radix-ui/themes";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  AuthorityCandidate,
  GettyStatus,
  ResolvedArtistFields,
} from "@/lib/schemas/authority";

export type ResolvedPayload = {
  canonicalArtistId: string;
  fields: ResolvedArtistFields;
  getty: GettyStatus;
};

type Props = { onResolved: (payload: ResolvedPayload) => void };

// Debounce a value by `ms`. First real use of a debounce in the app (the codebase
// had only a static <datalist> before this).
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

async function fetchCandidates(q: string): Promise<AuthorityCandidate[]> {
  const res = await fetch(`/api/artists/authority/search?q=${encodeURIComponent(q)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Search failed");
  return json.data as AuthorityCandidate[];
}

async function resolveQid(qid: string): Promise<ResolvedPayload> {
  const res = await fetch("/api/artists/authority/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qid }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Could not load that artist");
  return json.data as ResolvedPayload;
}

export function ArtistAuthorityPicker({ onResolved }: Props) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedQ = useDebounced(input.trim(), 250);
  const boxRef = useRef<HTMLDivElement>(null);

  // Keyed on the DEBOUNCED string, so React Query dedupes per keystroke and a
  // slow earlier request can never overwrite the latest results (B4).
  const search = useQuery({
    queryKey: ["artist-authority-search", debouncedQ],
    queryFn: () => fetchCandidates(debouncedQ),
    enabled: debouncedQ.length >= 2,
    staleTime: 60_000,
  });

  const resolve = useMutation({
    mutationFn: resolveQid,
    onSuccess: (payload) => {
      onResolved(payload);
      setInput("");
      setOpen(false);
    },
  });

  // Close the results panel on an outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const candidates = search.data ?? [];
  const showPanel = open && debouncedQ.length >= 2;

  return (
    <Box position="relative" ref={boxRef}>
      <TextField.Root
        value={input}
        placeholder="Search Wikidata / Getty — e.g. Gerhard Richter"
        onChange={(e) => {
          setInput(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      >
        <TextField.Slot side="right">
          {(search.isFetching || resolve.isPending) && <Spinner />}
        </TextField.Slot>
      </TextField.Root>

      {showPanel && (
        <Card
          size="1"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {search.isError && (
            <Text size="1" color="red" as="p">
              {(search.error as Error).message}
            </Text>
          )}
          {!search.isError && !search.isFetching && candidates.length === 0 && (
            <Text size="1" color="gray" as="p">
              No matches.
            </Text>
          )}
          <Flex direction="column">
            {candidates.map((c) => (
              <button
                key={c.qid}
                type="button"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate(c.qid)}
                className="cursor-pointer"
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  background: "transparent",
                  border: "none",
                  borderRadius: 6,
                }}
              >
                <Text size="2" weight="medium" as="div">
                  {c.label}
                </Text>
                {c.description && (
                  <Text size="1" color="gray" as="div">
                    {c.description}
                  </Text>
                )}
              </button>
            ))}
          </Flex>
        </Card>
      )}

      {resolve.isError && (
        <Text size="1" color="red" as="p" mt="1">
          {(resolve.error as Error).message}
        </Text>
      )}
      {resolve.isSuccess && resolve.data.getty !== "ok" && (
        <Text size="1" color="amber" as="p" mt="1">
          {resolve.data.getty === "no_ulan"
            ? "No Getty ULAN record for this artist — using Wikidata only."
            : "Getty was unavailable — prefilled from Wikidata only. Re-run later to fill gaps."}
        </Text>
      )}
    </Box>
  );
}
