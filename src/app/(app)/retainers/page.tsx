import { Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { Th } from "@/components/ledger";
import { StatusTag, toneFromColor } from "@/components/status-tag";
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
      <Flex justify="between" align="end" mb="6">
        <Heading size="8" weight="medium">
          Retainers
        </Heading>
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
          className="border border-[var(--rule)]"
        >
          <Text style={{ color: "var(--ink-3)" }}>No retainers yet.</Text>
          <Button asChild variant="outline" color="gray">
            <Link href="/retainers/new">Start a retainer</Link>
          </Button>
        </Flex>
      ) : (
        <Table.Root variant="ghost">
          <Table.Header>
            <Table.Row>
              <Th>Contact</Th>
              <Th>Description</Th>
              <Th>Cadence</Th>
              <Th>Status</Th>
              <Th>Next charge</Th>
              <Th align="right">Amount</Th>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id} align="center">
                <Table.Cell>
                  <Link
                    href={`/retainers/${r.id}`}
                    className="font-serif text-[15px] text-[var(--ink)] hover:underline"
                  >
                    {r.party?.display_name ?? "—"}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-[var(--ink-2)]">{r.description ?? "—"}</span>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-[13px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                    {r.billing_interval ? INTERVAL_LABEL[r.billing_interval] : "—"}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <StatusTag tone={toneFromColor(STATUS_COLOR[r.status])}>
                    {r.status.replace(/_/g, " ")}
                  </StatusTag>
                </Table.Cell>
                <Table.Cell>
                  <span className="num text-[13px] text-[var(--ink-3)]">
                    {r.current_period_end ? r.current_period_end.slice(0, 10) : "—"}
                  </span>
                </Table.Cell>
                <Table.Cell align="right">
                  <span className="num text-[14px] text-[var(--ink)]">
                    {formatInvoiceMoney(r.amount_cents, r.currency)}
                  </span>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Container>
  );
}
