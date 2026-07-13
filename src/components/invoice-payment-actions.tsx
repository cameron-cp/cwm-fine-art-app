"use client";

import { Button, Callout, Flex } from "@radix-ui/themes";
import { useState, useTransition } from "react";
import {
  createInvoiceCheckout,
  reconcileInvoicePayment,
} from "@/app/(app)/invoices/actions";
import { StatusTag, toneFromColor } from "@/components/status-tag";
import { INVOICE_PAYMENT_STATUS_META } from "@/lib/schemas/stripe";
import type { InvoicePaymentStatus } from "@/lib/stripe/reconcile";

export function InvoicePaymentBadge({
  status,
}: {
  status: InvoicePaymentStatus;
}) {
  const meta = INVOICE_PAYMENT_STATUS_META[status];
  return <StatusTag tone={toneFromColor(meta.color)}>{meta.label}</StatusTag>;
}

// Payment controls on the invoice detail page. "Request payment" mints a hosted
// Checkout link (copied + opened); it's hidden once the invoice is paid or a
// payment is settling. "Check Stripe status" is the manual reconcile escape
// hatch for when a webhook never landed.
export function InvoicePaymentActions({
  id,
  status,
}: {
  id: string;
  status: InvoicePaymentStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canPay = status !== "paid" && status !== "processing";

  function requestPayment() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await createInvoiceCheckout(id);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      try {
        await navigator.clipboard.writeText(res.data.url);
        setInfo("Payment link copied to clipboard.");
      } catch {
        setInfo("Payment link opened.");
      }
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    });
  }

  function checkStatus() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await reconcileInvoicePayment(id);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setInfo(`Latest Stripe status: ${res.data.status}.`);
    });
  }

  return (
    <Flex direction="column" gap="2" align="end">
      <Flex gap="2" align="center">
        {canPay && (
          <Button onClick={requestPayment} loading={pending} variant="soft">
            Request payment
          </Button>
        )}
        <Button
          onClick={checkStatus}
          loading={pending}
          variant="outline"
          size="2"
        >
          Check Stripe status
        </Button>
      </Flex>
      {info && (
        <Callout.Root color="green" size="1">
          <Callout.Text>{info}</Callout.Text>
        </Callout.Root>
      )}
      {error && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}
    </Flex>
  );
}
