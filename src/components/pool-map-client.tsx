"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type PoolMap from "./pool-map";

// Leaflet touches `window` at import time, so the map is client-only.
const Map = dynamic(() => import("./pool-map"), { ssr: false, loading: () => <div className="h-72 rounded-xl bg-surface-2" /> });

export function PoolMapClient(props: ComponentProps<typeof PoolMap>) {
  return <Map {...props} />;
}
