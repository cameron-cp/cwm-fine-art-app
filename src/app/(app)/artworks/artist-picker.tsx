"use client";

import { Button, Dialog, Flex, Select, Text } from "@radix-ui/themes";
import { useState } from "react";
import { ArtistForm } from "@/app/(app)/artists/artist-form";

export type ArtistOption = { id: string; name: string };

// Merge artists created during this session into the list the server rendered.
// De-duped by id (a refetch can hand back a locally-created artist) and sorted
// the same way the server orders them, so the option a dealer just made lands
// where she'd look for it rather than at the bottom.
export function mergeArtistOptions(
  serverArtists: ArtistOption[],
  created: ArtistOption[],
): ArtistOption[] {
  const byId = new Map<string, ArtistOption>();
  for (const artist of [...serverArtists, ...created]) byId.set(artist.id, artist);
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

type Props = {
  artists: ArtistOption[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (artist: ArtistOption) => void;
};

// The artwork form's Artist field. Realizing mid-entry that the artist doesn't
// exist yet used to mean abandoning the form, so creation happens here in a
// vitrine overlay (see docs/design/design-system.md) — the host form is never
// navigated away from and nothing typed is lost.
export function ArtistPicker({ artists, value, onChange, onCreated }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Flex direction="column" gap="2">
      <Flex gap="2" align="center">
        {artists.length > 0 && (
          <Select.Root value={value || undefined} onValueChange={onChange}>
            <Select.Trigger
              placeholder="Select artist…"
              style={{ flexGrow: 1 }}
              aria-label="Artist"
            />
            <Select.Content>
              {artists.map((a) => (
                <Select.Item key={a.id} value={a.id}>
                  {a.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        )}

        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger>
            <Button type="button" variant="outline">
              New artist
            </Button>
          </Dialog.Trigger>
          {/* Radix Themes ships a drop shadow on dialog content; the system
              separates with a hairline + the dimmed ground instead. */}
          <Dialog.Content
            maxWidth="600px"
            style={{
              boxShadow: "none",
              border: "1px solid var(--rule)",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <Dialog.Title>New artist</Dialog.Title>
            <Dialog.Description size="2" color="gray" mb="4">
              Saved to your artists straight away, then selected on the work
              you&apos;re entering. Nothing you&apos;ve already typed is lost.
            </Dialog.Description>
            <ArtistForm
              onCreated={(artist) => {
                onCreated(artist);
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Root>
      </Flex>

      {artists.length === 0 && (
        <Text size="1" color="gray">
          No artists yet — create the first one to file this work under.
        </Text>
      )}
    </Flex>
  );
}
