import { fallbackRoute, type LatLng } from "./haversine";
import type { RouteResult, Router } from "../matching/types";

// Wraps a router so a failing provider degrades to the haversine heuristic and
// the result is flagged `estimated` (brief §2.2, scenario 10).
export function withFallback(router: Router, onError?: (err: unknown) => void): Router {
  return async (points: LatLng[]): Promise<RouteResult> => {
    try {
      return await router(points);
    } catch (err) {
      onError?.(err);
      return { ...fallbackRoute(points), estimated: true };
    }
  };
}
