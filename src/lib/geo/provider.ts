import { z } from "zod";
import { db } from "../db";
import { env } from "../env";
import { ptKey, type LatLng } from "./haversine";
import { withFallback } from "./with-fallback";
import type { RouteResult, Router } from "../matching/types";

// The only module that talks to external geo services. Swapping Mapbox/Google/ORS
// in later means reimplementing these three functions; callers never change.

export type GeocodeHit = { label: string; lat: number; lng: number };

const round = (n: number) => n.toFixed(4);

async function cached<T>(kind: "GEOCODE" | "REVERSE" | "ROUTE", key: string, schema: z.ZodType<T>, fetcher: () => Promise<T>): Promise<T> {
  const fullKey = `${kind}:${key}`;
  const hit = await db.geoCache.findUnique({ where: { key: fullKey } });
  if (hit) {
    const parsed = schema.safeParse(JSON.parse(hit.value));
    if (parsed.success) return parsed.data;
  }
  const value = await fetcher();
  await db.geoCache
    .upsert({ where: { key: fullKey }, create: { key: fullKey, kind, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } })
    .catch(() => {});
  return value;
}

const headers = { "User-Agent": env.GEO_USER_AGENT, Accept: "application/json" };

const GeocodeHits = z.array(z.object({ label: z.string(), lat: z.number(), lng: z.number() }));

// Photon (komoot) allows per-keystroke search; results are biased towards `near`.
export async function geocode(query: string, near?: LatLng): Promise<GeocodeHit[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const key = `${q}|${near ? ptKey(near) : ""}`;
  return cached("GEOCODE", key, GeocodeHits, async () => {
    const url = new URL("/api/", env.PHOTON_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "6");
    url.searchParams.set("lang", "en");
    if (near) {
      url.searchParams.set("lat", String(near.lat));
      url.searchParams.set("lon", String(near.lng));
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Photon ${res.status}`);
    const json = (await res.json()) as {
      features: Array<{ geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }>;
    };
    return json.features.map((f) => {
      const p = f.properties;
      const street = [p.street ?? p.name, p.housenumber].filter(Boolean).join(" ");
      const label = [street, [p.postcode, p.city ?? p.locality ?? p.county].filter(Boolean).join(" "), p.country]
        .filter(Boolean)
        .join(", ");
      return { label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
    });
  });
}

// Nominatim's usage policy: at most one request per second and an identifying User-Agent.
let nominatimGate: Promise<void> = Promise.resolve();
function throttledNominatim<T>(fn: () => Promise<T>): Promise<T> {
  const run = nominatimGate.then(fn);
  nominatimGate = run.then(
    () => new Promise((r) => setTimeout(r, 1100)),
    () => new Promise((r) => setTimeout(r, 1100)),
  );
  return run;
}

export async function reverseGeocode(p: LatLng): Promise<string> {
  return cached("REVERSE", ptKey(p), z.string(), () =>
    throttledNominatim(async () => {
      const url = new URL("/reverse", env.NOMINATIM_URL);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", String(p.lat));
      url.searchParams.set("lon", String(p.lng));
      url.searchParams.set("zoom", "18");
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      if (!res.ok) {
        // Nominatim refuses some User-Agents outright (403). Photon's reverse endpoint is
        // the fallback before giving up and showing bare coordinates.
        const viaPhoton = await photonReverse(p).catch(() => null);
        if (viaPhoton) return viaPhoton;
        throw new Error(`Nominatim ${res.status}`);
      }
      const json = (await res.json()) as { display_name?: string; address?: Record<string, string> };
      const a = json.address ?? {};
      const street = [a.road, a.house_number].filter(Boolean).join(" ");
      const town = a.city ?? a.town ?? a.village ?? a.municipality ?? "";
      const short = [street, [a.postcode, town].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      return short || json.display_name || `${round(p.lat)}, ${round(p.lng)}`;
    }),
  );
}

async function photonReverse(p: LatLng): Promise<string | null> {
  const url = new URL("/reverse", env.PHOTON_URL);
  url.searchParams.set("lat", String(p.lat));
  url.searchParams.set("lon", String(p.lng));
  url.searchParams.set("lang", "en");
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const json = (await res.json()) as { features?: Array<{ properties: Record<string, string | undefined> }> };
  const f = json.features?.[0]?.properties;
  if (!f) return null;
  const street = [f.street ?? f.name, f.housenumber].filter(Boolean).join(" ");
  const town = f.city ?? f.locality ?? f.county ?? "";
  return [street, [f.postcode, town].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
}

const RouteSchema = z.object({
  durationS: z.number(),
  distanceM: z.number(),
  legs: z.array(z.object({ durationS: z.number(), distanceM: z.number() })),
  estimated: z.boolean(),
  geometry: z.array(z.tuple([z.number(), z.number()])).optional(),
});
export type RouteWithGeometry = z.infer<typeof RouteSchema>;

// Optional spacing of routing requests (OSRM_MIN_INTERVAL_MS), same pattern as Nominatim.
let osrmGate: Promise<void> = Promise.resolve();
function spacedOsrm<T>(fn: () => Promise<T>): Promise<T> {
  if (env.OSRM_MIN_INTERVAL_MS <= 0) return fn();
  const wait = () => new Promise<void>((r) => setTimeout(r, env.OSRM_MIN_INTERVAL_MS));
  const run = osrmGate.then(fn);
  osrmGate = run.then(wait, wait);
  return run;
}

async function osrm(points: LatLng[], geometry: boolean): Promise<RouteWithGeometry> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = new URL(`/route/v1/driving/${coords}`, env.OSRM_URL);
  url.searchParams.set("overview", geometry ? "full" : "false");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const json = (await res.json()) as {
    code: string;
    routes?: Array<{ duration: number; distance: number; legs: Array<{ duration: number; distance: number }>; geometry?: { coordinates: [number, number][] } }>;
  };
  const r = json.routes?.[0];
  if (json.code !== "Ok" || !r) throw new Error(`OSRM ${json.code}`);
  return {
    durationS: r.duration,
    distanceM: r.distance,
    legs: r.legs.map((l) => ({ durationS: l.duration, distanceM: l.distance })),
    estimated: false,
    geometry: geometry ? r.geometry?.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]) : undefined,
  };
}

// Durations only; cached; falls back to the haversine heuristic when OSRM is unavailable.
export const route: Router = withFallback(
  (points: LatLng[]): Promise<RouteResult> =>
    cached("ROUTE", points.map(ptKey).join(";"), RouteSchema, () => spacedOsrm(() => osrm(points, false))),
  (err) => console.warn(`[geo] routing failed, using fallback: ${(err as Error).message}`),
);

// Same, with the polyline for drawing on the pool map. Falls back to straight lines.
export async function routeGeometry(points: LatLng[]): Promise<RouteWithGeometry> {
  try {
    return await cached("ROUTE", `geom:${points.map(ptKey).join(";")}`, RouteSchema, () => spacedOsrm(() => osrm(points, true)));
  } catch (err) {
    console.warn(`[geo] route geometry failed: ${(err as Error).message}`);
    const r = await route(points);
    return { ...r, geometry: points.map((p) => [p.lat, p.lng] as [number, number]) };
  }
}
