import { useEffect, useState, type MutableRefObject } from "react";
import type { CoverageMode, PublicStateSnapshot, TrailPoint } from "@/lib/aircraft/types";
import { applySseV2Event, type SseV2ClientState } from "@/lib/aircraft/sse-v2";
import { appendBoundedLiveTrailPoint, trailPointFromAircraft } from "@/lib/aircraft/trail";

const FORCED_RECONNECT_BASE_MS = 250;
const FORCED_RECONNECT_MAX_MS = 10_000;

export function forcedReconnectDelayMs(attempt: number): number {
  const boundedAttempt = Math.min(10, Math.max(0, Math.floor(attempt)));
  return Math.min(FORCED_RECONNECT_MAX_MS, FORCED_RECONNECT_BASE_MS * (2 ** boundedAttempt));
}

interface UseAircraftStreamOptions {
  enabled?: boolean;
  activeCoverage: CoverageMode;
  liveTrailsRef: MutableRefObject<Map<string, TrailPoint[]>>;
  selectedHexRef: MutableRefObject<string | null>;
  onSelectedAircraftRemoved: () => void;
  onSnapshot: (snapshot: PublicStateSnapshot, change: { full: boolean; changedAircraft: PublicStateSnapshot["aircraft"]; removedHexes: string[] }) => void;
}

export function useAircraftStream({
  enabled = true,
  activeCoverage,
  liveTrailsRef,
  selectedHexRef,
  onSelectedAircraftRemoved,
  onSnapshot,
}: UseAircraftStreamOptions): { connected: boolean } {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }
    let active = true;
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let current: SseV2ClientState | null = null;

    const updateTrails = (next: PublicStateSnapshot, changedHexes: string[], removedHexes: string[], full: boolean) => {
      const changed = full ? next.aircraft.map((aircraft) => aircraft.icaoHex) : changedHexes;
      for (const hex of changed) {
        const aircraft = current?.aircraftByHex.get(hex);
        if (!aircraft) continue;
        const point = trailPointFromAircraft(aircraft);
        if (!point) continue;
        const trail = liveTrailsRef.current.get(aircraft.icaoHex) ?? [];
        const previous = trail.at(-1);
        if (previous && Date.parse(point.recordedAt) <= Date.parse(previous.recordedAt)) continue;
        liveTrailsRef.current.set(aircraft.icaoHex, appendBoundedLiveTrailPoint(trail, point));
      }
      if (full) {
        const visibleHexes = new Set(next.aircraft.map((aircraft) => aircraft.icaoHex));
        for (const [hex, trail] of liveTrailsRef.current) {
          if (!visibleHexes.has(hex)) {
            liveTrailsRef.current.delete(hex);
            continue;
          }
          if (trail.length || hex === selectedHexRef.current) liveTrailsRef.current.set(hex, trail);
          else liveTrailsRef.current.delete(hex);
        }
      } else {
        for (const hex of removedHexes) liveTrailsRef.current.delete(hex);
      }
    };

    const reconnect = () => {
      if (!active || reconnectTimer !== null) return;
      source?.close();
      source = null;
      setConnected(false);
      const delayMs = forcedReconnectDelayMs(reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delayMs);
    };

    const handleEvent = (eventName: "snapshot" | "delta", event: Event) => {
      try {
        const value: unknown = JSON.parse((event as MessageEvent<string>).data);
        const result = applySseV2Event(current, eventName, value);
        if (result.status === "invalid") {
          reconnect();
          return;
        }
        if (result.status === "duplicate") {
          reconnectAttempt = 0;
          return;
        }
        reconnectAttempt = 0;
        const previousHex = selectedHexRef.current;
        current = result.state;
        updateTrails(result.snapshot, result.changedHexes, result.removedHexes, eventName === "snapshot");
        if (previousHex && (eventName === "snapshot" ? !result.state.aircraftByHex.has(previousHex) : result.removedHexes.includes(previousHex))) onSelectedAircraftRemoved();
        if (active) {
          onSnapshot(result.snapshot, { full: eventName === "snapshot", changedAircraft: result.changedAircraft, removedHexes: result.removedHexes });
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
  }, [activeCoverage, enabled, liveTrailsRef, onSelectedAircraftRemoved, onSnapshot, selectedHexRef]);

  return { connected };
}
