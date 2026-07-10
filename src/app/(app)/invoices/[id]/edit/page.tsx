import { Container, Heading } from "@radix-ui/themes";
import { notFound } from "next/navigation";
import { InvoiceForm } from "../../invoice-form";
import { getInvoiceFormOptions } from "../../options";
import type {
  Invoice,
  InvoiceCurrency,
  InvoiceFormInput,
  InvoiceLineItem,
} from "@/lib/schemas/invoice";
import { getSupabaseServer } from "@/lib/supabase/server";

const centsToInput = (c: number | null | undefined) =>
  c == null ? "" : (c / 100).toFixed(2);

export default async function EditInvoicePage({
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

  const [{ data: itemRows }, { artworkOptions, partyOptions }] = await Promise.all([
    supabase.from("invoice_line_items").select("*").eq("invoice_id", id).order("position"),
    getInvoiceFormOptions(),
  ]);
  const items = (itemRows ?? []) as InvoiceLineItem[];

  const values: InvoiceFormInput = {
    buyer_party_id: invoice.buyer_party_id,
    on_behalf_of_party_id: invoice.on_behalf_of_party_id,
    seller_party_id: invoice.seller_party_id,
    bill_to_name: invoice.bill_to_name,
    bill_to_attention: invoice.bill_to_attention,
    bill_to_address: invoice.bill_to_address,
    bill_to_email: invoice.bill_to_email,
    date_issued: invoice.date_issued,
    payment_terms: invoice.payment_terms,
    currency: invoice.currency as InvoiceCurrency,
    ship_from: invoice.ship_from,
    ship_to: invoice.ship_to,
    shipping_cents: centsToInput(invoice.shipping_cents),
    notes: invoice.notes,
    line_items: items.map((it) => ({
      artwork_id: it.artwork_id,
      position: it.position,
      artist_name: it.artist_name,
      title: it.title,
      year: it.year,
      medium: it.medium,
      dimensions_text: it.dimensions_text,
      edition: it.edition,
      signature_details: it.signature_details,
      catalogue_raisonne: it.catalogue_raisonne,
      inventory_no: it.inventory_no,
      provenance_lines: it.provenance_lines.map((value) => ({ value })),
      amount_cents: centsToInput(it.amount_cents),
    })),
  };

  return (
    <Container size="4" py="6">
      <Heading size="7" mb="5">
        Edit invoice {invoice.invoice_prefix}{invoice.invoice_number}
      </Heading>
      <InvoiceForm
        artworks={artworkOptions}
        parties={partyOptions}
        invoice={{ id, values }}
      />
    </Container>
  );
}
