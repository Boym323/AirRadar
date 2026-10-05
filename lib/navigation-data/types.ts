export type AviationNavPointKind = "NAVAID" | "FIX";

export interface AviationNavPoint {
  id: string;
  kind: AviationNavPointKind;
  type: string | null;
  name: string | null;
  latitude: number;
  longitude: number;
  elevationFt: number | null;
  frequencyMhz: number | null;
  magneticDeclination: string | null;
  state: string | null;
  country: string | null;
  source: "Aviation Weather Center";
}

export interface AviationNavDataSnapshot {
  points: AviationNavPoint[];
  fetchedAt: string;
  stale: boolean;
  cacheSource: "live" | "memory-cache" | "stale-cache";
  snapshotAgeMs: number;
  truncated: boolean;
  source: "Aviation Weather Center";
  query: {
    latitude: number;
    longitude: number;
    radiusNm: number;
    kinds: AviationNavPointKind[];
  };
}
