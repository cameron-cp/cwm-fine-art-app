"use client";

import {
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  IconButton,
  Select,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  buildRelationshipInput,
  directedRelationshipOptions,
  prefillDirectedOptionKey,
  relationshipPhrase,
  type PartyRelationshipWithParties,
} from "@/lib/schemas/party";
import {
  createRelationship,
  deleteRelationship,
  updateRelationship,
} from "./actions";

type PartyOption = { id: string; display_name: string };

type Props = {
  contactId: string;
  contactName: string;
  relationships: PartyRelationshipWithParties[];
  parties: PartyOption[];
};

// Draft state for the add/edit form. `otherPartyId` is empty ("") until picked on
// add, and fixed (display-only) on edit.
type Draft = {
  optionValue: string;
  otherPartyId: string;
  valid_from: string;
  valid_to: string;
  notes: string;
};

function emptyDraft(defaultOption: string): Draft {
  return {
    optionValue: defaultOption,
    otherPartyId: "",
    valid_from: "",
    valid_to: "",
    notes: "",
  };
}

export function ContactRelationships({
  contactId,
  contactName,
  relationships,
  parties,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // null = not adding; "new" = add form open; otherwise the id of the row being edited.
  const [mode, setMode] = useState<"idle" | "new" | string>("idle");
  const options = directedRelationshipOptions(contactName);
  const [draft, setDraft] = useState<Draft>(emptyDraft(options[0].value));

  function openAdd() {
    setError(null);
    setDraft(emptyDraft(options[0].value));
    setMode("new");
  }

  function openEdit(rel: PartyRelationshipWithParties) {
    setError(null);
    const otherPartyId =
      rel.from_party_id === contactId ? rel.to_party_id : rel.from_party_id;
    setDraft({
      optionValue: prefillDirectedOptionKey(rel, contactId),
      otherPartyId,
      valid_from: rel.valid_from ?? "",
      valid_to: rel.valid_to ?? "",
      notes: rel.notes ?? "",
    });
    setMode(rel.id);
  }

  function close() {
    setMode("idle");
    setError(null);
  }

  function submit() {
    if (!draft.otherPartyId) {
      setError("Pick a contact for the other side of the relationship.");
      return;
    }
    const edge = buildRelationshipInput(
      contactId,
      draft.optionValue,
      draft.otherPartyId,
    );
    const payload = {
      ...edge,
      valid_from: draft.valid_from,
      valid_to: draft.valid_to,
      notes: draft.notes,
    };
    setError(null);
    startTransition(async () => {
      const result =
        mode === "new"
          ? await createRelationship(payload)
          : await updateRelationship(mode, payload);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  function onDelete(rel: PartyRelationshipWithParties) {
    const contactIsFrom = rel.from_party_id === contactId;
    const otherName =
      (contactIsFrom ? rel.to_party : rel.from_party)?.display_name ?? "this contact";
    if (!confirm(`Delete relationship with ${otherName}?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteRelationship(rel.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  // The fixed other-party name shown when editing (counterparty is not editable).
  const editingOtherName =
    mode !== "new" && mode !== "idle"
      ? (parties.find((p) => p.id === draft.otherPartyId)?.display_name ?? "—")
      : null;

  return (
    <Flex direction="column" gap="3" mt="7">
      <Flex justify="between" align="center">
        <Heading size="4">Relationships</Heading>
        {mode === "idle" && (
          <Button variant="soft" size="1" onClick={openAdd}>
            Add relationship
          </Button>
        )}
      </Flex>

      {error && (
        <Callout.Root color="red">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {relationships.length === 0 && mode === "idle" ? (
        <Text color="gray" size="2">
          No relationships recorded yet. Add who this contact works for, advises,
          or represents.
        </Text>
      ) : (
        <Flex direction="column" gap="2">
          {relationships.map((rel) => {
            if (mode === rel.id) {
              return (
                <RelationshipForm
                  key={rel.id}
                  draft={draft}
                  setDraft={setDraft}
                  options={options}
                  parties={parties}
                  lockedOtherName={editingOtherName}
                  pending={pending}
                  onSubmit={submit}
                  onCancel={close}
                  submitLabel="Save changes"
                />
              );
            }
            const contactIsFrom = rel.from_party_id === contactId;
            const otherName =
              (contactIsFrom ? rel.to_party : rel.from_party)?.display_name ?? "—";
            const phrase = relationshipPhrase(
              rel.type,
              contactIsFrom,
              otherName,
              contactName,
            );
            const span =
              rel.valid_from || rel.valid_to
                ? ` (${rel.valid_from ?? "…"}–${rel.valid_to ?? "present"})`
                : "";
            return (
              <Card key={rel.id}>
                <Flex justify="between" align="center" gap="3">
                  <Flex direction="column" gap="1">
                    <Text size="2">
                      {phrase}
                      {span}
                    </Text>
                    {rel.notes && (
                      <Text size="1" color="gray">
                        {rel.notes}
                      </Text>
                    )}
                  </Flex>
                  <Flex gap="2" flexShrink="0">
                    <Button
                      variant="ghost"
                      size="1"
                      onClick={() => openEdit(rel)}
                      disabled={pending}
                    >
                      Edit
                    </Button>
                    <IconButton
                      variant="ghost"
                      color="red"
                      size="1"
                      onClick={() => onDelete(rel)}
                      disabled={pending}
                    >
                      ✕
                    </IconButton>
                  </Flex>
                </Flex>
              </Card>
            );
          })}
        </Flex>
      )}

      {mode === "new" && (
        <RelationshipForm
          draft={draft}
          setDraft={setDraft}
          options={options}
          parties={parties}
          lockedOtherName={null}
          pending={pending}
          onSubmit={submit}
          onCancel={close}
          submitLabel="Add relationship"
        />
      )}
    </Flex>
  );
}

function RelationshipForm({
  draft,
  setDraft,
  options,
  parties,
  lockedOtherName,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  options: ReturnType<typeof directedRelationshipOptions>;
  parties: PartyOption[];
  lockedOtherName: string | null; // set = editing, counterparty fixed
  pending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <Card>
      <Flex direction="column" gap="3">
        <Field label="Relationship">
          <Select.Root
            value={draft.optionValue}
            onValueChange={(v) => setDraft({ ...draft, optionValue: v })}
          >
            <Select.Trigger />
            <Select.Content>
              {options.map((o) => (
                <Select.Item key={o.value} value={o.value}>
                  {o.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Field>

        <Field label="Other contact">
          {lockedOtherName !== null ? (
            <Text size="2" color="gray">
              {lockedOtherName} — to change who, delete and re-add.
            </Text>
          ) : (
            <Select.Root
              value={draft.otherPartyId || undefined}
              onValueChange={(v) => setDraft({ ...draft, otherPartyId: v })}
            >
              <Select.Trigger placeholder="Pick a contact" />
              <Select.Content>
                {parties.map((p) => (
                  <Select.Item key={p.id} value={p.id}>
                    {p.display_name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          )}
        </Field>

        <Flex gap="3">
          <Field label="From (optional)">
            <TextField.Root
              type="date"
              value={draft.valid_from}
              onChange={(e) => setDraft({ ...draft, valid_from: e.target.value })}
            />
          </Field>
          <Field label="To (optional)">
            <TextField.Root
              type="date"
              value={draft.valid_to}
              onChange={(e) => setDraft({ ...draft, valid_to: e.target.value })}
            />
          </Field>
        </Flex>

        <Field label="Notes (optional)">
          <TextArea
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            rows={2}
            placeholder="Anything worth remembering about this connection"
          />
        </Field>

        <Flex gap="3">
          <Button onClick={onSubmit} loading={pending}>
            {submitLabel}
          </Button>
          <Button variant="soft" color="gray" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}

// Local label+error wrapper — the app's per-form convention (copied, not shared;
// see the note in the plan's Files section).
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Flex direction="column" gap="1" flexGrow="1">
      <Text as="label" size="2" weight="medium">
        {label}
      </Text>
      {children}
    </Flex>
  );
}
