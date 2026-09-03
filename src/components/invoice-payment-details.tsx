import { Card, Flex, Heading, Separator, Table, Text } from "@radix-ui/themes";
import { Th } from "@/components/ledger";
import { StatusTag, toneFromColor } from "@/components/status-tag";
import { formatInvoiceMoney } from "@/lib/money";
import type { InvoicePayment } from "@/lib/schemas/stripe";
import type { InvoicePaymentStatus } from "@/lib/stripe/reconcile";

// "Was this invoice paid, and when?" — answered on the invoice itself.
//
// The status badge in the page header says WHICH state the invoice is in; this
// panel is the evidence behind it: the settlement date, what actually landed
// (which can differ from the invoice total — that is exactly what `review`
// means), and one row per attempt from invoice_payments. Those rows existed in
// the database from migration 0013 but no page had ever read them, so a failed
// card followed by a successful bank transfer looked identical to a single
// payment.

const METHOD_LABEL: Record<string, string> = {
  card: "Card",
  us_bank_account: "Bank (ACH)",
};

const ROW_STATUS_COLOR: Record<string, string> = {
  succeeded: "green",
  processing: "amber",
  pending: "gray",
  failed: "amber",
  refunded: "gray",
  superseded: "gray",
};

/** ISO timestamp → date, keeping the time when we have it (settlement matters). */
function stamp(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

export function InvoicePaymentDetails({
  status,
  paidAt,
  amountPaidCents,
  totalCents,
  currency,
  payments,
}: {
  status: InvoicePaymentStatus;
  paidAt: string | null;
  amountPaidCents: number;
  totalCents: number | null;
  currency: string;
  payments: InvoicePayment[];
}) {
  const money = (c: number | null | undefined) =>
    formatInvoiceMoney(c, currency);

  // A short mismatch is the whole point of the `review` state: money arrived,
  // but not the amount the invoice asks for. Say the shortfall in words rather
  // than leaving her to subtract two figures.
  const shortfall =
    totalCents != null && amountPaidCents > 0 && amountPaidCents !== totalCents
      ? totalCents - amountPaidCents
      : null;

  return (
    <Card mb="4">
      <Flex direction="column" gap="3">
        <Heading size="4">Payment</Heading>

        <Flex direction="column" gap="1">
          {status === "paid" || amountPaidCents > 0 ? (
            <>
              <Text size="2">
                {status === "paid" ? "Paid " : "Received "}
                <span className="num">{money(amountPaidCents)}</span>
                {paidAt ? (
                  <>
                    {" on "}
                    <span className="num">{stamp(paidAt)}</span>
                  </>
                ) : null}
              </Text>
              {shortfall !== null && (
                <Text size="2" color="gray">
                  {shortfall > 0 ? "Short by " : "Over by "}
                  <span className="num">{money(Math.abs(shortfall))}</span>{" "}
                  against a total of{" "}
                  <span className="num">{money(totalCents)}</span>.
                </Text>
              )}
            </>
          ) : (
            <Text size="2" color="gray">
              Nothing collected yet.
            </Text>
          )}
        </Flex>

        {payments.length > 0 && (
          <>
            <Separator size="4" />
            <Table.Root variant="ghost">
              <Table.Header>
                <Table.Row>
                  <Th>Attempted</Th>
                  <Th>Method</Th>
                  <Th>Status</Th>
                  <Th align="right">Amount</Th>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {payments.map((p) => (
                  <Table.Row key={p.id} align="center">
                    <Table.Cell>
                      <span className="num text-[13px] text-[var(--ink-2)]">
                        {stamp(p.created_at)}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="text-[13px] text-[var(--ink-2)]">
                        {p.method ? (METHOD_LABEL[p.method] ?? p.method) : "—"}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusTag
                        tone={toneFromColor(ROW_STATUS_COLOR[p.status] ?? "gray")}
                      >
                        {p.status}
                      </StatusTag>
                    </Table.Cell>
                    <Table.Cell align="right">
                      <span className="num text-[14px] text-[var(--ink)]">
                        {formatInvoiceMoney(p.amount_cents, p.currency ?? currency)}
                      </span>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </>
        )}
      </Flex>
    </Card>
  );
}
