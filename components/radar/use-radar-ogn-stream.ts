"use client";

import { useEffect } from "react";
import type { OgnStateSnapshot } from "@/lib/ogn/types";

type OgnSnapshotHandler = (snapshot: OgnStateSnapshot) => void;
type RadarEventSource = Pick<EventSource, "addEventListener" | "removeEventListener" | "close">;

export function subscribeToOgnStream(
  onSnapshot: OgnSnapshotHandler,
  createSource: () => RadarEventSource = () => new EventSource("/api/ogn/stream"),
): () => void {
  let active = true;
  const source = createSource();
  const handleSnapshot = (event: Event) => {
    try {
      const next = JSON.parse((event as MessageEvent<string>).data) as OgnStateSnapshot;
      if (active && next.enabled) onSnapshot(next);
    } catch {
      // Ignore malformed events and allow EventSource to reconnect.
    }
  };
  source.addEventListener("snapshot", handleSnapshot);
  return () => {
    active = false;
    source.removeEventListener("snapshot", handleSnapshot);
    source.close();
  };
}

/** Opens the OGN stream only while its map layer is enabled. */
export function useRadarOgnStream(
  enabled: boolean | null,
  showOgn: boolean,
  onSnapshot: OgnSnapshotHandler,
): void {
  useEffect(() => {
    if (enabled !== true || !showOgn) return;
    return subscribeToOgnStream(onSnapshot);
  }, [enabled, onSnapshot, showOgn]);
}
