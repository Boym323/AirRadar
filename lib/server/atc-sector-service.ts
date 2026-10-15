import type { AtcAssignment, AtcFrequencySummary, AtcLookup, AtcSector, AtcSectorMatch, Coordinate } from "@/lib/atc/types";
import { isSupportedAtcFrequencyMhz } from "@/lib/atc/frequency-policy";
import type { AtcSectorProvider } from "@/lib/server/provider";
import { isAtcValidityValid } from "@/lib/server/atc-validity";
import { getAtcSectorCandidatesFromIndex, prepareAtcSectorDatasetAsync } from "@/lib/atc-context/engine";
import type { PreparedAtcSectorDataset } from "@/lib/atc-context/types";
import { measureRuntime, measureRuntimeAsync } from "@/lib/server/runtime-performance";

const ATC_FRESHNESS_CHECK_MS = 30_000;
const ATC_FRESHNESS_ERROR_MAX_MS = 5 * 60_000;
const ATC_FULL_SNAPSHOT_REFRESH_MS = 5 * 60_000;

function sameSectorSnapshot(left: readonly AtcSector[], right: readonly AtcSector[]): boolean {
  return left.length === right.length && left.every((sector, index) => sector === right[index]);
}

export class EmptyAtcSectorProvider implements AtcSectorProvider {
  readonly name = "empty";

  async getSectors(): Promise<AtcSector[]> {
    return [];
  }
}

