"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createMap } from "../leaflet-base";

const pin = L.divIcon({
  className: "",
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#c11f1b;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

// A map with one draggable pin. The address search next to it is the keyboard
// route to the same result; the pin is the pointer route.
export default function HomeMap({
  lat,
  lng,
  onMove,
  ariaLabel,
  pinLabel,
}: {
  lat: number;
  lng: number;
  onMove: (p: { lat: number; lng: number }) => void;
  ariaLabel: string;
  pinLabel: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const moved = useRef(onMove);
  useEffect(() => {
    moved.current = onMove;
  }, [onMove]);

  useEffect(() => {
    if (!el.current) return;
    const m = createMap(el.current, { center: [lat, lng], zoom: 16 });
    const mk = L.marker([lat, lng], { icon: pin, draggable: true, title: pinLabel, alt: pinLabel }).addTo(m);
    mk.on("dragend", () => {
      const p = mk.getLatLng();
      moved.current({ lat: p.lat, lng: p.lng });
    });
    map.current = m;
    marker.current = mk;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // Created once; position changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map.current || !marker.current) return;
    marker.current.setLatLng([lat, lng]);
    map.current.setView([lat, lng], Math.max(map.current.getZoom(), 16));
  }, [lat, lng]);

  return <div ref={el} role="group" aria-label={ariaLabel} className="h-64 w-full overflow-hidden rounded-xl border border-border" />;
}
