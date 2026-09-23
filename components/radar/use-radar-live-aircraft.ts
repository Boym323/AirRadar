"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { useAircraftStream } from "@/components/use-aircraft-stream";
import type { AircraftView, CoverageMode, PublicStateSnapshot, TrailPoint } from "@/lib/aircraft/types";
import { mergePendingAircraftChanges, type PendingAircraftChanges } from "@/lib/radar/live-aircraft-changes";
import { createLatestSnapshotScheduler, type LatestSnapshotScheduler } from "@/lib/radar/live-snapshot-scheduler";

interface UseRadarLiveAircraftOptions {
  enabled: boolean;
  activeCoverage: CoverageMode;
  selectedHexRef: MutableRefObject<string | null>;
  commitSnapshot: (snapshot: PublicStateSnapshot) => void;
  onSelectedAircraftRemoved: () => void;
  scheduleMapSync: () => void;
}

export interface RadarLiveAircraftController {
  connected: boolean;
  liveSnapshotRef: MutableRefObject<PublicStateSnapshot>;
  liveTrailsRef: MutableRefObject<Map<string, TrailPoint[]>>;
  liveAircraftByHexRef: MutableRefObject<Map<string, AircraftView>>;
  pendingAircraftChangesRef: MutableRefObject<PendingAircraftChanges | null>;
}

export function useRadarLiveAircraft({
  enabled,
  activeCoverage,
  selectedHexRef,
  commitSnapshot,
  onSelectedAircraftRemoved,
  scheduleMapSync,
}: UseRadarLiveAircraftOptions): RadarLiveAircraftController {
  const liveSnapshotRef = useRef<PublicStateSnapshot>({
    aircraft: [],
    relevantAtcFrequencies: [],
    receiver: { lat: null, lon: null, name: "" },
    fetchedAt: new Date(0).toISOString(),
    provider: "connecting",
    sourceOnline: false,
    lastSourceUpdate: null,
    sourceError: null,
    readsbOnline: false,
    lastReadsbUpdate: null,
    lastError: null,
    stats: { currentAircraft: 0, aircraftSeenToday: 0, uniqueAircraftToday: 0, maxConcurrentAircraft: 0, maxDistanceKm: 0, aircraftTypes: [], airlines: [], messagesPerSecond: null },
  });
  const liveTrailsRef = useRef<Map<string, TrailPoint[]>>(new Map());
  const liveAircraftByHexRef = useRef<Map<string, AircraftView>>(new Map());
  const pendingAircraftChangesRef = useRef<PendingAircraftChanges | null>(null);
  const reactSnapshotSchedulerRef = useRef<LatestSnapshotScheduler<PublicStateSnapshot> | null>(null);

  useEffect(() => {
    const scheduler = createLatestSnapshotScheduler<PublicStateSnapshot>({ commit: commitSnapshot });
    reactSnapshotSchedulerRef.current = scheduler;
    return () => {
      if (reactSnapshotSchedulerRef.current === scheduler) reactSnapshotSchedulerRef.current = null;
      scheduler.dispose();
    };
  }, [commitSnapshot]);

  const onSnapshot = useCallback((next: PublicStateSnapshot, change: { full: boolean; changedAircraft: AircraftView[]; removedHexes: string[] }) => {
    liveSnapshotRef.current = next;
    const aircraftByHex = liveAircraftByHexRef.current;
    if (change.full) aircraftByHex.clear();
    for (const hex of change.removedHexes) aircraftByHex.delete(hex);
    for (const aircraft of change.changedAircraft) aircraftByHex.set(aircraft.icaoHex, aircraft);
    pendingAircraftChangesRef.current = mergePendingAircraftChanges(pendingAircraftChangesRef.current, change);

    scheduleMapSync();
    reactSnapshotSchedulerRef.current?.push(next, change.full);
  }, [scheduleMapSync]);

  const { connected } = useAircraftStream({
    enabled,
    activeCoverage,
    liveTrailsRef,
    selectedHexRef,
    onSelectedAircraftRemoved,
    onSnapshot,
  });

  return {
    connected,
    liveSnapshotRef,
    liveTrailsRef,
    liveAircraftByHexRef,
    pendingAircraftChangesRef,
  };
}
