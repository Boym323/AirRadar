import type { AtcSector, Coordinate } from "@/lib/atc/types";
import { destination, distanceNm, pointInPolygon } from "@/lib/atc-context/geometry";

export interface SectorPredictionInput {
  longitude: number;
  latitude: number;
  track: number | null;
  groundSpeed: number | null;
  observedAt: Date;
  now?: Date;
  currentSectorId?: string | null;
  maxLookAheadNm?: number;
}

export interface SectorPrediction {
  nextSector: string;
  confidence: "high" | "medium" | "low";
  boundaryDistanceNm: number;
  estimatedEntrySeconds: number;
  source: "sector_geometry";
}

const STALE_AFTER_MS = 120_000;

function intersectionParameter(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate): number | null {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const denominator = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denominator) < 1e-12) return null; // parallel, including a boundary-following track
  const q = [c[0] - a[0], c[1] - a[1]];
  const t = (q[0] * s[1] - q[1] * s[0]) / denominator;
  const u = (q[0] * r[1] - q[1] * r[0]) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

function boundaryDistance(
  input: SectorPredictionInput,
  sector: AtcSector,
  endpoint: Coordinate,
): number | null {
  let closest: number | null = null;
  for (const polygon of sector.polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const parameter = intersectionParameter([input.longitude, input.latitude], endpoint, start, end);
      if (parameter === null) continue;
      const candidate = parameter * distanceNm([input.longitude, input.latitude], endpoint);
      if (closest === null || candidate < closest) closest = candidate;
    }
  }
  return closest;
}

/**
 * Finds the first published sector boundary on a forward ray. The work is
 * bounded by the candidate sector count and is intended for backend lookup,
 * not per-frame rendering. Parallel boundaries and stale/slow observations
 * deliberately produce no prediction.
 */
export function predictNextSectorBoundary(
  sectors: readonly AtcSector[],
  input: SectorPredictionInput,
): SectorPrediction | null {
  const now = input.now ?? new Date();
  const age = now.getTime() - input.observedAt.getTime();
  if (!Number.isFinite(age) || age < -5_000 || age > STALE_AFTER_MS) return null;
  if (input.track === null || !Number.isFinite(input.track) || input.groundSpeed === null || input.groundSpeed <= 20) return null;

  const lookAhead = input.maxLookAheadNm ?? 120;
  const endpoint = destination([input.longitude, input.latitude], lookAhead, input.track);
  const current = sectors.find((sector) => sector.id === input.currentSectorId);
  const candidates = sectors
    .filter((sector) => sector.id !== input.currentSectorId)
    .map((sector) => {
      const containsEndpoint = sector.polygons.some((polygon) => pointInPolygon(endpoint, [polygon]) !== null);
      const distance = boundaryDistance(input, sector, endpoint);
      return { sector, distance: distance ?? (containsEndpoint ? lookAhead : null), containsEndpoint };
    })
    .filter((item): item is { sector: AtcSector; distance: number; containsEndpoint: boolean } => item.distance !== null && item.distance > 0)
    .sort((a, b) => a.distance - b.distance || a.sector.id.localeCompare(b.sector.id));
  const winner = candidates[0];
  if (!winner || winner.sector.id === current?.id) return null;
  const estimatedEntrySeconds = Math.max(0, Math.round((winner.distance / input.groundSpeed) * 3600));
  const confidence: SectorPrediction["confidence"] = candidates.length === 1 ? "high" : candidates[1]!.distance - winner.distance >= 3 ? "medium" : "low";
  return { nextSector: winner.sector.id, confidence, boundaryDistanceNm: Number(winner.distance.toFixed(2)), estimatedEntrySeconds, source: "sector_geometry" };
}
