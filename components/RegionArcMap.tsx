"use client";

import type { DeckProps } from "@deck.gl/core";
import { ArcLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { motion, useReducedMotion } from "motion/react";
import { Map as MapGL, useControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { StreamStatus } from "./useRegionStream";

// deck.gl rides on top of the MapLibre map via MapboxOverlay (MapLibre implements the same
// IControl API). This whole component is WebGL and must be imported with next/dynamic ssr:false.
function DeckOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

// Approximate AWS region locations (N. Virginia, Ohio) for the visual arc.
const US_EAST_1: [number, number] = [-78.45, 38.13];
const US_EAST_2: [number, number] = [-82.99, 39.96];

interface RegionArcMapProps {
  east: StreamStatus;
  west: StreamStatus;
  lastLatencyMs: number | null;
  pulseKey: number;
}

export default function RegionArcMap({ east, west, lastLatencyMs, pulseKey }: RegionArcMapProps) {
  const reduce = useReducedMotion();
  const layers = [
    new ArcLayer<{ from: [number, number]; to: [number, number] }>({
      id: "region-arc",
      data: [{ from: US_EAST_1, to: US_EAST_2 }],
      getSourcePosition: (d) => d.from,
      getTargetPosition: (d) => d.to,
      getSourceColor: [30, 210, 143],
      getTargetColor: [124, 160, 255],
      getWidth: 3,
      getHeight: 0.55,
      greatCircle: true,
    }),
  ];

  return (
    <div className="relative h-[340px] w-full overflow-hidden rounded-lg border border-border">
      <MapGL
        initialViewState={{ longitude: -80.7, latitude: 39, zoom: 4.1 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      >
        <DeckOverlay layers={layers} />
      </MapGL>
      {!reduce && pulseKey > 0 && (
        <motion.span
          key={pulseKey}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent"
          style={{ width: 80, height: 80 }}
          initial={{ scale: 0.3, opacity: 0.7 }}
          animate={{ scale: 3.2, opacity: 0 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3 font-mono text-[10px] uppercase tracking-wider text-muted">
        <span>us-east-1 · {east}</span>
        <span className="neon text-accent">
          {lastLatencyMs != null
            ? `commit visible in us-east-2 · ${lastLatencyMs}ms`
            : "strongly consistent on commit"}
        </span>
        <span>us-east-2 · {west}</span>
      </div>
    </div>
  );
}
