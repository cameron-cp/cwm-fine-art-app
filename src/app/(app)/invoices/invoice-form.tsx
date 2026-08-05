"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Flex,
  Heading,
  IconButton,
  Select,
  Separator,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { Alert } from "@/components/alert";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { formatAddress } from "@/lib/address";
import { countryName } from "@/lib/countries";
import { formatInvoiceMoney } from "@/lib/money";
import {
  CURRENCY_SYMBOLS,
  invoiceCurrencies,
  invoiceSchema,
  type InvoiceCurrency,
  type InvoiceFormInput,
  type InvoiceInput,
} from "@/lib/schemas/invoice";
import { createInvoice, updateInvoice } from "./actions";

export type ArtworkOption = {
  id: string;
  title: string;
  year: number | null;
  medium: string | null;
  edition: string | null;
  signature_details: string | null;
  catalogue_raisonne: string | null;
  provenance_lines: string[];
  price_cents: number | null;
  currency: string;
  artist_name: string | null;
  dimensions_text: string | null;
};

export type PartyAddressOption = {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  is_primary: boolean;
  position: number;
};

export type PartyOption = {
  id: string;
  display_name: string;
  legal_name: string | null;
  email: string | null;
  addresses: PartyAddressOption[];
};

type Props = {
  artworks: ArtworkOption[];
  parties: PartyOption[];
  invoice?: {
    id: string;
    values: InvoiceFormInput;
  };
};

// Parse a money input string to integer cents (mirrors the server coercer) for
// the live totals preview only. The server recomputes authoritatively.
function toCents(v: unknown): number {
  if (typeof v === "number") return Math.round(v * 100);
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.]/g, "");
    if (!cleaned) return 0;
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  return 0;
}

const NONE = "__none__";

const emptyLine = () => ({
  artwork_id: null,
  position: 0,
  artist_name: null,
  title: null,
  year: null,
  medium: null,
  dimensions_text: null,
  edition: null,
  signature_details: null,
  catalogue_raisonne: null,
  inventory_no: null,
  provenance_lines: [] as { value: string }[],
  amount_cents: "",
});

