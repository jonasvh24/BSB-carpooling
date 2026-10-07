import L from "leaflet";

// Tile source and attribution come from the environment so a paid or self-hosted
// tile server can replace the public OpenStreetMap one without a code change.
// The attribution is a licence condition of the map data and is always shown.
const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function createMap(el: HTMLElement, options: L.MapOptions = {}): L.Map {
  const map = L.map(el, { scrollWheelZoom: false, ...options });
  L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
  return map;
}

export function dot(color: string, size = 18): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
