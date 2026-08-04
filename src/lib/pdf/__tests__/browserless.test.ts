import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPdfBytesViaBrowserless, renderPdfViaBrowserless } from "../browserless";

// The bug this guards: a tearsheet download that was actually a PDF of the Clerk
// sign-in page. The render route is public in middleware and the server HTML is
// correct, but ANY navigation away from the print page — an auth bounce, a Clerk
// dev-browser handshake, an expired render token — still leaves Browserless
// looking at a valid HTML document, which it will faithfully print. So the render
// call must assert the print layout is on screen before it accepts the bytes.

const ORIGINAL_KEY = process.env.BROWSERLESS_API_KEY;

function lastBody(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return JSON.parse((init as RequestInit).body as string);
}

beforeEach(() => {
  process.env.BROWSERLESS_API_KEY = "test-browserless-key";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.BROWSERLESS_API_KEY;
  else process.env.BROWSERLESS_API_KEY = ORIGINAL_KEY;
  vi.unstubAllGlobals();
});

describe("renderPdfBytesViaBrowserless", () => {
  it("requires the print layout's root selector before printing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await renderPdfBytesViaBrowserless({
      renderUrl: "https://app.example.com/tearsheet/render/abc?token=s3cret",
      expectSelector: ".ts-page",
    });

    expect("data" in res).toBe(true);
    // Without this, a sign-in page renders as a "tearsheet" and nobody finds out
    // until the dealer opens the file in front of a collector.
    expect(lastBody(fetchMock).waitForSelector).toEqual({
      selector: ".ts-page",
      timeout: 15000,
    });
  });

  it("reports a redirected render page instead of returning the wrong PDF", async () => {
    // Verified against the live service: Browserless answers a selector timeout
    // with a bare 500 "Internal Server Error" and never names the selector, so
    // the diagnosis has to come from re-fetching the render URL ourselves.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }))
      .mockResolvedValueOnce(
        new Response('<html><body><div class="cl-signIn">Sign in</div></body></html>', {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await renderPdfBytesViaBrowserless({
      renderUrl: "https://app.example.com/tearsheet/render/abc?token=s3cret",
      expectSelector: ".ts-page",
    });

    expect("data" in res).toBe(false);
    expect(res).toMatchObject({ status: 502 });
    expect("error" in res && res.error).toContain("redirected");
    // The whole point: no bytes, so no sign-in screen masquerading as a tearsheet.
    expect("error" in res && res.error).toContain("sign-in");
  });

  it("blames a stale render secret when the render page 404s", async () => {
    // notFound() on a token mismatch is the render page's only failure mode, and
    // "Browserless 500" gave no hint that the secret was the thing to check.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }))
      .mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await renderPdfBytesViaBrowserless({
      renderUrl: "https://app.example.com/tearsheet/render/abc?token=stale",
      expectSelector: ".ts-page",
    });

    expect("error" in res && res.error).toContain("404");
    expect("error" in res && res.error).toContain("render secret");
  });

  it("keeps Browserless's own error when the render page is healthy", async () => {
    // Rate limits, timeouts, an out-of-credit account: the page is fine and the
    // raw message is the useful one. Don't mislabel it as a redirect.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("Rate limit exceeded", { status: 429 }))
      .mockResolvedValueOnce(
        new Response('<html><body><div class="ts-page">Picasso</div></body></html>', {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await renderPdfBytesViaBrowserless({
      renderUrl: "https://app.example.com/tearsheet/render/abc?token=s3cret",
      expectSelector: ".ts-page",
    });

    expect("error" in res && res.error).toContain("Rate limit exceeded");
    expect("error" in res && res.error).not.toContain("redirected");
  });

  it("refuses a localhost render URL before spending a Browserless call", async () => {
    // NEXT_PUBLIC_APP_URL ships as http://localhost:3000. Browserless answers a
    // localhost navigation with 403 "Navigation to ... is not allowed", which
    // told the dealer nothing about what to change.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const host of ["localhost:3000", "127.0.0.1:3000", "0.0.0.0:3000", "mac.local"]) {
      const res = await renderPdfBytesViaBrowserless({
        renderUrl: `http://${host}/tearsheet/render/abc?token=s3cret`,
        expectSelector: ".ts-page",
      });
      expect(res).toMatchObject({ status: 500 });
      expect("error" in res && res.error).toContain("NEXT_PUBLIC_APP_URL");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the API key is missing", async () => {
    delete process.env.BROWSERLESS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await renderPdfBytesViaBrowserless({
      renderUrl: "https://app.example.com/tearsheet/render/abc?token=s3cret",
      expectSelector: ".ts-page",
    });

    expect(res).toMatchObject({ status: 500 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("renderPdfViaBrowserless", () => {
  it("names the download with the accents intact", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await renderPdfViaBrowserless({
      renderUrl: "https://app.example.com/tearsheet/render/abc?token=s3cret",
      expectSelector: ".ts-page",
      filename: "Picasso, Pablo, Homme au béret basque, 1946 - Tearsheet.pdf",
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain("Homme%20au%20b%C3%A9ret%20basque");
  });

  it("surfaces the render error as JSON, never as a zero-byte PDF download", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await renderPdfViaBrowserless({
      renderUrl: "https://app.example.com/tearsheet/render/abc?token=s3cret",
      expectSelector: ".ts-page",
      filename: "Tearsheet.pdf",
    });

    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toBeNull();
  });
});
