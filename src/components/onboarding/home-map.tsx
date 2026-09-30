"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pin = L.divIcon({
  className: "",
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#0b6e63;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 16));
  }, [lat, lng, map]);
  return null;
}

export default function HomeMap({
  lat,
  lng,
  onMove,
  ariaLabel,
}: {
  lat: number;
  lng: number;
  onMove: (p: { lat: number; lng: number }) => void;
  ariaLabel: string;
}) {
  return (
    <div className="h-64 w-full overflow-hidden rounded-xl border border-border" role="img" aria-label={ariaLabel}>
      <MapContainer center={[lat, lng]} zoom={16} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker
          position={[lat, lng]}
          icon={pin}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              onMove({ lat: p.lat, lng: p.lng });
            },
          }}
        />
        <Recenter lat={lat} lng={lng} />
      </MapContainer>
    </div>
  );
}
