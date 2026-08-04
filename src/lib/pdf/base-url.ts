// The origin Browserless is pointed at when it fetches a render page.
//
// This exists because of a real outage: NEXT_PUBLIC_APP_URL was set to
// "https://app.chloewaddington.com/artists" in one Netlify context, so every
// render URL came out as ".../artists/tearsheet/render/<id>?token=...". That path
// isn't in the middleware's public list, so Clerk protected it, and Browserless
// dutifully printed the sign-in page as the dealer's tearsheet. A base URL only
// ever contributes scheme + host here, so take only that and the misconfiguration
// can't produce a wrong document again.
export function renderBaseUrl(
  configured: string | null | undefined,
  requestUrl: string,
): string {
  return originOf(configured) ?? originOf(requestUrl) ?? "";
}

function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    // url.origin, spelled out: drops any path, query, and hash.
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}
