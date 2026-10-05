"use client";

import { useMemo } from "react";
import { useDatasetQuery } from "@/components/use-dataset-query";
import type { AviationNavDataSnapshot, AviationNavPoint } from "@/lib/navigation-data/types";

function isPoint(value: unknown): value is AviationNavPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<AviationNavPoint>;
  return (point.kind === "NAVAID" || point.kind === "FIX")
    && typeof point.id === "string"
    && typeof point.latitude === "number"
    && typeof point.longitude === "number";
}

function parseSnapshot(value: unknown): AviationNavDataSnapshot {
  if (!value || typeof value !== "object") throw new Error("invalid aviation nav response");
  const snapshot = value as Partial<AviationNavDataSnapshot> & { points?: unknown[] };
  if (!Array.isArray(snapshot.points)) throw new Error("invalid aviation nav points");
  return {
    points: snapshot.points.filter(isPoint),
    fetchedAt: typeof snapshot.fetchedAt === "string" ? snapshot.fetchedAt : new Date(0).toISOString(),
    stale: snapshot.stale === true,
    cacheSource: snapshot.cacheSource === "memory-cache" || snapshot.cacheSource === "stale-cache" ? snapshot.cacheSource : "live",
    snapshotAgeMs: typeof snapshot.snapshotAgeMs === "number" ? snapshot.snapshotAgeMs : 0,
    truncated: snapshot.truncated === true,
    source: "Aviation Weather Center",
    query: snapshot.query && typeof snapshot.query === "object"
      ? snapshot.query
      : { latitude: 0, longitude: 0, radiusNm: 120, kinds: ["NAVAID", "FIX"] },
  };
}

export function useRadarNavDataContext({
  enabled,
  latitude,
  longitude,
  radiusNm = 120,
}: {
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusNm?: number;
}) {
  const available = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude);
  const url = available
    ? `/api/navigation/data?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}&radiusNm=${radiusNm}&kinds=NAVAID,FIX`
    : "/api/navigation/data";

  const dataset = useDatasetQuery<AviationNavDataSnapshot>({
    url,
    enabled: enabled && available,
    cache: "force-cache",
    parse: async (response) => {
      if (!response.ok) throw new Error(`aviation nav HTTP ${response.status}`);
      return parseSnapshot(await response.json());
    },
    itemCount: (value) => value.points.length,
  });

  const points = useMemo(() => dataset.data?.points ?? [], [dataset.data?.points]);
  return { dataset, points, snapshot: dataset.data ?? null };
}