export function InvoiceForm({ artworks, parties, invoice }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<Record<number, string>>({});
  // Addresses for the currently-selected buyer, so the bill-to picker can offer
  // the residence / office / freeport etc. (collectors hold works in many places).
  const [buyerAddresses, setBuyerAddresses] = useState<PartyAddressOption[]>(
    () =>
      parties.find((p) => p.id === invoice?.values.buyer_party_id)?.addresses ??
      [],
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<InvoiceFormInput, unknown, InvoiceInput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: invoice?.values ?? {
      buyer_party_id: null,
      on_behalf_of_party_id: null,
      seller_party_id: null,
      bill_to_name: "",
      bill_to_attention: null,
      bill_to_address: null,
      bill_to_email: null,
      date_issued: new Date().toISOString().slice(0, 10),
      payment_terms: "Net 14",
      currency: "USD",
      ship_from: null,
      ship_to: null,
      shipping_cents: "",
      notes: null,
      line_items: [emptyLine()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "line_items" });

  const watchedLines = useWatch({ control, name: "line_items" });
  const watchedShipping = useWatch({ control, name: "shipping_cents" });
  const watchedCurrency = (useWatch({ control, name: "currency" }) ??
    "USD") as InvoiceCurrency;

  const totals = useMemo(() => {
    const subtotal = (watchedLines ?? []).reduce(
      (sum, li) => sum + toCents(li?.amount_cents),
      0,
    );
    const shipping = toCents(watchedShipping);
    return { subtotal, shipping, total: subtotal + shipping };
  }, [watchedLines, watchedShipping]);

  function onBuyerChange(id: string) {
    const partyId = id === NONE ? null : id;
    setValue("buyer_party_id", partyId);
    const party = parties.find((p) => p.id === partyId);
    setBuyerAddresses(party?.addresses ?? []);
    if (party) {
      // Prefill bill-to snapshot (editable afterward).
      setValue("bill_to_name", party.legal_name || party.display_name);
      if (party.email) setValue("bill_to_email", party.email);
      // Default the bill-to address to the primary/first (options.ts sorts it
      // first). She can switch to another location below or edit the text.
      const primary = party.addresses[0];
      if (primary) setValue("bill_to_address", formatAddress(primary));
    }
  }

  // Short one-line description for the address picker options.
  function addressSummary(a: PartyAddressOption): string {
    const parts = [a.city, a.region, countryName(a.country_code)].filter(Boolean);
    const where = parts.join(", ") || a.line1;
    return a.label ? `${a.label} — ${where}` : where;
  }

  function onPickArtwork(index: number, id: string) {
    const artwork = artworks.find((a) => a.id === id);
    if (!artwork) return;
    setValue(`line_items.${index}.artwork_id`, artwork.id);
    setValue(`line_items.${index}.artist_name`, artwork.artist_name);
    setValue(`line_items.${index}.title`, artwork.title);
    setValue(`line_items.${index}.year`, artwork.year);
    setValue(`line_items.${index}.medium`, artwork.medium);
    setValue(`line_items.${index}.dimensions_text`, artwork.dimensions_text);
    setValue(`line_items.${index}.edition`, artwork.edition);
    setValue(`line_items.${index}.signature_details`, artwork.signature_details);
    setValue(`line_items.${index}.catalogue_raisonne`, artwork.catalogue_raisonne);
    setValue(
      `line_items.${index}.provenance_lines`,
      artwork.provenance_lines.map((v) => ({ value: v })),
    );

    // Currency-mismatch guard: only copy the price when currencies match.
    const currency = getValues("currency");
    setMismatch((m) => {
      const next = { ...m };
      if (artwork.price_cents != null && artwork.currency === currency) {
        setValue(
          `line_items.${index}.amount_cents`,
          (artwork.price_cents / 100).toFixed(2),
        );
        delete next[index];
      } else if (artwork.price_cents != null && artwork.currency !== currency) {
        setValue(`line_items.${index}.amount_cents`, "");
        next[index] = `Artwork is priced in ${artwork.currency}, invoice is ${currency}. Enter the amount manually.`;
      } else {
        delete next[index];
      }
      return next;
    });
  }

  function onSubmit(values: InvoiceInput) {
    setError(null);
    // Positions reflect array order.
    const withPositions = {
      ...values,
      line_items: values.line_items.map((li, i) => ({ ...li, position: i })),
    };
    startTransition(async () => {
      const result = invoice
        ? await updateInvoice(invoice.id, withPositions)
        : await createInvoice(withPositions);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/invoices/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Flex direction="column" gap="5" maxWidth="760px">
        {error && (
          <Alert tone="error">{error}</Alert>
        )}

        <Heading size="4">Buyer</Heading>
        <Field label="Buyer (contact)">
          <Controller
            control={control}
            name="buyer_party_id"
            render={({ field }) => (
              <Select.Root value={(field.value as string | null) ?? NONE} onValueChange={onBuyerChange}>
                <Select.Trigger placeholder="Select a contact (optional)" />
                <Select.Content>
                  <Select.Item value={NONE}>None</Select.Item>
                  {parties.map((p) => (
                    <Select.Item key={p.id} value={p.id}>
                      {p.display_name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            )}
          />
        </Field>
        <Field label="Bill-to name" error={errors.bill_to_name?.message} required>
          <TextField.Root {...register("bill_to_name")} placeholder="Full legal name or entity" />
        </Field>
        <Flex gap="3">
          <Field label="Attention" error={errors.bill_to_attention?.message}>
            <TextField.Root {...register("bill_to_attention")} />
          </Field>
          <Field label="Email" error={errors.bill_to_email?.message}>
            <TextField.Root {...register("bill_to_email")} />
          </Field>
        </Flex>
        {buyerAddresses.length > 1 && (
          <Field label="Use address">
            <Select.Root
              defaultValue={buyerAddresses[0].id}
              onValueChange={(addrId) => {
                const a = buyerAddresses.find((x) => x.id === addrId);
                if (a) setValue("bill_to_address", formatAddress(a));
              }}
            >
              <Select.Trigger />
              <Select.Content>
                {buyerAddresses.map((a) => (
                  <Select.Item key={a.id} value={a.id}>
                    {addressSummary(a)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Field>
        )}
        <Field label="Address" error={errors.bill_to_address?.message}>
          <TextArea {...register("bill_to_address")} rows={2} />
        </Field>

        <Flex gap="3">
          <PartySelect control={control} setValue={setValue} name="on_behalf_of_party_id" label="On behalf of" parties={parties} />
          <PartySelect control={control} setValue={setValue} name="seller_party_id" label="Seller" noneLabel="You" parties={parties} />
        </Flex>

        <Separator size="4" />
        <Heading size="4">Details</Heading>
        <Flex gap="3">
          <Field label="Date issued" error={errors.date_issued?.message} required>
            <TextField.Root type="date" {...register("date_issued")} />
          </Field>
          <Field label="Currency">
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select.Root value={field.value} onValueChange={field.onChange}>
                  <Select.Trigger />
                  <Select.Content>
                    {invoiceCurrencies.map((c) => (
                      <Select.Item key={c} value={c}>
                        {c} ({CURRENCY_SYMBOLS[c]})
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              )}
            />
          </Field>
          <Field label="Payment terms" error={errors.payment_terms?.message}>
            <TextField.Root {...register("payment_terms")} />
          </Field>
        </Flex>
        <Flex gap="3">
          <Field label="Ship from" error={errors.ship_from?.message}>
            <TextField.Root {...register("ship_from")} placeholder="Origin — city, country" />
          </Field>
          <Field label="Ship to" error={errors.ship_to?.message}>
            <TextField.Root {...register("ship_to")} placeholder="Destination — city, country" />
          </Field>
        </Flex>

        <Separator size="4" />
        <Heading size="4">Work(s)</Heading>
        {errors.line_items?.message && (
          <Text size="1" color="red">{errors.line_items.message}</Text>
        )}
        {fields.map((f, i) => (
          <Flex key={f.id} direction="column" gap="2" className="border border-[var(--rule)] p-3">
            <Flex justify="between" align="center">
              <Text size="1" color="gray">Work {i + 1}</Text>
              {fields.length > 1 && (
                <IconButton type="button" variant="soft" color="red" size="1" onClick={() => remove(i)}>
                  ✕
                </IconButton>
              )}
            </Flex>

            <Field label="From inventory (optional)">
              <Select.Root
                onValueChange={(v) => v !== NONE && onPickArtwork(i, v)}
                defaultValue={NONE}
              >
                <Select.Trigger placeholder="Pick an artwork to prefill" />
                <Select.Content>
                  <Select.Item value={NONE}>Manual entry</Select.Item>
                  {artworks.map((a) => (
                    <Select.Item key={a.id} value={a.id}>
                      {a.artist_name ? `${a.artist_name} — ` : ""}{a.title}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Field>

            {mismatch[i] && (
              <Alert tone="warning">{mismatch[i]}</Alert>
            )}

            <Flex gap="3">
              <Field label="Artist"><TextField.Root {...register(`line_items.${i}.artist_name` as const)} /></Field>
              <Field label="Title"><TextField.Root {...register(`line_items.${i}.title` as const)} /></Field>
              <Field label="Year"><TextField.Root type="number" {...register(`line_items.${i}.year` as const)} /></Field>
            </Flex>
            <Flex gap="3">
              <Field label="Medium"><TextField.Root {...register(`line_items.${i}.medium` as const)} /></Field>
              <Field label="Dimensions"><TextField.Root {...register(`line_items.${i}.dimensions_text` as const)} /></Field>
            </Flex>
            <Flex gap="3">
              <Field label="Edition"><TextField.Root {...register(`line_items.${i}.edition` as const)} /></Field>
              <Field label="Inventory no."><TextField.Root {...register(`line_items.${i}.inventory_no` as const)} placeholder="CWM-####" /></Field>
            </Flex>
            <Field label="Signature / dated / inscribed"><TextField.Root {...register(`line_items.${i}.signature_details` as const)} /></Field>
            <Field label="Catalogue raisonné"><TextField.Root {...register(`line_items.${i}.catalogue_raisonne` as const)} /></Field>
            <Field label="Provenance (one per line)">
              <Controller
                control={control}
                name={`line_items.${i}.provenance_lines` as const}
                render={({ field }) => (
                  <TextArea
                    rows={3}
                    value={(field.value ?? []).map((v: { value: string }) => v.value).join("\n")}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map((value) => ({ value })),
                      )
                    }
                  />
                )}
              />
            </Field>
            <Field
              label={`Amount (${CURRENCY_SYMBOLS[watchedCurrency]})`}
              error={errors.line_items?.[i]?.amount_cents?.message}
              required
            >
              <TextField.Root {...register(`line_items.${i}.amount_cents` as const)} placeholder="0.00" />
            </Field>
          </Flex>
        ))}
        <Button type="button" variant="soft" onClick={() => append(emptyLine())}>
          Add work
        </Button>

        <Separator size="4" />
        <Flex gap="3" align="end">
          <Field label={`Shipping & handling (${CURRENCY_SYMBOLS[watchedCurrency]})`}>
            <TextField.Root {...register("shipping_cents")} placeholder="0.00" />
          </Field>
        </Flex>

        <Flex direction="column" gap="1" align="end" className="border-t border-[var(--rule)] pt-3">
          <Text size="2">Subtotal: <span className="num">{formatInvoiceMoney(totals.subtotal, watchedCurrency)}</span></Text>
          <Text size="2">Shipping: <span className="num">{formatInvoiceMoney(totals.shipping, watchedCurrency)}</span></Text>
          <Text size="4" weight="bold">Total: <span className="num">{formatInvoiceMoney(totals.total, watchedCurrency)}</span></Text>
        </Flex>

        <Field label="Notes (internal)"><TextArea {...register("notes")} rows={2} /></Field>

        <Flex gap="3" mt="2">
          <Button type="submit" loading={pending} disabled={pending}>
            {invoice ? "Save changes" : "Create invoice"}
          </Button>
          <Button type="button" variant="soft" color="gray" onClick={() => router.back()}>
            Cancel
          </Button>
        </Flex>
      </Flex>
    </form>
  );
}

function PartySelect({
  control,
  setValue,
  name,
  label,
  noneLabel = "None",
  parties,
}: {
  control: ReturnType<typeof useForm<InvoiceFormInput, unknown, InvoiceInput>>["control"];
  setValue: ReturnType<typeof useForm<InvoiceFormInput, unknown, InvoiceInput>>["setValue"];
  name: "on_behalf_of_party_id" | "seller_party_id";
  label: string;
  noneLabel?: string;
  parties: PartyOption[];
}) {
  return (
    <Field label={label}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select.Root
            value={(field.value as string | null) ?? NONE}
            onValueChange={(v) => setValue(name, v === NONE ? null : v)}
          >
            <Select.Trigger placeholder={noneLabel} />
            <Select.Content>
              <Select.Item value={NONE}>{noneLabel}</Select.Item>
              {parties.map((p) => (
                <Select.Item key={p.id} value={p.id}>
                  {p.display_name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        )}
      />
    </Field>
  );
}

