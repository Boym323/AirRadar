import type { AtcLookup, AtcSector, AtcSectorMatch, Coordinate } from "@/lib/atc/types";
import type { AtcSectorProvider } from "@/lib/server/provider";

export class EmptyAtcSectorProvider implements AtcSectorProvider {
  readonly name = "empty";

  async getSectors(): Promise<AtcSector[]> {
    return [];
  }
}

function pointOnSegment(point: Coordinate, start: Coordinate, end: Coordinate): boolean {
  const epsilon = 1e-9;
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > epsilon) return false;
  return point[0] >= Math.min(start[0], end[0]) - epsilon && point[0] <= Math.max(start[0], end[0]) + epsilon
    && point[1] >= Math.min(start[1], end[1]) - epsilon && point[1] <= Math.max(start[1], end[1]) + epsilon;
}

function pointInPolygon(point: Coordinate, polygon: Coordinate[]): "inside" | "boundary" | null {
  if (polygon.length < 3) return null;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    if (pointOnSegment(point, prior, current)) return "boundary";
    const crosses = (current[1] > point[1]) !== (prior[1] > point[1]);
    if (crosses && point[0] < ((prior[0] - current[0]) * (point[1] - current[1])) / (prior[1] - current[1]) + current[0]) {
      inside = !inside;
    }
  }
  return inside ? "inside" : null;
}

function isValidAt(sector: AtcSector, observedAt: Date): boolean {
  const time = observedAt.getTime();
  const validFrom = sector.validFrom ? Date.parse(sector.validFrom) : Number.NEGATIVE_INFINITY;
  const validTo = sector.validTo ? Date.parse(sector.validTo) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(validFrom) && validFrom !== Number.NEGATIVE_INFINITY) return false;
  if (!Number.isFinite(validTo) && validTo !== Number.POSITIVE_INFINITY) return false;
  return time >= validFrom && time <= validTo;
}

function containsAltitude(sector: AtcSector, altitudeFt: number | null): boolean {
  if (altitudeFt === null) return true;
  return (sector.lowerAltitudeFt === null || altitudeFt >= sector.lowerAltitudeFt)
    && (sector.upperAltitudeFt === null || altitudeFt <= sector.upperAltitudeFt);
}

export function matchSector(sector: AtcSector, lookup: AtcLookup): AtcSectorMatch | null {
  const observedAt = lookup.observedAt ?? new Date();
  if (!isValidAt(sector, observedAt) || !containsAltitude(sector, lookup.altitudeFt)) return null;
  const point: Coordinate = [lookup.longitude, lookup.latitude];
  let confidence: AtcSectorMatch["confidence"] | null = null;
  for (const polygon of sector.polygons) {
    const result = pointInPolygon(point, polygon);
    if (result === "boundary") return { sector, confidence: result };
    if (result === "inside") confidence = result;
  }
  return confidence ? { sector, confidence } : null;
}

export class AtcSectorService {
  private sectors: AtcSector[] | null = null;
  private loading: Promise<AtcSector[]> | null = null;

  constructor(private readonly provider: AtcSectorProvider) {}

  async lookup(lookup: AtcLookup): Promise<AtcSectorMatch | null> {
    const sectors = await this.getSectors();
    const matches = sectors
      .map((sector) => matchSector(sector, lookup))
      .filter((match): match is AtcSectorMatch => match !== null)
      .sort((a, b) => (a.sector.upperAltitudeFt ?? Number.POSITIVE_INFINITY) - (b.sector.upperAltitudeFt ?? Number.POSITIVE_INFINITY));
    return matches[0] ?? null;
  }

  invalidate(): void {
    this.sectors = null;
  }

  private async getSectors(): Promise<AtcSector[]> {
    if (this.sectors) return this.sectors;
    this.loading ??= this.provider.getSectors()
      .then((sectors) => {
        this.sectors = sectors;
        return sectors;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }
}
