"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { computeInvoiceTotals } from "@/lib/money";
import { invoiceSchema, type Invoice, type InvoiceInput } from "@/lib/schemas/invoice";
import { publicEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { createInvoiceCheckoutSession } from "@/lib/stripe/checkout";
import {
  buildInvoicePaymentPayload,
  settlementFromSession,
} from "@/lib/stripe/resolve";
import { getServiceClient } from "@/lib/supabase/service";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Result<T> = { data: T } | { error: string };

const BUCKET = "artworks";

function extFromPath(path: string): string {
  const m = path.match(/\.([a-zA-Z0-9]+)$/);
  return m ? `.${m[1].toLowerCase()}` : ".jpg";
}

// Copy each line item's source artwork image into invoice-owned storage
// (invoices/{invoiceId}/...). Returns the per-position image_path map and the
// list of newly-created copies (for rollback on RPC failure). We copy — never
// point at the artwork's live path — because deleteArtwork hard-removes those
// objects, which would break historical invoices.
async function copyLineImages(
  supabase: SupabaseClient,
  invoiceId: string,
  items: InvoiceInput["line_items"],
  unique: boolean,
): Promise<{ imagePaths: Record<number, string>; created: string[] }> {
  const imagePaths: Record<number, string> = {};
  const created: string[] = [];

  const artworkIds = [
    ...new Set(items.map((i) => i.artwork_id).filter((v): v is string => !!v)),
  ];
  if (artworkIds.length === 0) return { imagePaths, created };

  const { data: artworks } = await supabase
    .from("artworks")
    .select("id, primary_image_path")
    .in("id", artworkIds);
  const sourceById = new Map(
    (artworks ?? []).map((a) => [a.id as string, a.primary_image_path as string | null]),
  );

  for (const item of items) {
    if (!item.artwork_id) continue;
    const source = sourceById.get(item.artwork_id);
    if (!source) continue;
    const ext = extFromPath(source);
    const suffix = unique ? `-${randomUUID().slice(0, 8)}` : "";
    const dest = `invoices/${invoiceId}/${item.position}${suffix}${ext}`;
    const { error } = await supabase.storage.from(BUCKET).copy(source, dest);
    if (error) continue; // best-effort: a missing source image just yields no image
    imagePaths[item.position] = dest;
    created.push(dest);
  }
  return { imagePaths, created };
}

async function resolvePartyNames(
  supabase: SupabaseClient,
  ids: Array<string | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("parties")
    .select("id, display_name")
    .in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, p.display_name as string]));
}

function buildPayload(
  data: InvoiceInput,
  invoiceId: string | null,
  imagePaths: Record<number, string>,
  names: Map<string, string>,
) {
  const totals = computeInvoiceTotals(
    data.line_items.map((i) => i.amount_cents),
    data.shipping_cents,
  );
  return {
    ...(invoiceId ? { id: invoiceId } : {}),
    buyer_party_id: data.buyer_party_id,
    on_behalf_of_party_id: data.on_behalf_of_party_id,
    seller_party_id: data.seller_party_id,
    on_behalf_of_name: data.on_behalf_of_party_id
      ? (names.get(data.on_behalf_of_party_id) ?? null)
      : null,
    seller_name: data.seller_party_id
      ? (names.get(data.seller_party_id) ?? null)
      : null,
    bill_to_name: data.bill_to_name,
    bill_to_attention: data.bill_to_attention,
    bill_to_address: data.bill_to_address,
    bill_to_email: data.bill_to_email,
    date_issued: data.date_issued,
    payment_terms: data.payment_terms,
    currency: data.currency,
    ship_from: data.ship_from,
    ship_to: data.ship_to,
    subtotal_cents: totals.subtotalCents,
    shipping_cents: totals.shippingCents,
    total_cents: totals.totalCents,
    notes: data.notes,
    line_items: data.line_items.map((i) => ({
      artwork_id: i.artwork_id,
      position: i.position,
      artist_name: i.artist_name,
      title: i.title,
      year: i.year,
      medium: i.medium,
      dimensions_text: i.dimensions_text,
      edition: i.edition,
      signature_details: i.signature_details,
      catalogue_raisonne: i.catalogue_raisonne,
      inventory_no: i.inventory_no,
      provenance_lines: i.provenance_lines.map((p) => p.value),
      image_path: imagePaths[i.position] ?? null,
      amount_cents: i.amount_cents,
    })),
  };
}

async function removeCopies(supabase: SupabaseClient, paths: string[]) {
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

export async function createInvoice(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid invoice" };
  }
  const data = parsed.data;

  const supabase = getSupabaseServer();
  const invoiceId = randomUUID(); // known up front so image paths are stable

  const names = await resolvePartyNames(supabase, [
    data.on_behalf_of_party_id,
    data.seller_party_id,
  ]);
  const { imagePaths, created } = await copyLineImages(
    supabase,
    invoiceId,
    data.line_items,
    false,
  );

  const payload = buildPayload(data, invoiceId, imagePaths, names);
  const { data: id, error } = await supabase.rpc("create_invoice", { payload });
  if (error) {
    await removeCopies(supabase, created); // don't leak orphaned copies
    return { error: error.message };
  }

  revalidatePath("/invoices");
  return { data: { id: id as string } };
}

