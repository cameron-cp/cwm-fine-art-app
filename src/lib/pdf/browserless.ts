import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

// Core Browserless render call. Returns the PDF bytes or a typed error — no HTTP
// coupling — so it can back both a download response (below) and an email
// attachment (the viewing-room invite). The POST body, env check, and error
// handling live here once, shared by tearsheet / invoice / room.
export async function renderPdfBytesViaBrowserless(opts: {
  renderUrl: string; // full URL to the render page, including its ?token=
}): Promise<{ data: Uint8Array<ArrayBuffer> } | { error: string; status: number }> {
  const env = getServerEnv();
  if (!env.BROWSERLESS_API_KEY) {
    return { error: "BROWSERLESS_API_KEY is not configured", status: 500 };
  }

  const browserlessUrl = `https://production-sfo.browserless.io/pdf?token=${encodeURIComponent(
    env.BROWSERLESS_API_KEY,
  )}`;

  const blRes = await fetch(browserlessUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: opts.renderUrl,
      gotoOptions: { waitUntil: "networkidle0", timeout: 30000 },
      options: {
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: true,
      },
    }),
  });

  if (!blRes.ok) {
    const detail = await blRes.text().catch(() => "");
    return { error: `Browserless ${blRes.status}: ${detail.slice(0, 500)}`, status: 502 };
  }

  const pdf = await blRes.arrayBuffer();
  return { data: new Uint8Array(pdf) };
}

// Download wrapper. Both the tearsheet and invoice API routes hit this — returns a
// NextResponse: the PDF as an attachment on success, or a JSON error.
export async function renderPdfViaBrowserless(opts: {
  renderUrl: string; // full URL to the render page, including its ?token=
  filename: string; // download filename
}): Promise<NextResponse> {
  const res = await renderPdfBytesViaBrowserless({ renderUrl: opts.renderUrl });
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }
  return new NextResponse(res.data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${opts.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
