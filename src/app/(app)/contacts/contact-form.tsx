"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Callout,
  Checkbox,
  Flex,
  IconButton,
  RadioGroup,
  Select,
  Separator,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import {
  addressLabelSuggestions,
  ENTITY_TYPE_LABELS,
  entityTypes,
  PARTY_KIND_LABELS,
  PARTY_ROLE_LABELS,
  partyKinds,
  partyRoles,
  partySchema,
  type Party,
  type PartyAddressRow,
  type PartyFormInput,
  type PartyInput,
  type PartyRole,
} from "@/lib/schemas/party";
import { createParty, deleteParty, updateParty } from "./actions";

type Props = { party?: Party; roles?: PartyRole[]; addresses?: PartyAddressRow[] };

const NONE = "__none__";

// Clean globe for the phone country selector's "International" state. Replaces
// react-phone-number-input's default icon (a busy phone-over-globe composite that
// reads as two overlapping icons). Rendered inside .PhoneInputCountryIcon (3:2 box);
// preserveAspectRatio keeps the circle centered rather than stretched.
function GlobeIcon({ title, className }: { title?: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-hidden={title ? undefined : true}
      style={{ color: "var(--gray-10)" }}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M4.8 8.25h14.4M4.8 15.75h14.4" />
    </svg>
  );
}

const emptyAddress = (): NonNullable<PartyFormInput["addresses"]>[number] => ({
  label: "Residence",
  line1: "",
  line2: null,
  city: null,
  region: null,
  postal_code: null,
  country_code: null,
  is_primary: false,
});

export function ContactForm({ party, roles = [], addresses = [] }: Props) {
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
      entity_type: party?.entity_type ?? null,
      email: party?.email ?? null,
      phone: party?.phone ?? null,
      website_url: party?.website_url ?? null,
      linkedin_url: party?.linkedin_url ?? null,
      notes: party?.notes ?? null,
      roles,
      addresses: addresses.length
        ? addresses.map((a) => ({
            id: a.id,
            label: a.label,
            line1: a.line1,
            line2: a.line2,
            city: a.city,
            region: a.region,
            postal_code: a.postal_code,
            country_code: a.country_code,
            is_primary: a.is_primary,
          }))
        : [],
    },
  });

  const {
    fields: addressFields,
    append: appendAddress,
    remove: removeAddress,
  } = useFieldArray({ control, name: "addresses" });

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
      <Flex direction="column" gap="4" maxWidth="620px">
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

        <Flex gap="3">
          <Field label="Legal name" error={errors.legal_name?.message}>
            <TextField.Root
              {...register("legal_name")}
              placeholder="Full legal name, if different"
            />
          </Field>
          <Field label="Legal structure" error={errors.entity_type?.message}>
            <Controller
              control={control}
              name="entity_type"
              render={({ field }) => (
                <Select.Root
                  value={field.value ?? NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                >
                  <Select.Trigger placeholder="Not specified" />
                  <Select.Content>
                    <Select.Item value={NONE}>Not specified</Select.Item>
                    {entityTypes.map((t) => (
                      <Select.Item key={t} value={t}>
                        {ENTITY_TYPE_LABELS[t]}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              )}
            />
          </Field>
        </Flex>

        <Flex gap="3">
          <Field label="Email" error={errors.email?.message}>
            <TextField.Root {...register("email")} placeholder="name@example.com" />
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <PhoneInput
                  international
                  internationalIcon={GlobeIcon}
                  value={(field.value as string | null) ?? undefined}
                  onChange={(v) => field.onChange(v ?? null)}
                  placeholder="Enter phone number"
                />
              )}
            />
          </Field>
        </Flex>

        <Flex gap="3">
          <Field label="Website" error={errors.website_url?.message}>
            <TextField.Root
              {...register("website_url")}
              placeholder="example.com or company site"
            />
          </Field>
          <Field label="LinkedIn" error={errors.linkedin_url?.message}>
            <TextField.Root
              {...register("linkedin_url")}
              placeholder="linkedin.com/in/… or /company/…"
            />
          </Field>
        </Flex>

        <Separator size="4" />

        <Flex justify="between" align="center">
          <Text size="3" weight="medium">
            Addresses
          </Text>
          <Button
            type="button"
            variant="soft"
            size="1"
            onClick={() => appendAddress(emptyAddress())}
          >
            Add address
          </Button>
        </Flex>
        <Text size="1" color="gray">
          Add one per location — residence, office, storage, freeport. Mark the
          one to use by default.
        </Text>

        {addressFields.length === 0 && (
          <Text size="2" color="gray">
            No address yet.
          </Text>
        )}

        {addressFields.map((f, i) => (
          <Flex
            key={f.id}
            direction="column"
            gap="2"
            className="border border-[var(--rule)] p-3"
          >
            <Flex gap="3" align="end">
              <Field label="Label">
                <Controller
                  control={control}
                  name={`addresses.${i}.label` as const}
                  render={({ field }) => (
                    <Select.Root
                      value={(field.value as string | null) ?? "Other"}
                      onValueChange={field.onChange}
                    >
                      <Select.Trigger />
                      <Select.Content>
                        {addressLabelSuggestions.map((l) => (
                          <Select.Item key={l} value={l}>
                            {l}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                  )}
                />
              </Field>
              <Controller
                control={control}
                name="addresses"
                render={({ field }) => (
                  <Text as="label" size="2">
                    <Flex gap="2" align="center" pb="2">
                      <Checkbox
                        checked={field.value?.[i]?.is_primary ?? false}
                        onCheckedChange={(v) => {
                          // Primary is exclusive — checking one clears the rest.
                          field.onChange(
                            (field.value ?? []).map((a, idx) => ({
                              ...a,
                              is_primary: v === true && idx === i,
                            })),
                          );
                        }}
                      />
                      Primary
                    </Flex>
                  </Text>
                )}
              />
              <IconButton
                type="button"
                variant="soft"
                color="red"
                size="1"
                mb="2"
                onClick={() => removeAddress(i)}
              >
                ✕
              </IconButton>
            </Flex>

            <Field
              label="Street address"
              error={errors.addresses?.[i]?.line1?.message}
              required
            >
              <TextField.Root
                {...register(`addresses.${i}.line1` as const)}
                placeholder="Street and number"
              />
            </Field>
            <Field label="Address line 2">
              <TextField.Root
                {...register(`addresses.${i}.line2` as const)}
                placeholder="Apartment, suite, unit (optional)"
              />
            </Field>
            <Flex gap="3">
              <Field label="City">
                <TextField.Root {...register(`addresses.${i}.city` as const)} />
              </Field>
              <Field label="State / Region">
                <TextField.Root {...register(`addresses.${i}.region` as const)} />
              </Field>
              <Field label="Postal code">
                <TextField.Root {...register(`addresses.${i}.postal_code` as const)} />
              </Field>
            </Flex>
            <Field label="Country">
              <Controller
                control={control}
                name={`addresses.${i}.country_code` as const}
                render={({ field }) => (
                  <Select.Root
                    value={(field.value as string | null) ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                  >
                    <Select.Trigger placeholder="Select a country" />
                    <Select.Content>
                      <Select.Item value={NONE}>—</Select.Item>
                      {COUNTRY_OPTIONS.map((c) => (
                        <Select.Item key={c.code} value={c.code}>
                          {c.name}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                )}
              />
            </Field>
          </Flex>
        ))}

        <Separator size="4" />

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

