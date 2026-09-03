"use client";

import { Button, Card, Flex, Heading, Link, Separator, Text } from "@radix-ui/themes";
import { Alert } from "@/components/alert";
import { StatusTag } from "@/components/status-tag";
import { useState, useTransition } from "react";
import {
  addPaymentMethod,
  connectStripeCustomer,
  openBillingPortal,
} from "@/app/(app)/contacts/actions";

// Payments panel on the contact detail page.
//
// The first line answers "is this collector wired up to Stripe at all?" — which
// used to be unanswerable from the app: a customer only came into existence as a
// side effect of saving a card or starting a retainer, and nothing on screen said
// so either way. Connected shows the customer id (mono, per the design system's
// rule that IDs are tabular) linked into the Stripe dashboard.
//
// Card and bank entry stays entirely on Stripe-hosted pages — zero PCI scope.
export function ContactPaymentMethods({
  id,
  hasCustomer,
  stripeCustomerId,
  dashboardUrl,
}: {
  id: string;
  hasCustomer: boolean;
  stripeCustomerId: string | null;
  dashboardUrl: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function open(
    action: (id: string) => Promise<{ data: { url: string } } | { error: string }>,
  ) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await action(id);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    });
  }

  function connect() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await connectStripeCustomer(id);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setInfo(`Connected as ${res.data.stripeCustomerId}.`);
    });
  }

  return (
    <Card mt="5">
      <Flex direction="column" gap="3">
        <div>
          <Heading size="4">Payments</Heading>
          <Text as="p" size="2" color="gray">
            Save a card or US bank account on file (Stripe-hosted — no card data
            touches this app).
          </Text>
        </div>

        <Flex align="center" gap="3" wrap="wrap">
          {hasCustomer ? (
            <>
              <StatusTag tone="positive">Connected to Stripe</StatusTag>
              {stripeCustomerId && dashboardUrl ? (
                <Link
                  href={dashboardUrl}
                  target="_blank"
                  rel="noreferrer"
                  size="2"
                  className="num"
                >
                  {stripeCustomerId} ↗
                </Link>
              ) : null}
            </>
          ) : (
            <>
              <StatusTag tone="muted">Not connected</StatusTag>
              <Button onClick={connect} loading={pending} variant="outline">
                Connect to Stripe
              </Button>
            </>
          )}
        </Flex>

        <Separator size="4" />

        <Flex gap="3" align="center" wrap="wrap">
          <Button
            onClick={() => open(addPaymentMethod)}
            loading={pending}
            variant="soft"
          >
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

        {info && <Alert tone="success">{info}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
      </Flex>
    </Card>
  );
}
