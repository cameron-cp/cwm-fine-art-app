import { Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { formatInvoiceMoney } from "@/lib/money";
import { getSupabaseServer } from "@/lib/supabase/server";

type Row = {
  id: string;
  invoice_prefix: string;
  invoice_number: number;
  bill_to_name: string;
  date_issued: string;
  currency: string;
  total_cents: number;
};

export default async function InvoicesPage() {
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_prefix, invoice_number, bill_to_name, date_issued, currency, total_cents")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="center" mb="5">
        <Heading size="7">Invoices</Heading>
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
          className="border border-dashed border-[var(--gray-a6)] rounded-3"
        >
          <Text color="gray">No invoices yet.</Text>
          <Button asChild variant="soft">
            <Link href="/invoices/new">Create your first invoice</Link>
          </Button>
        </Flex>
      ) : (
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Number</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Bill to</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">Total</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>
                  <Link href={`/invoices/${r.id}`} className="text-[var(--accent-11)] hover:underline">
                    {r.invoice_prefix}{r.invoice_number}
                  </Link>
                </Table.Cell>
                <Table.Cell>{r.bill_to_name}</Table.Cell>
                <Table.Cell>{r.date_issued}</Table.Cell>
                <Table.Cell align="right">{formatInvoiceMoney(r.total_cents, r.currency)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Container>
  );
}
