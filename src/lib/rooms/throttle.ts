// Minimal per-token throttle for the public room surface. No rate-limit infra
// exists in the repo yet ([A2]); this is a fixed-window in-memory counter keyed by
// token, applied to BOTH the page GET (it issues signed URLs + service-role reads)
// and the event POST. Caveat: in-memory means per-server-instance — on a
// multi-instance/serverless deploy it bounds abuse per instance, not globally. That
// is an accepted M1 tradeoff; the high-risk inquiry→email path (M1b) gets a
// stronger server-side debounce. Pure + injectable clock for testability.

const WINDOW_MS = 60_000;
// A legit page load fires 1 room_open + one work_view per work; a large room
// (~50 works) plus a re-scroll can legitimately burst. 300/min/token leaves ample
// headroom for that while still bounding a forged flood to a bounded row count.
const MAX_PER_WINDOW = 300;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type ThrottleResult = { ok: true } | { ok: false; retryAfterMs: number };

export function throttleToken(token: string, now: number = Date.now()): ThrottleResult {
  const cur = buckets.get(token);
  if (!cur || now >= cur.resetAt) {
    buckets.set(token, { count: 1, resetAt: now + WINDOW_MS });
    maybePrune(now);
    return { ok: true };
  }
  cur.count += 1;
  if (cur.count > MAX_PER_WINDOW) return { ok: false, retryAfterMs: cur.resetAt - now };
  return { ok: true };
}

// Bound the map so a long-running instance seeing many tokens doesn't leak memory.
function maybePrune(now: number): void {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
}

// Test seam only.
export function __resetThrottle(): void {
  buckets.clear();
}
