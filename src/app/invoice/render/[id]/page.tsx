import { notFound } from "next/navigation";
import { formatInvoiceMoney } from "@/lib/money";
import { getServerEnv } from "@/lib/env";
import { getRenderServiceClient } from "@/lib/supabase/render-client";
import type {
  Invoice,
  InvoiceLineItem,
  InvoiceSettingsSnapshot,
} from "@/lib/schemas/invoice";
import "./invoice.css";

export const dynamic = "force-dynamic";

// Renders an invoice as an HTML page matching the CWFA Word document 1:1 in
// content. Token-gated; Browserless renders this to PDF. ALL fixed content
// (business header, remittance, T&C, Net-14 statement) is read from the
// invoice's settings_snapshot — NEVER the live invoice_settings row — so a
// re-print stays byte-identical after Settings are edited.

function fmtDate(d: string): string {
  // "2026-07-10" -> "July 10, 2026" to match the docx "[Month DD, YYYY]".
  const [y, m, day] = d.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !day) return d;
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[m - 1]} ${day}, ${y}`;
}

export default async function InvoiceRenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const env = getServerEnv();
  const expected = env.INVOICE_RENDER_SECRET;
  if (!expected) {
    return (
      <div className="render-error">INVOICE_RENDER_SECRET is not configured.</div>
    );
  }
  const { token } = await searchParams;
  if (token !== expected) notFound();

  const { id } = await params;
  const supabase = getRenderServiceClient();

  const { data: invoiceRow, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !invoiceRow) notFound();
  const invoice = invoiceRow as Invoice;
  const s: InvoiceSettingsSnapshot = invoice.settings_snapshot;

  const { data: itemRows } = await supabase
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", id)
    .order("position", { ascending: true });
  const items = (itemRows ?? []) as InvoiceLineItem[];

  // Sign the invoice-owned image copies.
  const imagePaths = items
    .map((i) => i.image_path)
    .filter((p): p is string => !!p);
  const signed: Record<string, string> = {};
  if (imagePaths.length) {
    const { data: urls } = await supabase.storage
      .from("artworks")
      .createSignedUrls(imagePaths, 600);
    for (const u of urls ?? []) {
      if (u.path && u.signedUrl) signed[u.path] = u.signedUrl;
    }
  }

  const number = `${invoice.invoice_prefix}${invoice.invoice_number}`;
  const money = (cents: number | null | undefined) =>
    formatInvoiceMoney(cents, invoice.currency);
  const footerText = `${s.business_legal_name} · Invoice ${number}`;

  return (
    <div className="inv-page">
      {/* Off-screen source for the running page footer (business · invoice #). */}
      <span className="inv-footer-src" aria-hidden="true">
        {footerText}
      </span>

      {/* Business header */}
      <header className="inv-header">
        <div className="inv-brand">{s.business_name}</div>
        <div className="inv-legal">{s.business_legal_name}</div>
        <div className="inv-addr">{s.business_address}</div>
        <div className="inv-addr">{s.business_phone}</div>
        <div className="inv-addr">{s.business_email}</div>
      </header>

      {/* Invoice meta */}
      <h1 className="inv-doc-title">INVOICE</h1>
      <table className="inv-meta">
        <tbody>
          <tr><td className="inv-k">Invoice No.</td><td>{number}</td></tr>
          <tr><td className="inv-k">Date Issued</td><td>{fmtDate(invoice.date_issued)}</td></tr>
          <tr><td className="inv-k">Payment Terms</td><td>{invoice.payment_terms}</td></tr>
          <tr><td className="inv-k">Currency</td><td>{invoice.currency}</td></tr>
        </tbody>
      </table>

      {/* Bill to */}
      <section className="inv-section">
        <h2 className="inv-h">BILL TO</h2>
        <table className="inv-kv">
          <tbody>
            <tr><td className="inv-k">Collector / Entity</td><td>{invoice.bill_to_name}</td></tr>
            {invoice.bill_to_attention && (
              <tr><td className="inv-k">Attention</td><td>{invoice.bill_to_attention}</td></tr>
            )}
            {invoice.bill_to_address && (
              <tr><td className="inv-k">Address</td><td className="inv-pre">{invoice.bill_to_address}</td></tr>
            )}
            {invoice.bill_to_email && (
              <tr><td className="inv-k">Email</td><td>{invoice.bill_to_email}</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Shipment */}
      <section className="inv-section">
        <h2 className="inv-h">SHIPMENT</h2>
        <table className="inv-kv">
          <tbody>
            <tr><td className="inv-k">Ship From</td><td>{invoice.ship_from ?? ""}</td></tr>
            <tr><td className="inv-k">Ship To</td><td>{invoice.ship_to ?? ""}</td></tr>
          </tbody>
        </table>
      </section>

      {/* Works */}
      <section className="inv-section">
        <h2 className="inv-h">DESCRIPTION OF WORK(S)</h2>
        {items.map((item) => {
          const url = item.image_path ? signed[item.image_path] : null;
          return (
            <div className="inv-work" key={item.id}>
              <div className="inv-work-img">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={item.title ?? "Work"} />
                ) : (
                  <div className="inv-work-img-empty">No image</div>
                )}
              </div>
              <div className="inv-work-body">
                {item.artist_name && <div className="inv-work-artist">{item.artist_name}</div>}
                <div className="inv-work-title">
                  {item.title ? <em>{item.title}</em> : null}
                  {item.year ? <>, {item.year}</> : null}
                </div>
                {item.medium && <div className="inv-line">{item.medium}</div>}
                {item.dimensions_text && <div className="inv-line">{item.dimensions_text}</div>}
                {item.edition && <div className="inv-line">{item.edition}</div>}
                {item.signature_details && <div className="inv-line">{item.signature_details}</div>}
                {item.catalogue_raisonne && <div className="inv-line">{item.catalogue_raisonne}</div>}
                {item.inventory_no && <div className="inv-line">Inventory no. {item.inventory_no}</div>}
                {item.provenance_lines.map((p, i) => (
                  <div className="inv-line" key={i}>{p}</div>
                ))}
                <div className="inv-work-amount">{money(item.amount_cents)}</div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Summary of charges */}
      <section className="inv-section inv-summary">
        <h2 className="inv-h">SUMMARY OF CHARGES</h2>
        <table className="inv-charges">
          <tbody>
            <tr><td>Subtotal — Work(s) above</td><td className="inv-amt">{money(invoice.subtotal_cents)}</td></tr>
            <tr><td>Shipping &amp; Handling</td><td className="inv-amt">{money(invoice.shipping_cents)}</td></tr>
            <tr className="inv-total"><td>TOTAL DUE</td><td className="inv-amt">{money(invoice.total_cents)}</td></tr>
          </tbody>
        </table>
      </section>

      {/* Net-14 statement */}
      {s.payment_terms_statement && (
        <p className="inv-statement">{s.payment_terms_statement}</p>
      )}

      {/* Remittance */}
      <section className="inv-section">
        <h2 className="inv-h">REMITTANCE INSTRUCTIONS</h2>
        {s.remittance_intro && <p className="inv-para">{s.remittance_intro}</p>}
        <table className="inv-kv">
          <tbody>
            <tr><td className="inv-k">Beneficiary:</td><td>{s.remittance_beneficiary}</td></tr>
            <tr><td className="inv-k">Bank:</td><td>{s.remittance_bank}</td></tr>
            <tr>
              <td className="inv-k">ABA / Routing:</td>
              <td>{s.remittance_aba}&nbsp;&nbsp;&nbsp;&nbsp;Account No.:&nbsp;&nbsp;{s.remittance_account}</td>
            </tr>
            <tr><td className="inv-k">Reference:</td><td>Invoice {number}</td></tr>
          </tbody>
        </table>
      </section>

      {/* Terms & conditions */}
      <section className="inv-section inv-terms">
        <h2 className="inv-h">TERMS AND CONDITIONS</h2>
        {s.terms_intro && <p className="inv-para">{s.terms_intro}</p>}
        <ul className="inv-clauses">
          {s.terms_conditions.map((c, i) => (
            <li key={i} className="inv-clause">
              <span className="inv-clause-title">{c.title}.</span> {c.body}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
