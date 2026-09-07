import type { AtcAssignment, AtcFrequencySummary, AtcLookup, AtcSector, AtcSectorMatch, Coordinate } from "@/lib/atc/types";
import type { AtcSectorProvider } from "@/lib/server/provider";

export class EmptyAtcSectorProvider implements AtcSectorProvider {
  readonly name = "empty";

  async getSectors(): Promise<AtcSector[]> {
    return [];
  }
}

export function assignmentFromMatch(match: AtcSectorMatch): AtcAssignment {
  const primary = match.sector.frequencies.find((frequency) => frequency.isPrimary) ?? match.sector.frequencies[0] ?? null;
  return {
    sectorId: match.sector.id,
    name: match.sector.name,
    service: match.sector.service ?? match.sector.atcCallsign,
    callsign: match.sector.atcCallsign,
    primaryFrequencyMhz: primary?.frequencyMhz ?? null,
    alternateFrequenciesMhz: match.sector.frequencies.filter((frequency) => frequency !== primary).map((frequency) => frequency.frequencyMhz),
    lowerAltitudeFt: match.sector.lowerAltitudeFt,
    upperAltitudeFt: match.sector.upperAltitudeFt,
    lowerAltitudeReference: match.sector.lowerAltitudeReference ?? null,
    upperAltitudeReference: match.sector.upperAltitudeReference ?? null,
    country: match.sector.country,
    source: match.sector.source,
    sourceReference: match.sector.sourceReference,
    validFrom: match.sector.validFrom,
    validTo: match.sector.validTo,
    lastVerifiedAt: match.sector.lastVerifiedAt,
    confidence: match.confidence,
    altitudeConfidence: match.altitudeConfidence ?? "matched",
  };
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

function containsAltitude(sector: AtcSector, altitudeFt: number | null): { matches: boolean; confidence: "matched" | "unknown" } {
  if (altitudeFt === null) return { matches: true, confidence: "unknown" };
  const lowerComparable = sector.lowerAltitudeReference !== "AGL";
  const upperComparable = sector.upperAltitudeReference !== "AGL";
  return {
    matches: (!lowerComparable || sector.lowerAltitudeFt === null || altitudeFt >= sector.lowerAltitudeFt)
      && (!upperComparable || sector.upperAltitudeFt === null || altitudeFt <= sector.upperAltitudeFt),
    confidence: lowerComparable && upperComparable ? "matched" : "unknown",
  };
}

export function matchSector(sector: AtcSector, lookup: AtcLookup): AtcSectorMatch | null {
  const observedAt = lookup.observedAt ?? new Date();
  if (!isValidAt(sector, observedAt)) return null;
  const altitude = containsAltitude(sector, lookup.altitudeFt);
  if (!altitude.matches) return null;
  const point: Coordinate = [lookup.longitude, lookup.latitude];
  let confidence: AtcSectorMatch["confidence"] | null = null;
  for (const polygon of sector.polygons) {
    const result = pointInPolygon(point, polygon);
    if (result === "boundary") return { sector, confidence: result, altitudeConfidence: altitude.confidence };
    if (result === "inside") confidence = result;
  }
  return confidence ? { sector, confidence, altitudeConfidence: altitude.confidence } : null;
}

function servicePriority(service: string | null | undefined): number {
  const normalized = service?.trim().toUpperCase() ?? "";
  if (normalized === "TWR" || normalized === "TOWER") return 10;
  if (normalized === "GND" || normalized === "GROUND") return 20;
  if (normalized === "DEL" || normalized === "DELIVERY") return 30;
  if (normalized === "APP" || normalized === "APPROACH" || normalized === "TMA") return 40;
  if (normalized === "ACC" || normalized === "AREA CONTROL" || normalized === "RADAR") return 50;
  if (normalized === "FIS") return 60;
  if (normalized === "ATIS") return 70;
  return 100;
}

function altitudeSpan(sector: AtcSector): number {
  return (sector.upperAltitudeFt ?? 100000) - (sector.lowerAltitudeFt ?? 0);
}

export function compareAtcMatches(a: AtcSectorMatch, b: AtcSectorMatch): number {
  const serviceDifference = servicePriority(a.sector.service ?? a.sector.atcCallsign) - servicePriority(b.sector.service ?? b.sector.atcCallsign);
  if (serviceDifference !== 0) return serviceDifference;
  const spanDifference = altitudeSpan(a.sector) - altitudeSpan(b.sector);
  if (spanDifference !== 0) return spanDifference;
  const upperDifference = (a.sector.upperAltitudeFt ?? Number.POSITIVE_INFINITY) - (b.sector.upperAltitudeFt ?? Number.POSITIVE_INFINITY);
  if (upperDifference !== 0) return upperDifference;
  const lowerDifference = (b.sector.lowerAltitudeFt ?? 0) - (a.sector.lowerAltitudeFt ?? 0);
  if (lowerDifference !== 0) return lowerDifference;
  if (a.confidence !== b.confidence) return a.confidence === "boundary" ? -1 : 1;
  return a.sector.id.localeCompare(b.sector.id);
}

function normalizedActivityLabel(value: string | null): string {
  return value?.trim().toUpperCase() ?? "";
}

/**
 * Aggregates only already-resolved probable ATC assignments. It deliberately
 * does not imply that an aircraft is transmitting or listening on a frequency.
 */
export function summarizeRelevantAtcFrequencies(assignments: ReadonlyArray<AtcAssignment | null | undefined>): AtcFrequencySummary[] {
  const summaries = new Map<string, Omit<AtcFrequencySummary, "callsign" | "sector"> & { callsigns: Set<string>; sectors: Set<string> }>();
  for (const assignment of assignments) {
    if (!assignment) continue;
    const frequencies = [assignment.primaryFrequencyMhz, ...assignment.alternateFrequenciesMhz]
      .filter((frequency): frequency is number => Number.isFinite(frequency));
    const seenForAssignment = new Set<number>();
    for (const frequency of frequencies) {
      if (seenForAssignment.has(frequency)) continue;
      seenForAssignment.add(frequency);
      const service = assignment.service;
      const key = `${frequency.toFixed(3)}|${normalizedActivityLabel(service ?? assignment.callsign)}`;
      const summary = summaries.get(key);
      if (summary) {
        summary.aircraftCount += 1;
        if (assignment.callsign) summary.callsigns.add(assignment.callsign);
        summary.sectors.add(assignment.name);
      } else {
        summaries.set(key, {
          frequencyMhz: frequency,
          service,
          aircraftCount: 1,
          callsigns: assignment.callsign ? new Set([assignment.callsign]) : new Set(),
          sectors: new Set([assignment.name]),
        });
      }
    }
  }
  return [...summaries.values()]
    .map(({ callsigns, sectors, ...summary }) => ({
      ...summary,
      callsign: callsigns.size ? [...callsigns].sort((a, b) => a.localeCompare(b)).join(" / ") : null,
      sector: [...sectors].sort((a, b) => a.localeCompare(b)).join(" / "),
    }))
    .sort((a, b) => b.aircraftCount - a.aircraftCount
      || a.frequencyMhz - b.frequencyMhz
      || (a.service ?? "").localeCompare(b.service ?? "")
      || (a.callsign ?? "").localeCompare(b.callsign ?? "")
      || a.sector.localeCompare(b.sector));
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
      .sort(compareAtcMatches);
    return matches[0] ?? null;
  }

  async lookupAll(lookup: AtcLookup): Promise<AtcSectorMatch[]> {
    const sectors = await this.getSectors();
    return sectors
      .map((sector) => matchSector(sector, lookup))
      .filter((match): match is AtcSectorMatch => match !== null)
      .sort(compareAtcMatches);
  }

  async getAll(): Promise<AtcSector[]> {
    return this.getSectors();
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
