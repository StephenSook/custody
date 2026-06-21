"use client";

import { useEffect, useState } from "react";

export interface RegionState {
  region: string;
  consent: { status: string; lastSeq: number; lastEntryHash: string } | null;
  spend: { totalMinor: string; capMinor: string; lastSeq: number } | null;
  at?: number;
}

export type StreamStatus = "connecting" | "live" | "error";

/**
 * Subscribe to a region's SSE projection stream. Returns the latest state and a status.
 * Reconnects via the browser EventSource. Without a live DB the stream emits "error"
 * events and status becomes "error" (honest standby), not fabricated data.
 */
export function useRegionStream(
  region: "east" | "west",
  userId?: string,
  minorId?: string,
): { state: RegionState | null; status: StreamStatus } {
  const [state, setState] = useState<RegionState | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");

  useEffect(() => {
    const qs = new URLSearchParams();
    if (userId) qs.set("userId", userId);
    if (minorId) qs.set("minorId", minorId);
    const source = new EventSource(`/api/stream/${region}?${qs.toString()}`);

    source.addEventListener("ready", () => setStatus("connecting"));
    source.addEventListener("state", (event) => {
      try {
        setState(JSON.parse((event as MessageEvent).data) as RegionState);
        setStatus("live");
      } catch {
        setStatus("error");
      }
    });
    source.addEventListener("error", () => setStatus("error"));
    source.onerror = () => setStatus("error");

    return () => source.close();
  }, [region, userId, minorId]);

  return { state, status };
}
