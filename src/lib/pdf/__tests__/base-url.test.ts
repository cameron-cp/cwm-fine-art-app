import { describe, expect, it } from "vitest";
import { renderBaseUrl } from "../base-url";

// The incident: Netlify's production NEXT_PUBLIC_APP_URL was
// "https://app.chloewaddington.com/artists". Every render URL then came out as
// ".../artists/tearsheet/render/<id>?token=...", which is not a public route, so
// Clerk protected it and Browserless printed the SIGN-IN PAGE as the tearsheet.
// Confirmed against the live site: that URL returns
// x-clerk-auth-reason: protect-rewrite, and a real browser lands on cl-signIn.

describe("renderBaseUrl", () => {
  it("drops a path that got appended to the configured base URL", () => {
    expect(
      renderBaseUrl("https://app.chloewaddington.com/artists", "https://ignored.example"),
    ).toBe("https://app.chloewaddington.com");
  });

  it("drops a trailing slash, so the render path isn't double-slashed", () => {
    // "https://host//tearsheet/render/x" is a different path than the route.
    expect(renderBaseUrl("https://app.chloewaddington.com/", "")).toBe(
      "https://app.chloewaddington.com",
    );
  });

  it("drops a query string and hash too", () => {
    expect(renderBaseUrl("https://app.chloewaddington.com/?utm=x#top", "")).toBe(
      "https://app.chloewaddington.com",
    );
  });

  it("keeps a non-default port, which local and preview hosts need", () => {
    expect(renderBaseUrl("http://192.168.1.76:3000/artworks", "")).toBe(
      "http://192.168.1.76:3000",
    );
  });

  it("passes a correctly configured base URL through unchanged", () => {
    expect(renderBaseUrl("https://app.chloewaddington.com", "")).toBe(
      "https://app.chloewaddington.com",
    );
  });

  it("falls back to the request origin when nothing is configured", () => {
    expect(
      renderBaseUrl(undefined, "https://app.chloewaddington.com/api/tearsheet/abc"),
    ).toBe("https://app.chloewaddington.com");
    expect(renderBaseUrl(null, "https://deploy-preview-9--x.netlify.app/api/tearsheet/a")).toBe(
      "https://deploy-preview-9--x.netlify.app",
    );
  });

  it("falls back to the request origin when the configured value is unusable", () => {
    // A bare path or a non-http scheme can't be an origin Browserless fetches.
    for (const bad of ["/artists", "app.chloewaddington.com", "javascript:alert(1)", ""]) {
      expect(renderBaseUrl(bad, "https://app.chloewaddington.com/api/tearsheet/abc")).toBe(
        "https://app.chloewaddington.com",
      );
    }
  });

  it("returns an empty string when neither source yields an origin", () => {
    // The caller then hands Browserless a relative URL, which fails loudly rather
    // than silently pointing at some other host.
    expect(renderBaseUrl(undefined, "")).toBe("");
  });
});
