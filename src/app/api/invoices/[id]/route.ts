import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { getServerEnv, publicEnv } from "@/lib/env";
import { renderPdfViaBrowserless } from "@/lib/pdf/browserless";
import { getRenderServiceClient } from "@/lib/supabase/render-client";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad invoice id" }, { status: 400 });
  }

  const env = getServerEnv();
  if (!env.INVOICE_RENDER_SECRET) {
    return NextResponse.json(
      { error: "INVOICE_RENDER_SECRET is not configured" },
      { status: 500 },
    );
  }

  // Look up the invoice number for a human-friendly download filename.
  let filename = "invoice.pdf";
  try {
    const supabase = getRenderServiceClient();
    const { data } = await supabase
      .from("invoices")
      .select("invoice_prefix, invoice_number")
      .eq("id", parsed.data.id)
      .maybeSingle();
    if (data) filename = `invoice-${data.invoice_prefix}${data.invoice_number}.pdf`;
  } catch {
    // Non-fatal: fall back to the generic filename.
  }

  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL ?? originFrom(req);
  const renderUrl = `${appUrl}/invoice/render/${parsed.data.id}?token=${encodeURIComponent(
    env.INVOICE_RENDER_SECRET,
  )}`;

  return renderPdfViaBrowserless({ renderUrl, filename });
}

function originFrom(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}
