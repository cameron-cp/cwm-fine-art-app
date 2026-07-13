import { Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { formatInvoiceMoney } from "@/lib/money";
import { InvoicePaymentBadge } from "@/components/invoice-payment-actions";
import { Th } from "@/components/ledger";
import type { InvoicePaymentStatus } from "@/lib/stripe/reconcile";
import { getSupabaseServer } from "@/lib/supabase/server";

type Row = {
  id: string;
  invoice_prefix: string;
  invoice_number: number;
  bill_to_name: string;
  date_issued: string;
  currency: string;
  total_cents: number;
  payment_status: InvoicePaymentStatus;
};

export default async function InvoicesPage() {
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_prefix, invoice_number, bill_to_name, date_issued, currency, total_cents, payment_status")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="end" mb="6">
        <Heading size="8" weight="medium">
          Invoices
        </Heading>
        <Button asChild>
          <Link href="/invoices/new">New invoice</Link>
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
          <Text style={{ color: "var(--ink-3)" }}>No invoices yet.</Text>
          <Button asChild variant="outline" color="gray">
            <Link href="/invoices/new">Create your first invoice</Link>
          </Button>
        </Flex>
      ) : (
        <Table.Root variant="ghost">
          <Table.Header>
            <Table.Row>
              <Th>Number</Th>
              <Th>Bill to</Th>
              <Th>Date</Th>
              <Th>Status</Th>
              <Th align="right">Total</Th>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id} align="center">
                <Table.Cell>
                  <Link
                    href={`/invoices/${r.id}`}
                    className="num text-[13px] text-[var(--ink)] hover:underline"
                  >
                    {r.invoice_prefix}
                    {r.invoice_number}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-[var(--ink)]">{r.bill_to_name}</span>
                </Table.Cell>
                <Table.Cell>
                  <span className="num text-[13px] text-[var(--ink-3)]">{r.date_issued}</span>
                </Table.Cell>
                <Table.Cell>
                  <InvoicePaymentBadge status={r.payment_status} />
                </Table.Cell>
                <Table.Cell align="right">
                  <span className="num text-[14px] text-[var(--ink)]">
                    {formatInvoiceMoney(r.total_cents, r.currency)}
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