export async function updateInvoice(
  id: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid invoice" };
  }
  const data = parsed.data;

  const supabase = getSupabaseServer();

  // Capture the current line-item copies so we can drop the superseded ones
  // after a successful edit.
  const { data: oldItems } = await supabase
    .from("invoice_line_items")
    .select("image_path")
    .eq("invoice_id", id);
  const oldPaths = (oldItems ?? [])
    .map((r) => r.image_path as string | null)
    .filter((v): v is string => !!v);

  const names = await resolvePartyNames(supabase, [
    data.on_behalf_of_party_id,
    data.seller_party_id,
  ]);
  // Unique dest names so a re-copy can't overwrite an existing object mid-edit.
  const { imagePaths, created } = await copyLineImages(
    supabase,
    id,
    data.line_items,
    true,
  );

  const payload = buildPayload(data, null, imagePaths, names);
  const { error } = await supabase.rpc("update_invoice", {
    p_id: id,
    payload,
  });
  if (error) {
    await removeCopies(supabase, created); // symmetric rollback with create
    return { error: error.message };
  }

  // Success: remove superseded copies (the old set fully replaced by the new).
  const newSet = new Set(created);
  await removeCopies(
    supabase,
    oldPaths.filter((p) => !newSet.has(p)),
  );

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { data: { id } };
}

export async function deleteInvoice(id: string): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseServer();

  // Remove the invoice-owned image copies, then the row (line items cascade).
  const { data: items } = await supabase
    .from("invoice_line_items")
    .select("image_path")
    .eq("invoice_id", id);
  const paths = (items ?? [])
    .map((r) => r.image_path as string | null)
    .filter((v): v is string => !!v);
  await removeCopies(supabase, paths);

  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/invoices");
  return { data: { id } };
}

// --- Stripe payment actions (migration 0013) -------------------------

// Create a hosted Checkout session to pay this invoice by card/ACH and return
// its URL. Guards against paying an already-paid/processing invoice, and
// persists a `pending` invoice_payments stub (carrying the session id) BEFORE
// returning — so reconcileInvoicePayment can recover even if the webhook never
// fires (e.g. a rotated STRIPE_WEBHOOK_SECRET fails verification upstream).
export async function createInvoiceCheckout(
  id: string,
): Promise<Result<{ url: string }>> {
  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return { error: "NEXT_PUBLIC_APP_URL is not configured." };

  const supabase = getSupabaseServer();
  const { data: invoiceRow } = await supabase
    .from("invoices")
    .select(
      "id, invoice_prefix, invoice_number, total_cents, currency, bill_to_email, updated_at, payment_status, buyer_party_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!invoiceRow) return { error: "Invoice not found." };
  const invoice = invoiceRow as Pick<
    Invoice,
    | "id"
    | "invoice_prefix"
    | "invoice_number"
    | "total_cents"
    | "currency"
    | "bill_to_email"
    | "updated_at"
    | "payment_status"
    | "buyer_party_id"
  >;

  if (invoice.payment_status === "paid" || invoice.payment_status === "processing") {
    return { error: `This invoice is already ${invoice.payment_status}.` };
  }

  let stripeCustomerId: string | null = null;
  if (invoice.buyer_party_id) {
    const { data: party } = await supabase
      .from("parties")
      .select("stripe_customer_id")
      .eq("id", invoice.buyer_party_id)
      .maybeSingle();
    stripeCustomerId = (party?.stripe_customer_id as string | null) ?? null;
  }

  const session = await createInvoiceCheckoutSession({
    invoice,
    stripeCustomerId,
    appUrl,
  });
  if ("error" in session) return { error: session.error };

  // Exactly one current stub: supersede prior pending stubs (an edit-and-resend
  // mints a fresh session), then insert the new one synchronously.
  await supabase
    .from("invoice_payments")
    .update({ status: "superseded" })
    .eq("invoice_id", id)
    .eq("status", "pending");
  await supabase.from("invoice_payments").insert({
    invoice_id: id,
    stripe_checkout_session_id: session.data.id,
    status: "pending",
  });

  return { data: { url: session.data.url } };
}

// Manual recovery: re-fetch the current session from Stripe and re-apply state
// through apply_stripe_event (atomic). The escape hatch for the one failure the
// webhook can't self-heal — a signature failure (wrong/rotated secret, URL
// drift) means no handler ever ran, so no retry lands.
export async function reconcileInvoicePayment(
  id: string,
): Promise<Result<{ status: string }>> {
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };

  const supabase = getSupabaseServer();
  const { data: stub } = await supabase
    .from("invoice_payments")
    .select("stripe_checkout_session_id")
    .eq("invoice_id", id)
    .neq("status", "superseded")
    .not("stripe_checkout_session_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sessionId = stub?.stripe_checkout_session_id as string | null | undefined;
  if (!sessionId) return { error: "No payment session to reconcile yet." };

  try {
    const service = getServiceClient();
    const facts = await settlementFromSession(stripe, sessionId);
    if (!facts) return { error: "Could not read the payment session from Stripe." };
    const payload = await buildInvoicePaymentPayload(service, facts);
    if (!payload) return { error: "Invoice not found." };

    // Unique synthetic event id so a manual reconcile always applies; the RPC's
    // terminal-state guard makes repeated applies safe.
    const { error } = await service.rpc("apply_stripe_event", {
      p_event_id: `manual-reconcile-${sessionId}-${Date.now()}`,
      p_type: "manual.reconcile",
      p_payload: payload,
    });
    if (error) return { error: error.message };

    revalidatePath(`/invoices/${id}`);
    revalidatePath("/invoices");
    return { data: { status: String(payload.target_invoice_status) } };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Reconcile failed.",
    };
  }
}
