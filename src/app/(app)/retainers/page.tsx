import { Badge, Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { formatInvoiceMoney } from "@/lib/money";
import type { RetainerInterval, RetainerStatus } from "@/lib/schemas/stripe";
import { getSupabaseServer } from "@/lib/supabase/server";

type Row = {
  id: string;
  description: string | null;
  amount_cents: number | null;
  currency: string;
  billing_interval: RetainerInterval | null;
  status: RetainerStatus;
  current_period_end: string | null;
  party: { display_name: string } | null;
};

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

export default async function RetainersPage() {
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("retainers")
    .select(
      "id, description, amount_cents, currency, billing_interval, status, current_period_end, party:parties(display_name)",
    )
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="center" mb="5">
        <Heading size="7">Retainers</Heading>
        <Button asChild>
          <Link href="/retainers/new">New retainer</Link>
        </Button>
      </Flex>

      {rows.length === 0 ? (
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap="3"
          py="9"
          className="border border-dashed border-[var(--gray-a6)] rounded-3"
        >
          <Text color="gray">No retainers yet.</Text>
          <Button asChild variant="soft">
            <Link href="/retainers/new">Start a retainer</Link>
          </Button>
        </Flex>
      ) : (
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Contact</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Cadence</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Next charge</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">Amount</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>
                  <Link
                    href={`/retainers/${r.id}`}
                    className="text-[var(--accent-11)] hover:underline"
                  >
                    {r.party?.display_name ?? "—"}
                  </Link>
                </Table.Cell>
                <Table.Cell>{r.description ?? "—"}</Table.Cell>
                <Table.Cell>
                  {r.billing_interval ? INTERVAL_LABEL[r.billing_interval] : "—"}
                </Table.Cell>
                <Table.Cell>
                  <Badge color={STATUS_COLOR[r.status]}>{r.status}</Badge>
                </Table.Cell>
                <Table.Cell>
                  {r.current_period_end
                    ? r.current_period_end.slice(0, 10)
                    : "—"}
                </Table.Cell>
                <Table.Cell align="right">
                  {formatInvoiceMoney(r.amount_cents, r.currency)}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Container>
  );
}
