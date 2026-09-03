import { Button, Card, Container, Flex, Heading, Link, Separator, Table, Text } from "@radix-ui/themes";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { isStripeLiveMode } from "@/lib/stripe/client";
import { buildDashboardUrl } from "@/lib/stripe/params";
import { Th } from "@/components/ledger";
import { RetainerActions } from "@/components/retainer-actions";
import { StatusTag, toneFromColor } from "@/components/status-tag";
import { formatInvoiceMoney } from "@/lib/money";
import type {
  Retainer,
  RetainerInterval,
  RetainerPayment,
  RetainerStatus,
} from "@/lib/schemas/stripe";
import { getSupabaseServer } from "@/lib/supabase/server";

const STATUS_COLOR: Record<RetainerStatus, "green" | "amber" | "red" | "gray"> = {
  active: "green",
  past_due: "amber",
  canceled: "gray",
  incomplete: "gray",
};

const INTERVAL_LABEL: Record<RetainerInterval, string> = {
  month: "Monthly",
  quarter: "Quarterly",
};

export default async function RetainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServer();

  const { data: retainerRow } = await supabase
    .from("retainers")
    .select("*, party:parties(display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!retainerRow) notFound();
  const retainer = retainerRow as Retainer & {
    party: { display_name: string } | null;
  };

  const { data: paymentRows } = await supabase
    .from("retainer_payments")
    .select("*")
    .eq("retainer_id", id)
    .order("created_at", { ascending: false });
  const payments = (paymentRows ?? []) as RetainerPayment[];

  const money = (c: number | null) => formatInvoiceMoney(c, retainer.currency);

  return (
    <Container size="3" py="6">
      <Flex justify="between" align="start" mb="4">
        <div>
          <Flex align="center" gap="3">
            <Heading size="7" weight="medium">
              {retainer.party?.display_name ?? "Retainer"}
            </Heading>
            <StatusTag tone={toneFromColor(STATUS_COLOR[retainer.status])}>
              {retainer.status.replace(/_/g, " ")}
            </StatusTag>
          </Flex>
          <Text color="gray" size="2">
            {retainer.description ?? "Retainer"}
          </Text>
        </div>
        {retainer.status !== "canceled" && (
          <Button asChild variant="soft">
            <NextLink href={`/retainers/${id}/edit`}>Edit</NextLink>
          </Button>
        )}
      </Flex>

      <Card mb="4">
        <Flex direction="column" gap="1">
          <Text size="2">
            Amount: <span className="num">{money(retainer.amount_cents)}</span>
            {retainer.billing_interval
              ? ` · ${INTERVAL_LABEL[retainer.billing_interval]}`
              : ""}
          </Text>
          <Text size="2" color="gray">
            Next charge:{" "}
            <span className="num">
              {retainer.current_period_end
                ? retainer.current_period_end.slice(0, 10)
                : "—"}
            </span>
          </Text>
          {retainer.stripe_subscription_id && (
            <Text size="2" color="gray">
              Stripe:{" "}
              <Link
                href={buildDashboardUrl(
                  "subscriptions",
                  retainer.stripe_subscription_id,
                  isStripeLiveMode(),
                )}
                target="_blank"
                rel="noreferrer"
                size="2"
                className="num"
              >
                {retainer.stripe_subscription_id} ↗
              </Link>
            </Text>
          )}
        </Flex>
      </Card>

      <RetainerActions
        id={id}
        canCancel={retainer.status !== "canceled"}
      />

      <Separator size="4" my="5" />

      <Heading size="4" mb="2">
        Payment history
      </Heading>
      {payments.length === 0 ? (
        <Text color="gray" size="2">
          No charges yet.
        </Text>
      ) : (
        <Table.Root variant="ghost">
          <Table.Header>
            <Table.Row>
              <Th>Date</Th>
              <Th>Status</Th>
              <Th align="right">Amount</Th>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {payments.map((p) => (
              <Table.Row key={p.id} align="center">
                <Table.Cell>
                  <span className="num text-[13px] text-[var(--ink-2)]">
                    {p.paid_at ? p.paid_at.slice(0, 10) : p.created_at.slice(0, 10)}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                    {p.status ?? "—"}
                  </span>
                </Table.Cell>
                <Table.Cell align="right">
                  <span className="num text-[14px] text-[var(--ink)]">{money(p.amount_cents)}</span>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Container>
  );
}
