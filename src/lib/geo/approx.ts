import type { LatLng } from "./haversine";

const M_PER_DEG_LAT = 111_320;

// Cell size in degrees for a grid of `cellM` metres at this latitude. Deriving
// the longitude step from cos(lat) keeps cells roughly square anywhere on Earth.
export function cellSizeDeg(lat: number, cellM: number): { dLat: number; dLng: number } {
  const dLat = cellM / M_PER_DEG_LAT;
  const dLng = cellM / (M_PER_DEG_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { dLat, dLng };
}

// The longitude step is taken from the row's centre latitude, not the point's,
// so every point in a row agrees on where the column boundaries are.
function cellIndex(p: LatLng, cellM: number) {
  const { dLat } = cellSizeDeg(p.lat, cellM);
  const row = Math.floor(p.lat / dLat);
  const rowLat = (row + 0.5) * dLat;
  const { dLng } = cellSizeDeg(rowLat, cellM);
  const col = Math.floor(p.lng / dLng);
  return { row, col, dLat, dLng };
}

export function snapToCell(p: LatLng, cellM: number): LatLng {
  const { row, col, dLat, dLng } = cellIndex(p, cellM);
  return { lat: (row + 0.5) * dLat, lng: (col + 0.5) * dLng };
}

export function cellKey(p: LatLng, cellM: number): string {
  const { row, col } = cellIndex(p, cellM);
  return `${row}:${col}`;
}

// Small stable hash so the same user always gets the same offset.
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const APPROX_CELL_M = 500;
export const APPROX_RADIUS_M = 400;

// §9.2: snap the home to a ~500 m grid, then nudge by a deterministic offset
// (≤ ±100 m per axis, derived from the user id) so the displayed circle never
// sits exactly on a grid line and cannot be inverted to a cell corner.
export function approximateLocation(home: LatLng, userId: string): LatLng {
  const centre = snapToCell(home, APPROX_CELL_M);
  const { dLat, dLng } = cellSizeDeg(centre.lat, APPROX_CELL_M);
  const h = hash32(userId);
  const fx = ((h & 0xffff) / 0xffff) * 0.4 - 0.2; // -0.2 .. 0.2 of a cell
  const fy = (((h >>> 16) & 0xffff) / 0xffff) * 0.4 - 0.2;
  return { lat: centre.lat + fy * dLat, lng: centre.lng + fx * dLng };
}
