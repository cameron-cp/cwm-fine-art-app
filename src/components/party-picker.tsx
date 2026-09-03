"use client";

import { Button, Dialog, Flex, Select, Text } from "@radix-ui/themes";
import { useState } from "react";
import { ContactForm } from "@/app/(app)/contacts/contact-form";

export type PartyOption = {
  id: string;
  display_name: string;
  email: string | null;
};

// Merge contacts created during this session into the list the server rendered.
// De-duped by id and sorted the way the server orders them, so the contact she
// just made lands where she'd look for it rather than at the bottom. Same
// contract as mergeArtistOptions — see artworks/artist-picker.tsx.
export function mergePartyOptions(
  serverParties: PartyOption[],
  created: PartyOption[],
): PartyOption[] {
  const byId = new Map<string, PartyOption>();
  for (const party of [...serverParties, ...created]) byId.set(party.id, party);
  return Array.from(byId.values()).sort((a, b) =>
    a.display_name.localeCompare(b.display_name),
  );
}

type Props = {
  parties: PartyOption[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (party: PartyOption) => void;
  /** Rendered as the select's placeholder and the dialog's title. */
  label?: string;
  /** Offer an explicit empty choice (the attention contact is optional).
   *  Either way `onChange` reports a cleared field as "" — callers never see
   *  the internal sentinel. */
  clearable?: boolean;
  /** Hidden from the list — the payer can't also be its own attention contact. */
  excludeId?: string | null;
  ariaLabel?: string;
};

export const PARTY_PICKER_NONE = "__none__";

// A contact field that can create its own contact. Realizing mid-entry that the
// counterparty isn't in the system used to mean backing all the way out to
// /contacts and losing the retainer or invoice in progress; creation happens
// here in a vitrine overlay instead (see docs/design/design-system.md), so the
// host form is never navigated away from.
export function PartyPicker({
  parties,
  value,
  onChange,
  onCreated,
  label = "contact",
  clearable = false,
  excludeId = null,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const options = excludeId
    ? parties.filter((p) => p.id !== excludeId)
    : parties;

  return (
    <Flex direction="column" gap="2">
      <Flex gap="2" align="center">
        {/* Controlled with "" as the empty state, which Radix renders as the
            placeholder. Two wrong ways this was already tried:
              * `undefined` when empty — Radix then treats the Select as
                UNCONTROLLED, and the later value does not take, so creating a
                contact left the field still reading "Select…".
              * a "__none__" sentinel with no matching Item — Radix clears an
                unmatched value asynchronously, and that clear landed AFTER the
                new contact was selected, silently resetting the field.
            Only Select.Item values may not be empty; the root's may. */}
        <Select.Root
          value={value}
          onValueChange={(v) => onChange(v === PARTY_PICKER_NONE ? "" : v)}
        >
          <Select.Trigger
            placeholder={`Select ${label}…`}
            style={{ flexGrow: 1 }}
            aria-label={ariaLabel ?? label}
          />
          <Select.Content>
            {clearable && (
              <Select.Item value={PARTY_PICKER_NONE}>None</Select.Item>
            )}
            {options.map((p) => (
              <Select.Item key={p.id} value={p.id}>
                {p.display_name}
                {p.email ? "" : " (no email)"}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>

        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger>
            <Button type="button" variant="outline">
              New contact
            </Button>
          </Dialog.Trigger>
          {/* Radix Themes ships a drop shadow on dialog content; the system
              separates with a hairline + the dimmed ground instead. */}
          <Dialog.Content
            maxWidth="640px"
            style={{
              boxShadow: "none",
              border: "1px solid var(--rule)",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <Dialog.Title>New contact</Dialog.Title>
            <Dialog.Description size="2" color="gray" mb="4">
              Saved to your contacts straight away, then selected here. Set the
              type to Organization for a company or institution. Nothing
              you&apos;ve already typed is lost.
            </Dialog.Description>
            <ContactForm
              onCreated={(party) => {
                onCreated(party);
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Root>
      </Flex>

      {options.length === 0 && (
        <Text size="1" color="gray">
          No contacts yet — create the first one.
        </Text>
      )}
    </Flex>
  );
}
