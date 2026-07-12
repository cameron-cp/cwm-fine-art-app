"use client";

import { Button, Callout, Card, Flex, Text } from "@radix-ui/themes";
import { useState, useTransition } from "react";
import {
  addPaymentMethod,
  openBillingPortal,
} from "@/app/(app)/contacts/actions";

// Card/bank-on-file controls on the contact detail page. "Add card / bank on
// file" opens a Stripe-hosted setup Checkout; "Manage methods" opens the Billing
// Portal (only once a customer exists). All entry is Stripe-hosted — zero PCI.
export function ContactPaymentMethods({
  id,
  hasCustomer,
}: {
  id: string;
  hasCustomer: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open(action: (id: string) => Promise<{ data: { url: string } } | { error: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action(id);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <Card mt="5">
      <Flex direction="column" gap="3">
        <div>
          <Text weight="bold">Payment methods</Text>
          <Text as="p" size="2" color="gray">
            Save a card or US bank account on file (Stripe-hosted — no card data
            touches this app).
          </Text>
        </div>
        <Flex gap="3" align="center">
          <Button onClick={() => open(addPaymentMethod)} loading={pending} variant="soft">
            Add card / bank on file
          </Button>
          {hasCustomer && (
            <Button
              onClick={() => open(openBillingPortal)}
              loading={pending}
              variant="outline"
            >
              Manage methods
            </Button>
          )}
        </Flex>
        {error && (
          <Callout.Root color="red" size="1">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}
      </Flex>
    </Card>
  );
}
