"use client";

import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const icon = (color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

export type MapStop = { lat: number; lng: number; label: string; kind: "driver" | "stop" | "site" };

// Route polyline plus labelled stops. Exact home coordinates are shown here
// only because every viewer is a member of this pool (§9.2).
export default function PoolMap({ stops, line, ariaLabel }: { stops: MapStop[]; line: [number, number][]; ariaLabel: string }) {
  const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number]));
  return (
    <div className="h-72 w-full overflow-hidden rounded-xl border border-border" role="img" aria-label={ariaLabel}>
      <MapContainer bounds={bounds.pad(0.2)} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {line.length > 1 && <Polyline positions={line} pathOptions={{ color: "#292f4c", weight: 4 }} />}
        {stops.map((s, i) => (
          <Marker key={i} position={[s.lat, s.lng]} icon={icon(s.kind === "site" ? "#c11f1b" : s.kind === "driver" ? "#292f4c" : "#d0a63b")}>
            <Tooltip permanent direction="top" offset={[0, -8]}>
              {s.label}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
