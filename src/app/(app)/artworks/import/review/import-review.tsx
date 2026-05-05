"use client";

import {
  Button,
  Callout,
  Flex,
  Select,
  Text,
} from "@radix-ui/themes";
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
        birth_year: null,
        death_year: null,
        nationality: null,
        bio: null,
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
        <Callout.Root color="amber">
          <Callout.Text>
            Couldn't read a title from the PDF — please add one before saving.
          </Callout.Text>
        </Callout.Root>
      )}

      {showCreateCallout && (
        <Callout.Root color="blue">
          <Flex direction="column" gap="2">
            <Callout.Text>
              No artist matches{" "}
              <strong>&ldquo;{draft.suggested_artist_name}&rdquo;</strong> in
              your inventory. Create them now?
            </Callout.Text>
            {creationError && (
              <Text color="red" size="2">
                {creationError}
              </Text>
            )}
            <Flex gap="2">
              <Button
                size="2"
                onClick={handleCreateArtist}
                loading={creatingArtist}
              >
                Create artist &ldquo;{draft.suggested_artist_name}&rdquo;
              </Button>
            </Flex>
          </Flex>
        </Callout.Root>
      )}

      {showCandidateCallout && (
        <Callout.Root color="amber">
          <Flex direction="column" gap="2">
            <Callout.Text>
              Multiple artists match this name. Pick one:
            </Callout.Text>
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
        </Callout.Root>
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
