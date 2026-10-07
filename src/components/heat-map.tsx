"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { HeatCell } from "@/lib/admin/metrics";
import { createMap } from "./leaflet-base";

// Aggregated home cells only (§8.2): never individual homes.
export default function HeatMap({ cells, site, ariaLabel, labels }: { cells: HeatCell[]; site: { lat: number; lng: number; name: string }; ariaLabel: string; labels: { cell: string; coarse: string } }) {
  const el = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([cells, site, labels]);

  useEffect(() => {
    if (!el.current) return;
    const map = createMap(el.current);
    const pts: [number, number][] = [[site.lat, site.lng], ...cells.map((c) => [c.lat, c.lng] as [number, number])];
    map.fitBounds(L.latLngBounds(pts).pad(0.2));
    const max = Math.max(1, ...cells.map((c) => c.count));
    for (const c of cells) {
      L.rectangle(
        [
          [c.lat, c.lng],
          [c.lat + c.dLat, c.lng + c.dLng],
        ],
        { color: c.coarse ? "#292f4c" : "#c11f1b", weight: 1, fillOpacity: 0.15 + 0.6 * (c.count / max) },
      )
        .addTo(map)
        .bindTooltip((c.coarse ? labels.coarse : labels.cell).replace("{n}", String(c.count)));
    }
    L.circleMarker([site.lat, site.lng], { radius: 8, color: "#b3261e", fillOpacity: 0.9, interactive: false }).addTo(map).bindTooltip(site.name, { permanent: true });
    return () => {
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={el} role="group" aria-label={ariaLabel} className="h-96 w-full overflow-hidden rounded-xl border border-border" />;
}
