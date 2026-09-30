// In-memory sliding window. Enough for a single-process pilot; swap for Redis
// if the app is ever run on more than one instance.
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

// Prevent unbounded growth from many distinct keys.
setInterval(() => {
  const now = Date.now();
  for (const [k, hits] of buckets) {
    if (hits.every((t) => now - t > 60 * 60 * 1000)) buckets.delete(k);
  }
}, 10 * 60 * 1000).unref?.();
