// In-memory token bucket, good for a single instance. For multi-instance
// deployments swap this for a shared store (e.g. Redis with the same
// bucket semantics) — the call sites only depend on this function signature.

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export interface RateLimitOptions {
  /** Burst size — how many requests are allowed instantly. */
  capacity: number;
  /** Sustained refill rate in tokens per second. */
  refillPerSecond: number;
}

/** Returns true when the request is allowed, false when rate-limited. */
export function rateLimit(key: string, opts: RateLimitOptions): boolean {
  const now = Date.now();

  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    // Drop the oldest entry to bound memory under key churn.
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
  }

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: opts.capacity, updatedAt: now };
    buckets.set(key, bucket);
  }

  const elapsedSeconds = (now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsedSeconds * opts.refillPerSecond);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
