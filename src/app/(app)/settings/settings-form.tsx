"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Callout,
  Flex,
  Heading,
  IconButton,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import {
  invoiceSettingsSchema,
  type InvoiceSettings,
  type InvoiceSettingsFormInput,
  type InvoiceSettingsFormValues,
} from "@/lib/schemas/invoice";
import { updateInvoiceSettings } from "./actions";

export function SettingsForm({ settings }: { settings: InvoiceSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<InvoiceSettingsFormInput, unknown, InvoiceSettingsFormValues>({
    resolver: zodResolver(invoiceSettingsSchema),
    defaultValues: {
      business_name: settings.business_name,
      business_legal_name: settings.business_legal_name,
      business_address: settings.business_address,
      business_phone: settings.business_phone,
      business_email: settings.business_email,
      remittance_intro: settings.remittance_intro,
      remittance_beneficiary: settings.remittance_beneficiary,
      remittance_bank: settings.remittance_bank,
      remittance_aba: settings.remittance_aba,
      remittance_account: settings.remittance_account,
      payment_terms_default: settings.payment_terms_default,
      payment_terms_statement: settings.payment_terms_statement,
      terms_intro: settings.terms_intro,
      terms_conditions: settings.terms_conditions,
      invoice_prefix: settings.invoice_prefix,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "terms_conditions",
  });

  function onSubmit(values: InvoiceSettingsFormValues) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateInvoiceSettings(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Flex direction="column" gap="5" maxWidth="640px">
        {error && (
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}
        {saved && (
          <Callout.Root color="green">
            <Callout.Text>Settings saved.</Callout.Text>
          </Callout.Root>
        )}

        <Heading size="4">Business</Heading>
        <Field label="Business name" error={errors.business_name?.message}>
          <TextField.Root {...register("business_name")} />
        </Field>
        <Field label="Legal name (footer / beneficiary)" error={errors.business_legal_name?.message}>
          <TextField.Root {...register("business_legal_name")} />
        </Field>
        <Field label="Address" error={errors.business_address?.message}>
          <TextArea {...register("business_address")} rows={2} />
        </Field>
        <Flex gap="3">
          <Field label="Phone" error={errors.business_phone?.message}>
            <TextField.Root {...register("business_phone")} />
          </Field>
          <Field label="Email" error={errors.business_email?.message}>
            <TextField.Root {...register("business_email")} />
          </Field>
        </Flex>

        <Heading size="4" mt="2">Remittance</Heading>
        <Field label="Intro" error={errors.remittance_intro?.message}>
          <TextArea {...register("remittance_intro")} rows={2} />
        </Field>
        <Flex gap="3">
          <Field label="Beneficiary" error={errors.remittance_beneficiary?.message}>
            <TextField.Root {...register("remittance_beneficiary")} />
          </Field>
          <Field label="Bank" error={errors.remittance_bank?.message}>
            <TextField.Root {...register("remittance_bank")} placeholder="Bank name & branch" />
          </Field>
        </Flex>
        <Flex gap="3">
          <Field label="ABA / Routing" error={errors.remittance_aba?.message}>
            <TextField.Root {...register("remittance_aba")} />
          </Field>
          <Field label="Account No." error={errors.remittance_account?.message}>
            <TextField.Root {...register("remittance_account")} />
          </Field>
        </Flex>

        <Heading size="4" mt="2">Terms</Heading>
        <Flex gap="3">
          <Field label="Invoice prefix" error={errors.invoice_prefix?.message}>
            <TextField.Root {...register("invoice_prefix")} />
          </Field>
          <Field label="Payment terms default" error={errors.payment_terms_default?.message}>
            <TextField.Root {...register("payment_terms_default")} />
          </Field>
        </Flex>
        <Field label="Payment terms statement" error={errors.payment_terms_statement?.message}>
          <TextArea {...register("payment_terms_statement")} rows={2} />
        </Field>
        <Field label="T&C intro" error={errors.terms_intro?.message}>
          <TextArea {...register("terms_intro")} rows={2} />
        </Field>

        <Flex direction="column" gap="3">
          <Text as="label" size="2" weight="medium">Terms &amp; Conditions clauses</Text>
          {fields.map((f, i) => (
            <Flex key={f.id} direction="column" gap="2" className="border border-[var(--gray-a5)] rounded-3 p-3">
              <Flex justify="between" align="center">
                <Text size="1" color="gray">Clause {i + 1}</Text>
                <IconButton type="button" variant="soft" color="red" size="1" onClick={() => remove(i)}>
                  ✕
                </IconButton>
              </Flex>
              <TextField.Root placeholder="Title (e.g. Payment)" {...register(`terms_conditions.${i}.title` as const)} />
              {errors.terms_conditions?.[i]?.title && (
                <Text size="1" color="red">{errors.terms_conditions[i]?.title?.message}</Text>
              )}
              <TextArea placeholder="Body" rows={3} {...register(`terms_conditions.${i}.body` as const)} />
              {errors.terms_conditions?.[i]?.body && (
                <Text size="1" color="red">{errors.terms_conditions[i]?.body?.message}</Text>
              )}
            </Flex>
          ))}
          <Button type="button" variant="soft" onClick={() => append({ title: "", body: "" })}>
            Add clause
          </Button>
        </Flex>

        <Flex gap="3" mt="2">
          <Button type="submit" loading={pending}>Save settings</Button>
        </Flex>
      </Flex>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <Flex direction="column" gap="1" flexGrow="1">
      <Text as="label" size="2" weight="medium">{label}</Text>
      {children}
      {error && <Text size="1" color="red">{error}</Text>}
    </Flex>
  );
}
