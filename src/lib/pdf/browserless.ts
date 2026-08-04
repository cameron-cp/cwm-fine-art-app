import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { contentDispositionAttachment } from "./filename";

// Hosts Browserless can never reach, because "localhost" resolves inside its own
// container. It rejects them outright with a 403 whose body ("Navigation to ...
// is not allowed") tells the dealer nothing, so we catch it here instead.
const UNREACHABLE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
]);

function unreachableHost(renderUrl: string): string | null {
  let host: string;
  try {
    host = new URL(renderUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (UNREACHABLE_HOSTS.has(host) || host.endsWith(".local")) return host;
  return null;
}

// Core Browserless render call. Returns the PDF bytes or a typed error — no HTTP
// coupling — so it can back both a download response (below) and an email
// attachment (the viewing-room invite). The POST body, env check, and error
// handling live here once, shared by tearsheet / invoice / room.
export async function renderPdfBytesViaBrowserless(opts: {
  renderUrl: string; // full URL to the render page, including its ?token=
  // Selector that only exists on the real print layout (".ts-page", ".inv-page",
  // ".rp-doc"). REQUIRED, and load-bearing: a render page that redirects — an
  // auth bounce, a Clerk dev-browser handshake, an expired token — still returns
  // a perfectly valid HTML page, and Browserless will happily turn that page
  // into a PDF. That is how a Clerk sign-in screen once shipped as a tearsheet.
  // Making Browserless wait for the layout root turns "wrong page" from a
  // plausible-looking download into an error the caller can report.
  expectSelector: string;
}): Promise<{ data: Uint8Array<ArrayBuffer> } | { error: string; status: number }> {
  const env = getServerEnv();
  if (!env.BROWSERLESS_API_KEY) {
    return { error: "BROWSERLESS_API_KEY is not configured", status: 500 };
  }

  const unreachable = unreachableHost(opts.renderUrl);
  if (unreachable) {
    return {
      error:
        `PDF rendering runs on Browserless, which can't reach ${unreachable} — ` +
        "it only sees public URLs. Set NEXT_PUBLIC_APP_URL to a publicly " +
        "reachable address (the deployed site, or a tunnel to this machine) and retry.",
      status: 500,
    };
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
      waitForSelector: { selector: opts.expectSelector, timeout: 15000 },
      options: {
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: true,
      },
    }),
  });

  if (!blRes.ok) {
    const detail = await blRes.text().catch(() => "");
    // Browserless answers a selector timeout with a bare "Internal Server Error"
    // — it never names the selector — so the body can't tell us whether the page
    // was wrong or Browserless itself failed. Ask the render URL directly.
    const diagnosis = await diagnoseRenderUrl(opts.renderUrl, opts.expectSelector);
    return {
      error: diagnosis ?? `Browserless ${blRes.status}: ${detail.slice(0, 300)}`,
      status: 502,
    };
  }

  const pdf = await blRes.arrayBuffer();
  return { data: new Uint8Array(pdf) };
}

// Only runs after a failed render, to turn "Browserless 500: Internal Server
// Error" into something the dealer can act on. Fetches the render URL the same
// way Browserless was asked to, and reports what came back. Returns null when the
// render page looks healthy — then the fault is Browserless's and its own error
// text is the more useful one.
async function diagnoseRenderUrl(
  renderUrl: string,
  expectSelector: string,
): Promise<string | null> {
  // ".ts-page" → "ts-page", to look for in the served markup's class attributes.
  const className = expectSelector.replace(/^\./, "");

  try {
    const res = await fetch(renderUrl, { headers: { Accept: "text/html" } });

    if (res.status === 404) {
      return (
        "The render page returned 404. The render secret this app is using " +
        "doesn't match the one it was deployed with, or the record no longer exists."
      );
    }
    if (!res.ok) {
      return `The render page returned ${res.status}, so there was nothing to print.`;
    }

    const html = await res.text();
    if (!html.includes(className)) {
      return (
        "The render page loaded but didn't contain the print layout — the request " +
        "was redirected (an auth bounce, most likely). No PDF was generated, which " +
        "is deliberate: printing that page would have produced a sign-in screen."
      );
    }
    return null;
  } catch {
    return null; // Couldn't reach it ourselves either; let the raw error stand.
  }
}

// Download wrapper. Both the tearsheet and invoice API routes hit this — returns a
// NextResponse: the PDF as an attachment on success, or a JSON error.
export async function renderPdfViaBrowserless(opts: {
  renderUrl: string; // full URL to the render page, including its ?token=
  expectSelector: string; // see renderPdfBytesViaBrowserless
  filename: string; // download filename; accents are preserved (RFC 5987)
}): Promise<NextResponse> {
  const res = await renderPdfBytesViaBrowserless({
    renderUrl: opts.renderUrl,
    expectSelector: opts.expectSelector,
  });
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }
  return new NextResponse(res.data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionAttachment(opts.filename),
      "Cache-Control": "no-store",
    },
  });
}