export function assignmentFromMatch(match: AtcSectorMatch): AtcAssignment {
  const frequencies = match.sector.frequencies.filter((frequency) => isSupportedAtcFrequencyMhz(frequency.frequencyMhz));
  const primary = frequencies.find((frequency) => frequency.isPrimary) ?? frequencies[0] ?? null;
  return {
    sectorId: match.sector.id,
    name: match.sector.name,
    service: match.sector.service ?? match.sector.atcCallsign,
    airspaceType: match.sector.airspaceType ?? null,
    callsign: match.sector.atcCallsign,
    primaryFrequencyMhz: primary?.frequencyMhz ?? null,
    alternateFrequenciesMhz: frequencies.filter((frequency) => frequency !== primary).map((frequency) => frequency.frequencyMhz),
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

export function matchSector(sector: AtcSector, lookup: AtcLookup, onPolygonTest?: () => void): AtcSectorMatch | null {
  const observedAt = lookup.observedAt ?? new Date();
  if (!isAtcValidityValid(sector.validFrom, sector.validTo, observedAt)) return null;
  const altitude = containsAltitude(sector, lookup.altitudeFt);
  if (!altitude.matches) return null;
  const point: Coordinate = [lookup.longitude, lookup.latitude];
  let confidence: AtcSectorMatch["confidence"] | null = null;
  for (const polygon of sector.polygons) {
    onPolygonTest?.();
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

export interface AtcAssignedAircraft {
  /** Stable live-aircraft identity; this is used to prevent double counting. */
  aircraftId: string;
  label?: string | null;
  assignment: AtcAssignment | null | undefined;
}

function isAtcAssignedAircraft(value: AtcAssignedAircraft | AtcAssignment | null | undefined): value is AtcAssignedAircraft {
  return Boolean(value && typeof value === "object" && "assignment" in value);
}

function confidenceScore(assignment: AtcAssignment): number {
  if (assignment.confidence === "inside" && assignment.altitudeConfidence !== "unknown") return 3;
  if (assignment.confidence === "boundary" && assignment.altitudeConfidence !== "unknown") return 2;
  return assignment.confidence === "inside" ? 1 : 0;
}

function confidenceLevel(score: number, aircraftCount: number): "high" | "medium" | "low" {
  if (aircraftCount > 0 && score / aircraftCount === 3) return "high";
  return score / Math.max(1, aircraftCount) >= 1.5 ? "medium" : "low";
}

function joinSorted(values: Set<string>): string | null {
  return values.size ? [...values].sort((a, b) => a.localeCompare(b)).join(" / ") : null;
}

interface AtcFrequencySummaryAccumulator {
  frequencyMhz: number;
  services: Set<string>;
  callsigns: Set<string>;
  airspaceTypes: Set<string>;
  sectors: Set<string>;
  sources: Set<string>;
  aircraftIds: Set<string>;
  aircraftLabels: Map<string, string>;
  positionInside: number;
  positionBoundary: number;
  altitudeMatched: number;
  altitudeUnknown: number;
  confidenceScore: number;
}

/**
 * Aggregates only already-resolved probable ATC assignments. It deliberately
 * does not imply that an aircraft is transmitting or listening on a frequency.
 */
export function summarizeRelevantAtcFrequencies(input: ReadonlyArray<AtcAssignedAircraft | AtcAssignment | null | undefined>): AtcFrequencySummary[] {
  const summaries = new Map<string, AtcFrequencySummaryAccumulator>();
  const aircraft = input.map((item, index) => isAtcAssignedAircraft(item)
    ? item
    : { aircraftId: `legacy-${index}`, label: null, assignment: item });
  for (const item of aircraft) {
    const assignment = item.assignment;
    if (!assignment) continue;
    const frequencies = [assignment.primaryFrequencyMhz, ...assignment.alternateFrequenciesMhz]
      .filter((frequency): frequency is number => typeof frequency === "number" && isSupportedAtcFrequencyMhz(frequency));
    const seenForAssignment = new Set<number>();
    for (const frequency of frequencies) {
      if (seenForAssignment.has(frequency)) continue;
      seenForAssignment.add(frequency);
      const service = assignment.service;
      const callsignKey = normalizedActivityLabel(assignment.callsign);
      const serviceKey = normalizedActivityLabel(service);
      const key = `${frequency.toFixed(3)}|${callsignKey}|${serviceKey}`;
      const summary = summaries.get(key);
      if (summary) {
        if (summary.aircraftIds.has(item.aircraftId)) continue;
        summary.aircraftIds.add(item.aircraftId);
        if (item.label) summary.aircraftLabels.set(item.aircraftId, item.label);
        if (service) summary.services.add(service);
        if (assignment.callsign) summary.callsigns.add(assignment.callsign);
        if (assignment.airspaceType) summary.airspaceTypes.add(assignment.airspaceType);
        summary.sectors.add(assignment.name);
        summary.sources.add(assignment.source);
        if (assignment.confidence === "inside") summary.positionInside += 1;
        else summary.positionBoundary += 1;
        if (assignment.altitudeConfidence === "unknown") summary.altitudeUnknown += 1;
        else summary.altitudeMatched += 1;
        summary.confidenceScore += confidenceScore(assignment);
      } else {
        summaries.set(key, {
          frequencyMhz: frequency,
          services: service ? new Set([service]) : new Set(),
          callsigns: assignment.callsign ? new Set([assignment.callsign]) : new Set(),
          airspaceTypes: assignment.airspaceType ? new Set([assignment.airspaceType]) : new Set(),
          sectors: new Set([assignment.name]),
          sources: new Set([assignment.source]),
          aircraftIds: new Set([item.aircraftId]),
          aircraftLabels: item.label ? new Map([[item.aircraftId, item.label]]) : new Map(),
          positionInside: assignment.confidence === "inside" ? 1 : 0,
          positionBoundary: assignment.confidence === "boundary" ? 1 : 0,
          altitudeMatched: assignment.altitudeConfidence === "unknown" ? 0 : 1,
          altitudeUnknown: assignment.altitudeConfidence === "unknown" ? 1 : 0,
          confidenceScore: confidenceScore(assignment),
        });
      }
    }
  }
  return [...summaries.values()]
    .map(({ callsigns, services, airspaceTypes, sectors, sources, aircraftIds, aircraftLabels, positionInside, positionBoundary, altitudeMatched, altitudeUnknown, confidenceScore: score, ...summary }) => ({
      ...summary,
      service: joinSorted(services),
      callsign: joinSorted(callsigns),
      airspaceType: joinSorted(airspaceTypes),
      sector: [...sectors].sort((a, b) => a.localeCompare(b)).join(" / "),
      aircraftCount: aircraftIds.size,
      confidence: {
        level: confidenceLevel(score, aircraftIds.size),
        positionInside,
        positionBoundary,
        altitudeMatched,
        altitudeUnknown,
      },
      source: joinSorted(sources),
      aircraftLabels: [...aircraftLabels.values()].sort((a, b) => a.localeCompare(b)).slice(0, 5),
      additionalAircraftCount: Math.max(0, aircraftIds.size - 5),
      _confidenceScore: score / Math.max(1, aircraftIds.size),
    }))
    .sort((a, b) => b.aircraftCount - a.aircraftCount
      || b._confidenceScore - a._confidenceScore
      || servicePriority(a.service) - servicePriority(b.service)
      || a.frequencyMhz - b.frequencyMhz
      || (a.callsign ?? "").localeCompare(b.callsign ?? "")
      || a.sector.localeCompare(b.sector))
    .map((summary) => ({
      frequencyMhz: summary.frequencyMhz,
      service: summary.service,
      callsign: summary.callsign,
      airspaceType: summary.airspaceType,
      sector: summary.sector,
      aircraftCount: summary.aircraftCount,
      confidence: summary.confidence,
      source: summary.source,
      aircraftLabels: summary.aircraftLabels,
      additionalAircraftCount: summary.additionalAircraftCount,
    }));
}

export class AtcSectorService {
  private sectors: AtcSector[] | null = null;
  private preparedDataset: PreparedAtcSectorDataset | null = null;
  private loading: Promise<void> | null = null;
  private freshnessLoading: Promise<void> | null = null;
  private freshnessCheckedAt = 0;
  private fullSnapshotCheckedAt = 0;
  private freshnessFailureSince: number | null = null;
  private fullSnapshotFailureSince: number | null = null;
  private datasetFingerprint: string | null | undefined;
  private generation = 0;

  constructor(private readonly provider: AtcSectorProvider) {
    provider.onDatasetInvalidated?.(() => this.invalidate());
  }

  async lookup(lookup: AtcLookup): Promise<AtcSectorMatch | null> {
    return measureRuntimeAsync("atc.lookup.total", 1, async () => {
      const sectors = await this.getCandidates(lookup);
      let polygonTests = 0;
      const matches = measureRuntime("atc.polygon-matching", () => polygonTests, () => sectors
        .map((sector) => matchSector(sector, lookup, () => { polygonTests += 1; }))
        .filter((match): match is AtcSectorMatch => match !== null));
      measureRuntime("atc.sorting", matches.length, () => matches.sort(compareAtcMatches));
      return matches[0] ?? null;
    });
  }

  async lookupAll(lookup: AtcLookup): Promise<AtcSectorMatch[]> {
    const sectors = await this.getCandidates(lookup);
    return sectors
      .map((sector) => matchSector(sector, lookup))
      .filter((match): match is AtcSectorMatch => match !== null)
      .sort(compareAtcMatches);
  }

  async getAll(): Promise<AtcSector[]> {
    return this.getSectors();
  }

  invalidate(): void {
    this.generation += 1;
    this.sectors = null;
    this.preparedDataset = null;
    this.datasetFingerprint = undefined;
    this.freshnessCheckedAt = 0;
    this.fullSnapshotCheckedAt = 0;
    this.freshnessFailureSince = null;
    this.fullSnapshotFailureSince = null;
  }

  private async getSectors(): Promise<AtcSector[]> {
    while (true) {
      if (this.sectors && this.preparedDataset) {
        await this.ensureFreshness();
        if (this.sectors && this.preparedDataset) return this.sectors;
      }
      const generation = this.generation;
      if (!this.loading) {
        this.loading = (async () => {
          const hasSnapshot = typeof this.provider.getSectorsSnapshot === "function";
          const fingerprint = await this.readFingerprint();
          const sectors = await measureRuntimeAsync("atc.provider.wait", 0, () => hasSnapshot
            ? this.provider.getSectorsSnapshot!()
            : this.provider.getSectors());
          const prepared = await measureRuntimeAsync("atc.dataset.preparation", sectors.length, () => prepareAtcSectorDatasetAsync(sectors, { owned: hasSnapshot }));
          // An import can invalidate while preparation yields. Never publish a
          // partially or stale-built index over the newer generation.
          if (generation === this.generation) {
            this.sectors = [...sectors];
            this.preparedDataset = prepared;
            this.datasetFingerprint = fingerprint;
            this.freshnessCheckedAt = Date.now();
            this.fullSnapshotCheckedAt = this.freshnessCheckedAt;
            this.freshnessFailureSince = null;
            this.fullSnapshotFailureSince = null;
          }
        })().finally(() => {
          this.loading = null;
        });
      }
      await this.loading;
    }
  }

  private async readFingerprint(): Promise<string | null | undefined> {
    if (!this.provider.getDatasetFingerprint) return undefined;
    try {
      return await this.provider.getDatasetFingerprint();
    } catch {
      return null;
    }
  }

  private async ensureFreshness(): Promise<void> {
    if (!this.sectors || !this.preparedDataset || !this.provider.getDatasetFingerprint) return;
    const now = Date.now();
    if (now - this.freshnessCheckedAt < ATC_FRESHNESS_CHECK_MS) return;
    if (!this.freshnessLoading) {
      this.freshnessLoading = (async () => {
        const checkedAt = Date.now();
        const fingerprint = await this.readFingerprint();
        this.freshnessCheckedAt = checkedAt;
        if (fingerprint === null || fingerprint === undefined) {
          this.freshnessFailureSince ??= checkedAt;
          if (checkedAt - this.freshnessFailureSince >= ATC_FRESHNESS_ERROR_MAX_MS) this.invalidate();
          return;
        }
        this.freshnessFailureSince = null;
        if (this.datasetFingerprint !== undefined && fingerprint !== this.datasetFingerprint) {
          this.invalidate();
          this.datasetFingerprint = fingerprint;
          return;
        }
        this.datasetFingerprint = fingerprint;
        if (this.provider.getSectorsSnapshot && checkedAt - this.fullSnapshotCheckedAt >= ATC_FULL_SNAPSHOT_REFRESH_MS) {
          const currentSectors = this.sectors;
          if (!currentSectors) return;
          try {
            const snapshot = await this.provider.getSectorsSnapshot();
            this.fullSnapshotCheckedAt = checkedAt;
            // An empty result is ambiguous between an empty dataset and a
            // failed optional database read. Keep the last valid index for the
            // same bounded error window used by the version check.
            if (snapshot.length === 0 && currentSectors.length > 0) {
              this.fullSnapshotFailureSince ??= checkedAt;
              if (checkedAt - this.fullSnapshotFailureSince >= ATC_FRESHNESS_ERROR_MAX_MS) this.invalidate();
            } else if (!sameSectorSnapshot(snapshot, currentSectors)) {
              this.invalidate();
            } else {
              this.fullSnapshotFailureSince = null;
            }
          } catch {
            this.fullSnapshotFailureSince ??= checkedAt;
            if (checkedAt - this.fullSnapshotFailureSince >= ATC_FRESHNESS_ERROR_MAX_MS) this.invalidate();
          }
        }
      })().finally(() => {
        this.freshnessLoading = null;
      });
    }
    await this.freshnessLoading;
  }

  private async getCandidates(lookup: AtcLookup): Promise<AtcSector[]> {
    await this.getSectors();
    if (!this.preparedDataset) return [];
    return measureRuntime("atc.sector.candidate-lookup", 1, () => getAtcSectorCandidatesFromIndex(this.preparedDataset!, lookup.longitude, lookup.latitude));
  }
}
