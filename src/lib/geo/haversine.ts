export type LatLng = { lat: number; lng: number };

const R = 6371000; // metres

export function haversineM(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const haversineKm = (a: LatLng, b: LatLng) => haversineM(a, b) / 1000;

// Point at `distanceM` metres from `from` along `bearingDeg` (0 = north).
export function destination(from: LatLng, bearingDeg: number, distanceM: number): LatLng {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const δ = distanceM / R;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(from.lat);
  const λ1 = toRad(from.lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lng: toDeg(λ2) };
}

// No routing available: straight line × 1.3 at 35 km/h for ≤ 10 km, 55 km/h beyond.
// The speed is chosen from the whole route so a pooled route and its direct
// baseline are priced consistently.
export function fallbackRoute(points: LatLng[]): {
  distanceM: number;
  durationS: number;
  legs: { distanceM: number; durationS: number }[];
} {
  const legDist = [];
  for (let i = 1; i < points.length; i++) legDist.push(haversineM(points[i - 1], points[i]) * 1.3);
  const distanceM = legDist.reduce((a, b) => a + b, 0);
  const kmh = distanceM <= 10_000 ? 35 : 55;
  const legs = legDist.map((d) => ({ distanceM: Math.round(d), durationS: Math.round((d / 1000 / kmh) * 3600) }));
  return { distanceM: Math.round(distanceM), durationS: legs.reduce((a, l) => a + l.durationS, 0), legs };
}
