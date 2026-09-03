"use client";

import {
  Button,
  Flex,
  Select,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { Alert } from "@/components/alert";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createRetainer, updateRetainer } from "./actions";
import type { RetainerInterval } from "@/lib/schemas/stripe";

type PartyOption = { id: string; display_name: string; email: string | null };

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
  const [amount, setAmount] = useState<string>(
    retainer?.amount_cents != null ? (retainer.amount_cents / 100).toFixed(2) : "",
  );
  const [interval, setInterval] = useState<RetainerInterval>(
    retainer?.billing_interval ?? "month",
  );
  const [description, setDescription] = useState<string>(
    retainer?.description ?? "",
  );

  const selectedParty = parties.find((p) => p.id === partyId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!editing) {
      if (!partyId) {
        setError("Choose a contact.");
        return;
      }
      if (selectedParty && !selectedParty.email) {
        setError("That contact needs an email before starting a retainer.");
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
          <Field label="Contact">
            <Select.Root value={partyId} onValueChange={setPartyId}>
              <Select.Trigger placeholder="Choose a contact" style={{ width: "100%" }} />
              <Select.Content>
                {parties.map((p) => (
                  <Select.Item key={p.id} value={p.id}>
                    {p.display_name}
                    {p.email ? "" : " (no email)"}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Field>
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
