"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Callout,
  Checkbox,
  Flex,
  RadioGroup,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  PARTY_KIND_LABELS,
  PARTY_ROLE_LABELS,
  partyKinds,
  partyRoles,
  partySchema,
  type Party,
  type PartyFormInput,
  type PartyInput,
  type PartyRole,
} from "@/lib/schemas/party";
import { createParty, deleteParty, updateParty } from "./actions";

type Props = { party?: Party; roles?: PartyRole[] };

export function ContactForm({ party, roles = [] }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PartyFormInput, unknown, PartyInput>({
    resolver: zodResolver(partySchema),
    defaultValues: {
      kind: party?.kind ?? "person",
      display_name: party?.display_name ?? "",
      legal_name: party?.legal_name ?? null,
      email: party?.email ?? null,
      phone: party?.phone ?? null,
      address: party?.address ?? null,
      notes: party?.notes ?? null,
      roles,
    },
  });

  function onSubmit(values: PartyInput) {
    setError(null);
    startTransition(async () => {
      const result = party
        ? await updateParty(party.id, values)
        : await createParty(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(party ? `/contacts/${party.id}` : "/contacts");
      router.refresh();
    });
  }

  function onDelete() {
    if (!party) return;
    if (!confirm(`Delete ${party.display_name}?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteParty(party.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push("/contacts");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Flex direction="column" gap="4" maxWidth="560px">
        {error && (
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        <Field label="Type">
          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <RadioGroup.Root value={field.value} onValueChange={field.onChange}>
                <Flex gap="4">
                  {partyKinds.map((k) => (
                    <Text as="label" size="2" key={k}>
                      <Flex gap="2" align="center">
                        <RadioGroup.Item value={k} /> {PARTY_KIND_LABELS[k]}
                      </Flex>
                    </Text>
                  ))}
                </Flex>
              </RadioGroup.Root>
            )}
          />
        </Field>

        <Field label="Name" error={errors.display_name?.message} required>
          <TextField.Root
            {...register("display_name")}
            placeholder="e.g. Howard Rachofsky, or Gagosian Gallery"
          />
        </Field>

        <Field label="Legal name" error={errors.legal_name?.message}>
          <TextField.Root {...register("legal_name")} placeholder="Full legal name or LLC" />
        </Field>

        <Flex gap="3">
          <Field label="Email" error={errors.email?.message}>
            <TextField.Root {...register("email")} placeholder="name@example.com" />
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            <TextField.Root {...register("phone")} placeholder="+1 555 123 4567" />
          </Field>
        </Flex>

        <Field label="Address" error={errors.address?.message}>
          <TextArea {...register("address")} rows={3} placeholder="Street, City, State / Country, Postal Code" />
        </Field>

        <Field label="Roles">
          <Controller
            control={control}
            name="roles"
            render={({ field }) => (
              <Flex gap="3" wrap="wrap">
                {partyRoles.map((role) => {
                  const checked = field.value?.includes(role) ?? false;
                  return (
                    <Text as="label" size="2" key={role}>
                      <Flex gap="2" align="center">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const set = new Set(field.value ?? []);
                            if (v) set.add(role);
                            else set.delete(role);
                            field.onChange([...set]);
                          }}
                        />
                        {PARTY_ROLE_LABELS[role]}
                      </Flex>
                    </Text>
                  );
                })}
              </Flex>
            )}
          />
        </Field>

        <Field label="Notes" error={errors.notes?.message}>
          <TextArea {...register("notes")} rows={4} placeholder="Anything worth remembering" />
        </Field>

        <Flex gap="3" mt="2" justify="between">
          <Flex gap="3">
            <Button type="submit" loading={pending}>
              {party ? "Save changes" : "Create contact"}
            </Button>
            <Button type="button" variant="soft" color="gray" onClick={() => router.back()}>
              Cancel
            </Button>
          </Flex>
          {party && (
            <Button type="button" variant="soft" color="red" onClick={onDelete} loading={pending}>
              Delete
            </Button>
          )}
        </Flex>
      </Flex>
    </form>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Flex direction="column" gap="1" flexGrow="1">
      <Text as="label" size="2" weight="medium">
        {label}
        {required && <Text color="red"> *</Text>}
      </Text>
      {children}
      {error && (
        <Text size="1" color="red">
          {error}
        </Text>
      )}
    </Flex>
  );
}
