"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type HeatMap from "./heat-map";

const Map = dynamic(() => import("./heat-map"), { ssr: false, loading: () => <div className="h-96 rounded-xl bg-surface-2" /> });

export function HeatMapClient(props: ComponentProps<typeof HeatMap>) {
  return <Map {...props} />;
}
