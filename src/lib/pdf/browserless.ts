import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

// Shared Browserless render call. Both the tearsheet and invoice API routes hit
// this — the POST body, env check, and error handling live in one place. Returns
// a NextResponse: the PDF as an attachment on success, or a JSON error.
export async function renderPdfViaBrowserless(opts: {
  renderUrl: string; // full URL to the render page, including its ?token=
  filename: string; // download filename
}): Promise<NextResponse> {
  const env = getServerEnv();
  if (!env.BROWSERLESS_API_KEY) {
    return NextResponse.json(
      { error: "BROWSERLESS_API_KEY is not configured" },
      { status: 500 },
    );
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
    return NextResponse.json(
      { error: `Browserless ${blRes.status}: ${detail.slice(0, 500)}` },
      { status: 502 },
    );
  }

  const pdf = await blRes.arrayBuffer();
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${opts.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
