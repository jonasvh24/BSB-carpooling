import type { LatLng } from "../geo/haversine";
import type { RouteResult, Router } from "./types";

// Memoises routes for the duration of one engine run. The geo provider has its
// own persistent GeoCache; this layer just avoids re-asking within a run.
export function memoRouter(router: Router): Router & { calls: () => number } {
  const memo = new Map<string, Promise<RouteResult>>();
  let calls = 0;
  const key = (pts: LatLng[]) => pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";");
  const wrapped = ((points: LatLng[]) => {
    const k = key(points);
    let p = memo.get(k);
    if (!p) {
      calls++;
      p = router(points);
      memo.set(k, p);
    }
    return p;
  }) as Router & { calls: () => number };
  wrapped.calls = () => calls;
  return wrapped;
}

// Run async work with a concurrency cap; public routing services dislike floods.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
