"use client";

import { Button, Flex, Select } from "@radix-ui/themes";
import { Alert } from "@/components/alert";
import { useState, useTransition } from "react";
import { ArtworkForm } from "../../artwork-form";
import { createArtist } from "@/app/(app)/artists/actions";
import type { ArtworkInput } from "@/lib/schemas/artwork";
import type { ImportDraft } from "@/lib/schemas/import-draft";

type ArtistOption = { id: string; name: string };

type Props = {
  draft: ImportDraft;
  artists: ArtistOption[];
};

export function ImportReview({ draft, artists: initialArtists }: Props) {
  const [artists, setArtists] = useState<ArtistOption[]>(initialArtists);
  const [artistIdOverride, setArtistIdOverride] = useState<string>(
    draft.matched_artist_id ?? "",
  );
  const [creatingArtist, startCreatingArtist] = useTransition();
  const [creationError, setCreationError] = useState<string | null>(null);

  const initialValues: Partial<ArtworkInput> = {
    artist_id: draft.matched_artist_id ?? undefined,
    title: draft.title ?? "",
    year: draft.year,
    medium: draft.medium,
    signature_details: draft.signature_details,
    height_in: draft.height_in,
    width_in: draft.width_in,
    depth_in: draft.depth_in,
    edition: draft.edition,
    catalogue_raisonne: draft.catalogue_raisonne,
    provenance_lines: draft.provenance_lines.map((value) => ({ value })),
    literature: draft.literature,
  };

  const showCreateCallout =
    !artistIdOverride && draft.suggested_artist_name !== null;
  const candidates = draft.matched_artist_candidates;
  const showCandidateCallout = !artistIdOverride && candidates.length > 1;
  const showTitleWarning = draft.title === null;

  function handleCreateArtist() {
    if (!draft.suggested_artist_name) return;
    setCreationError(null);
    startCreatingArtist(async () => {
      const result = await createArtist({
        name: draft.suggested_artist_name as string,
        sort_name: null,
        birth_year: null,
        death_year: null,
        nationalities: [],
        bio: null,
        // PDF-imported artists get no authority linkage in this PR (see the ADR's
        // deferred list); the inline create flow is intentionally unchanged.
        canonical_artist_id: null,
      });
      if ("error" in result) {
        setCreationError(result.error);
        return;
      }
      const newArtist = {
        id: result.data.id,
        name: draft.suggested_artist_name as string,
      };
      setArtists((prev) =>
        [...prev, newArtist].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setArtistIdOverride(newArtist.id);
    });
  }

  return (
    <Flex direction="column" gap="4">
      {showTitleWarning && (
        <Alert tone="warning">
          Couldn&apos;t read a title from the PDF — please add one before saving.
        </Alert>
      )}

      {showCreateCallout && (
        <Alert tone="info">
          <Flex direction="column" gap="2">
            <div>
              No artist matches{" "}
              <strong>&ldquo;{draft.suggested_artist_name}&rdquo;</strong> in your
              inventory. Create them now?
            </div>
            {creationError && (
              <span className="text-[13px]" style={{ color: "var(--danger)" }}>
                {creationError}
              </span>
            )}
            <Flex gap="2">
              <Button size="2" onClick={handleCreateArtist} loading={creatingArtist}>
                Create artist &ldquo;{draft.suggested_artist_name}&rdquo;
              </Button>
            </Flex>
          </Flex>
        </Alert>
      )}

      {showCandidateCallout && (
        <Alert tone="warning">
          <Flex direction="column" gap="2">
            <div>Multiple artists match this name. Pick one:</div>
            <Select.Root
              onValueChange={(id) => setArtistIdOverride(id)}
            >
              <Select.Trigger placeholder="Choose an artist…" />
              <Select.Content>
                {candidates.map((c) => (
                  <Select.Item key={c.id} value={c.id}>
                    {c.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Flex>
        </Alert>
      )}

      <ArtworkForm
        artists={artists}
        hasPrimaryImage={false}
        initialValues={initialValues}
        artistIdOverride={artistIdOverride || undefined}
        submitLabel="Create artwork"
      />
    </Flex>
  );
}
