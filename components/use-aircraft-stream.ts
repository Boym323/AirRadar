import { useEffect, useState, type MutableRefObject } from "react";
import type { CoverageMode, PublicStateSnapshot, TrailPoint } from "@/lib/aircraft/types";
import { applySseV2Event } from "@/lib/aircraft/sse-v2";
import { appendTrailPoint, boundTrailPoints, trailPointFromAircraft } from "@/lib/aircraft/trail";

interface UseAircraftStreamOptions {
  activeCoverage: CoverageMode;
  liveTrailsRef: MutableRefObject<Map<string, TrailPoint[]>>;
  selectedHexRef: MutableRefObject<string | null>;
  onSelectedAircraftRemoved: () => void;
  onSnapshot: (snapshot: PublicStateSnapshot) => void;
}

export function useAircraftStream({
  activeCoverage,
  liveTrailsRef,
  selectedHexRef,
  onSelectedAircraftRemoved,
  onSnapshot,
}: UseAircraftStreamOptions): { connected: boolean } {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let current: { snapshot: PublicStateSnapshot; sequence: string } | null = null;

    const updateTrails = (next: PublicStateSnapshot) => {
      const now = Date.now();
      for (const aircraft of next.aircraft) {
        const point = trailPointFromAircraft(aircraft);
        if (!point) continue;
        const trail = liveTrailsRef.current.get(aircraft.icaoHex) ?? [];
        liveTrailsRef.current.set(aircraft.icaoHex, appendTrailPoint(trail, point, now));
      }
      const visibleHexes = new Set(next.aircraft.map((aircraft) => aircraft.icaoHex));
      for (const [hex, trail] of liveTrailsRef.current) {
        if (!visibleHexes.has(hex)) {
          liveTrailsRef.current.delete(hex);
          continue;
        }
        const bounded = boundTrailPoints(trail, now);
        if (bounded.length || hex === selectedHexRef.current) liveTrailsRef.current.set(hex, bounded);
        else liveTrailsRef.current.delete(hex);
      }
    };

    const reconnect = () => {
      if (!active || reconnectTimer !== null) return;
      source?.close();
      source = null;
      setConnected(false);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 0);
    };

    const handleEvent = (eventName: "snapshot" | "delta", event: Event) => {
      try {
        const value: unknown = JSON.parse((event as MessageEvent<string>).data);
        const result = applySseV2Event(current, eventName, value);
        if (result.status === "invalid") {
          reconnect();
          return;
        }
        if (result.status === "duplicate") return;
        const previousHex = selectedHexRef.current;
        current = { snapshot: result.snapshot, sequence: result.sequence };
        updateTrails(result.snapshot);
        if (previousHex && !result.snapshot.aircraft.some((aircraft) => aircraft.icaoHex === previousHex)) onSelectedAircraftRemoved();
        if (active) {
          onSnapshot(result.snapshot);
          setConnected(true);
        }
      } catch {
        reconnect();
      }
    };

    function connect() {
      if (!active) return;
      source = new EventSource(`/api/stream?coverage=${activeCoverage}&v=2`);
      source.addEventListener("snapshot", (event) => handleEvent("snapshot", event));
      source.addEventListener("delta", (event) => handleEvent("delta", event));
      source.onopen = () => { if (active) setConnected(true); };
      source.onerror = () => { if (active) setConnected(false); };
    }

    connect();
    return () => {
      active = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      source?.close();
      source = null;
    };
  }, [activeCoverage, liveTrailsRef, onSelectedAircraftRemoved, onSnapshot, selectedHexRef]);

  return { connected };
}
