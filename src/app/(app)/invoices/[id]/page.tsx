import { Button, Card, Container, Flex, Heading, Separator, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GeneratePdfButton } from "@/components/generate-pdf-button";
import { Th } from "@/components/ledger";
import {
  InvoicePaymentActions,
  InvoicePaymentBadge,
} from "@/components/invoice-payment-actions";
import { formatInvoiceMoney } from "@/lib/money";
import type { Invoice, InvoiceLineItem } from "@/lib/schemas/invoice";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServer();

  const { data: invoiceRow } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!invoiceRow) notFound();
  const invoice = invoiceRow as Invoice;

  const { data: itemRows } = await supabase
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", id)
    .order("position");
  const items = (itemRows ?? []) as InvoiceLineItem[];

  const number = `${invoice.invoice_prefix}${invoice.invoice_number}`;
  const money = (c: number | null | undefined) => formatInvoiceMoney(c, invoice.currency);

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="start" mb="4">
        <div>
          <Flex align="center" gap="3">
            <Heading size="7" weight="medium">
              Invoice {number}
            </Heading>
            <InvoicePaymentBadge status={invoice.payment_status} />
          </Flex>
          <Text color="gray" size="2">
            {invoice.bill_to_name} · {invoice.date_issued} · {invoice.currency}
          </Text>
        </div>
        <Flex gap="3" align="center">
          <Button asChild variant="soft">
            <Link href={`/invoices/${id}/edit`}>Edit</Link>
          </Button>
          <GeneratePdfButton
            endpoint={`/api/invoices/${id}`}
            filename={`invoice-${number}.pdf`}
            label="Generate PDF"
            size="2"
          />
        </Flex>
      </Flex>

      <Flex justify="end" mb="4">
        <InvoicePaymentActions id={id} status={invoice.payment_status} />
      </Flex>

      <Card mb="4">
        <Flex direction="column" gap="1">
          <Text weight="bold">Bill to</Text>
          <Text size="2">{invoice.bill_to_name}</Text>
          {invoice.bill_to_attention && <Text size="2" color="gray">Attn: {invoice.bill_to_attention}</Text>}
          {invoice.bill_to_address && <Text size="2" color="gray" className="whitespace-pre-line">{invoice.bill_to_address}</Text>}
          {invoice.bill_to_email && <Text size="2" color="gray">{invoice.bill_to_email}</Text>}
        </Flex>
      </Card>

      <Table.Root variant="ghost" mb="4">
        <Table.Header>
          <Table.Row>
            <Th>Work</Th>
            <Th align="right">Amount</Th>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.map((it) => (
            <Table.Row key={it.id} align="center">
              <Table.Cell>
                <div className="font-serif text-[15px] text-[var(--ink)]">
                  {it.artist_name ? `${it.artist_name} — ` : ""}
                  <span className="italic">{it.title}</span>
                </div>
                {it.medium && (
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                    {it.medium}
                  </div>
                )}
                {it.dimensions_text && (
                  <div className="num text-[12px] text-[var(--ink-3)]">{it.dimensions_text}</div>
                )}
              </Table.Cell>
              <Table.Cell align="right">
                <span className="num text-[14px] text-[var(--ink)]">{money(it.amount_cents)}</span>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>

      <Flex direction="column" gap="1" align="end">
        <Text size="2">Subtotal: <span className="num">{money(invoice.subtotal_cents)}</span></Text>
        <Text size="2">Shipping: <span className="num">{money(invoice.shipping_cents)}</span></Text>
        <Separator size="2" my="1" />
        <Text size="4" weight="bold">Total due: <span className="num">{money(invoice.total_cents)}</span></Text>
      </Flex>
    </Container>
  );
}
