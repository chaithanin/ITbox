/**
 * In-memory sliding-window rate limiter (per Cloud Run instance).
 * For multi-instance global limits, put Cloud Armor / API Gateway in front —
 * this is defense-in-depth at the app layer, not the only layer.
 */
const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const entries = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (entries.length >= maxRequests) {
    buckets.set(key, entries);
    return false;
  }
  entries.push(now);
  buckets.set(key, entries);
  // Opportunistic GC
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => t <= cutoff)) buckets.delete(k);
    }
  }
  return true;
}
