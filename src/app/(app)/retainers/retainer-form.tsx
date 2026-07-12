"use client";

import {
  Button,
  Callout,
  Flex,
  Select,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { useState, useTransition } from "react";
import { createRetainer } from "./actions";
import type { RetainerInterval } from "@/lib/schemas/stripe";

type PartyOption = { id: string; display_name: string; email: string | null };

// Local field wrapper (each form in this app defines its own, per convention).
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <Text as="div" size="2" weight="medium" mb="1">
        {label}
      </Text>
      {children}
    </label>
  );
}

// Amount is entered in dollars and converted to integer cents before the server
// action (which re-validates with retainerCreateSchema). On success the browser
// is sent to the Stripe-hosted subscription Checkout.
export function RetainerForm({ parties }: { parties: PartyOption[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [partyId, setPartyId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [interval, setInterval] = useState<RetainerInterval>("month");
  const [description, setDescription] = useState<string>("");

  const selectedParty = parties.find((p) => p.id === partyId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!partyId) {
      setError("Choose a contact.");
      return;
    }
    if (selectedParty && !selectedParty.email) {
      setError("That contact needs an email before starting a retainer.");
      return;
    }
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    const amount_cents = Math.round(dollars * 100);

    startTransition(async () => {
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

        {error && (
          <Callout.Root color="red" size="1">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        <Flex>
          <Button type="submit" loading={pending}>
            Start retainer → Stripe
          </Button>
        </Flex>
      </Flex>
    </form>
  );
}
