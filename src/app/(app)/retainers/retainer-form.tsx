"use client";

import {
  Button,
  Flex,
  Select,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { Alert } from "@/components/alert";
import { Field } from "@/components/field";
import {
  mergePartyOptions,
  PartyPicker,
  type PartyOption,
} from "@/components/party-picker";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { createRetainer, updateRetainer } from "./actions";
import type { RetainerInterval } from "@/lib/schemas/stripe";

/** The subset of an existing retainer this form edits. */
export type RetainerEditable = {
  id: string;
  amount_cents: number | null;
  billing_interval: RetainerInterval | null;
  description: string | null;
  /** Live at Stripe — drives the "takes effect next cycle" warning. */
  isLive: boolean;
};

// One form, two modes. Create picks a contact and hands off to Stripe-hosted
// Checkout; edit keeps the contact fixed (moving a retainer to another collector
// is a cancel + restart, not an edit) and writes through updateRetainer.
//
// Amount is entered in dollars and converted to integer cents before the server
// action, which re-validates with the Zod schema — the same seam the invoice
// form uses, so money never round-trips as a float.
export function RetainerForm({
  parties,
  retainer,
}: {
  parties: PartyOption[];
  retainer?: RetainerEditable;
}) {
  const router = useRouter();
  const editing = Boolean(retainer);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [partyId, setPartyId] = useState<string>("");
  const [attentionId, setAttentionId] = useState<string>("");
  const [amount, setAmount] = useState<string>(
    retainer?.amount_cents != null ? (retainer.amount_cents / 100).toFixed(2) : "",
  );
  const [interval, setInterval] = useState<RetainerInterval>(
    retainer?.billing_interval ?? "month",
  );
  const [description, setDescription] = useState<string>(
    retainer?.description ?? "",
  );

  // Contacts created in the overlay during this session, merged into the list
  // the server rendered so the new one is immediately selectable.
  const [created, setCreated] = useState<PartyOption[]>([]);
  const options = mergePartyOptions(parties, created);
  const selectedParty = options.find((p) => p.id === partyId);
  const selectedAttention = options.find((p) => p.id === attentionId);

  function addCreated(party: PartyOption) {
    // flushSync, not a plain setState: selecting the new contact in the SAME
    // commit that first renders its <Select.Item> loses a race with Radix's item
    // registration — it sees an unmatched value, clears it, and the field
    // silently drops back to "Select payer…". Forcing the option list to commit
    // first means the item exists by the time the value changes.
    flushSync(() => setCreated((prev) => [...prev, party]));
    // Fill whichever field is still empty: the payer first, since that is the
    // required one and the reason she opened the overlay in the common case.
    if (!partyId) setPartyId(party.id);
    else if (!attentionId) setAttentionId(party.id);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!editing) {
      if (!partyId) {
        setError("Choose who pays.");
        return;
      }
      // Stripe needs one readable address for receipts. The payer's own wins;
      // an attention contact's covers the company-with-no-inbox case. The
      // server re-checks this with the same rule (resolveReceiptEmail).
      if (!selectedParty?.email && !selectedAttention?.email) {
        setError(
          "Stripe needs an email for receipts. Add one to the payer, or name an attention contact who has one.",
        );
        return;
      }
    }
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    const amount_cents = Math.round(dollars * 100);

    startTransition(async () => {
      if (retainer) {
        const res = await updateRetainer(retainer.id, {
          amount_cents,
          billing_interval: interval,
          description,
          currency: "USD",
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        router.push(`/retainers/${retainer.id}`);
        router.refresh();
        return;
      }

      const res = await createRetainer({
        party_id: partyId,
        attention_party_id: attentionId || null,
        amount_cents,
        billing_interval: interval,
        description,
        currency: "USD",
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      window.location.href = res.data.url;
    });
  }

  return (
    <form onSubmit={submit}>
      <Flex direction="column" gap="4" maxWidth="480px">
        {!editing && (
          <>
            <Field label="Who pays">
              <PartyPicker
                parties={options}
                value={partyId}
                onChange={setPartyId}
                onCreated={addCreated}
                label="payer"
                ariaLabel="Who pays"
              />
            </Field>

            <Field label="Attention (optional)">
              <PartyPicker
                parties={options}
                value={attentionId}
                onChange={setAttentionId}
                onCreated={addCreated}
                label="contact"
                ariaLabel="Attention contact"
                clearable
                excludeId={partyId || null}
              />
              <Text size="1" color="gray" mt="1" as="p">
                For a company payer — the person you deal with. Receipts go to
                the payer&rsquo;s email, or to this contact&rsquo;s if the payer
                has none.
              </Text>
            </Field>
          </>
        )}

        <Field label="Amount (USD per charge)">
          <TextField.Root
            type="number"
            min="0"
            step="0.01"
            placeholder="2500.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        <Field label="Billing cadence">
          <Select.Root
            value={interval}
            onValueChange={(v) => setInterval(v as RetainerInterval)}
          >
            <Select.Trigger style={{ width: "100%" }} />
            <Select.Content>
              <Select.Item value="month">Monthly</Select.Item>
              <Select.Item value="quarter">Quarterly</Select.Item>
            </Select.Content>
          </Select.Root>
        </Field>

        <Field label="Description">
          <TextArea
            placeholder="Advisory retainer"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {retainer?.isLive && (
          <Alert tone="info">
            This retainer is live at Stripe. A new amount or cadence takes effect
            on the next charge — the collector is not billed a difference now,
            and no credit is issued.
          </Alert>
        )}

        {error && (
          <Alert tone="error">{error}</Alert>
        )}

        <Flex>
          <Button type="submit" loading={pending}>
            {editing ? "Save changes" : "Start retainer → Stripe"}
          </Button>
        </Flex>
      </Flex>
    </form>
  );
}
