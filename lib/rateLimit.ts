/**
 * In-memory sliding-window rate limiter for PUBLIC APIs.
 *
 * Keyed by client IP. Best-effort: each serverless instance keeps its own
 * window (Vercel may run multiple instances), so the effective limit is
 * `limit × instances` worst-case — enough to stop abuse without external
 * infrastructure. `limit` defaults to 100 requests / hour per IP (spec).
 */
type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit = 100,
  windowMs = 60 * 60 * 1000
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const retryAfter = Math.ceil((bucket.hits[0] + windowMs - now) / 1000);
    buckets.set(key, bucket);
    return { ok: false, retryAfterSeconds: Math.max(retryAfter, 1) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 5000) {
    // Prevent unbounded growth from rotating IPs.
    for (const [k, b] of Array.from(buckets.entries())) {
      if (b.hits.length === 0 || now - b.hits[b.hits.length - 1] > windowMs) buckets.delete(k);
      if (buckets.size <= 4000) break;
    }
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/** Best-effort client IP extraction behind Vercel's proxy. */
export function clientIp(req: Request): string {
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
