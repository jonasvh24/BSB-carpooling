"use client";

import { MapContainer, Rectangle, TileLayer, Tooltip, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { HeatCell } from "@/lib/admin/metrics";

// Aggregated home cells only (§8.2): never individual homes.
export default function HeatMap({ cells, site }: { cells: HeatCell[]; site: { lat: number; lng: number; name: string } }) {
  const pts: [number, number][] = [[site.lat, site.lng], ...cells.map((c) => [c.lat, c.lng] as [number, number])];
  const bounds = L.latLngBounds(pts).pad(0.2);
  const max = Math.max(1, ...cells.map((c) => c.count));
  return (
    <div className="h-96 w-full overflow-hidden rounded-xl border border-border">
      <MapContainer bounds={bounds} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {cells.map((c, i) => (
          <Rectangle
            key={i}
            bounds={[
              [c.lat, c.lng],
              [c.lat + c.dLat, c.lng + c.dLng],
            ]}
            pathOptions={{ color: c.coarse ? "#292f4c" : "#c11f1b", weight: 1, fillOpacity: 0.15 + 0.6 * (c.count / max) }}
          >
            <Tooltip>{`${c.count} staff${c.coarse ? " (3 km cell)" : ""}`}</Tooltip>
          </Rectangle>
        ))}
        <CircleMarker center={[site.lat, site.lng]} radius={8} pathOptions={{ color: "#b3261e", fillOpacity: 0.9 }}>
          <Tooltip permanent>{site.name}</Tooltip>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
