import { Badge, Card, Container, Flex, Heading, Separator, Table, Text } from "@radix-ui/themes";
import { notFound } from "next/navigation";
import { RetainerActions } from "@/components/retainer-actions";
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
            <Heading size="7">{retainer.party?.display_name ?? "Retainer"}</Heading>
            <Badge color={STATUS_COLOR[retainer.status]}>{retainer.status}</Badge>
          </Flex>
          <Text color="gray" size="2">
            {retainer.description ?? "Retainer"}
          </Text>
        </div>
      </Flex>

      <Card mb="4">
        <Flex direction="column" gap="1">
          <Text size="2">
            Amount: {money(retainer.amount_cents)}
            {retainer.billing_interval
              ? ` · ${INTERVAL_LABEL[retainer.billing_interval]}`
              : ""}
          </Text>
          <Text size="2" color="gray">
            Next charge:{" "}
            {retainer.current_period_end
              ? retainer.current_period_end.slice(0, 10)
              : "—"}
          </Text>
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
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">Amount</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {payments.map((p) => (
              <Table.Row key={p.id}>
                <Table.Cell>
                  {p.paid_at ? p.paid_at.slice(0, 10) : p.created_at.slice(0, 10)}
                </Table.Cell>
                <Table.Cell>{p.status ?? "—"}</Table.Cell>
                <Table.Cell align="right">{money(p.amount_cents)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Container>
  );
}
