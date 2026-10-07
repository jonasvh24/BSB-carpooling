"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createMap, dot } from "./leaflet-base";

export type MapStop = { lat: number; lng: number; label: string; kind: "driver" | "stop" | "site" };

const colour = { site: "#c11f1b", driver: "#292f4c", stop: "#d0a63b" } as const;

// Route polyline plus labelled stops. Exact home coordinates are shown here
// only because every viewer is a member of this pool (§9.2). The same stops and
// times are in the timetable above the map, so the markers are not focusable.
export default function PoolMap({ stops, line, ariaLabel }: { stops: MapStop[]; line: [number, number][]; ariaLabel: string }) {
  const el = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([stops, line.length]);

  useEffect(() => {
    if (!el.current || stops.length === 0) return;
    const map = createMap(el.current);
    map.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number])).pad(0.2));
    if (line.length > 1) L.polyline(line, { color: "#292f4c", weight: 4 }).addTo(map);
    for (const s of stops) {
      L.marker([s.lat, s.lng], { icon: dot(colour[s.kind]), keyboard: false, interactive: false })
        .addTo(map)
        .bindTooltip(s.label, { permanent: true, direction: "top", offset: [0, -8] });
    }
    return () => {
      map.remove();
    };
    // `key` stands for stops and line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={el} role="group" aria-label={ariaLabel} className="h-72 w-full overflow-hidden rounded-xl border border-border" />;
}
