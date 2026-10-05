import { computeAtcContext } from "@/lib/atc-context/engine";
import type { PreparedAtcContextDataset } from "@/lib/atc-context/types";
import { canonicalAirspaceDesignator } from "@/lib/airspace-activity/map";
import type { AirspacePlanSnapshot, PlannedAirspaceWindow } from "@/lib/airspace-activity/types";
import type {
  PublicEtaAdvisory,
  PublicRunwayAdvisory,
  PublicTrajectoryAdvisory,
} from "@/lib/predictive-intelligence";
import { pointInSigmetGeometry } from "@/lib/weather/aircraft-sigmet-context";
import type { SigmetSnapshot } from "@/lib/weather/types";
import {
  OPERATIONAL_TWIN_HORIZON_MINUTES,
  type OperationalTwinConfidence,
  type OperationalTwinCorridor,
  type OperationalTwinEvent,
} from "./types";
import type { OperationalTwinAircraftState } from "./corridor";

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function eventConfidence(value: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | "high" | "medium" | "low" | "partial" | null | undefined): OperationalTwinConfidence {
  const normalized = value?.toUpperCase();
  if (normalized === "HIGH") return "HIGH";
  if (normalized === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function canonicalWindow(window: PlannedAirspaceWindow): string | null {
  return canonicalAirspaceDesignator(window.canonicalDesignator || window.designator);
}

function validAt(window: PlannedAirspaceWindow, timestamp: number): boolean {
  const start = Date.parse(window.startsAt);
  const end = Date.parse(window.endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && timestamp >= start && timestamp <= end;
}

function sigmetValidAt(feature: SigmetSnapshot["features"][number], timestamp: number): boolean {
  const from = feature.properties.validFrom ? Date.parse(feature.properties.validFrom) : Number.NEGATIVE_INFINITY;
  const to = feature.properties.validTo ? Date.parse(feature.properties.validTo) : Number.POSITIVE_INFINITY;
  return (!Number.isFinite(from) || timestamp >= from) && (!Number.isFinite(to) || timestamp <= to);
}

function sigmetVerticalMatch(
  altitudeFt: number | null,
  lowerFt: number | null,
  upperFt: number | null,
): "matched" | "unknown" | "outside" {
  if (!finite(altitudeFt) || (lowerFt === null && upperFt === null)) return "unknown";
  if (lowerFt !== null && altitudeFt < lowerFt) return "outside";
  if (upperFt !== null && altitudeFt > upperFt) return "outside";
  return "matched";
}

function eventSort(left: OperationalTwinEvent, right: OperationalTwinEvent): number {
  if (left.offsetMinutes !== right.offsetMinutes) return left.offsetMinutes - right.offsetMinutes;
  const priority: Record<OperationalTwinEvent["type"], number> = {
    TRAJECTORY_STATE: 0,
    SIGMET_INTERSECTION: 1,
    PLANNED_AIRSPACE: 2,
    ATC_SECTOR_ENTRY: 3,
    WAYPOINT: 4,
    RUNWAY_EXPECTATION: 5,
    ARRIVAL_ETA: 6,
  };
  return priority[left.type] - priority[right.type] || left.id.localeCompare(right.id);
}

function roundedOffset(value: number): number {
  return Number(Math.max(0, value).toFixed(1));
}

export function buildOperationalTwinEvents(input: {
  generatedAt: Date;
  aircraft: OperationalTwinAircraftState;
  corridor: OperationalTwinCorridor;
  atcDataset: PreparedAtcContextDataset | null;
  airspacePlan: AirspacePlanSnapshot | null;
  sigmets: SigmetSnapshot | null;
  destination: string | null;
  etaAdvisory: PublicEtaAdvisory | null;
  runwayAdvisory: PublicRunwayAdvisory | null;
  trajectoryAdvisory: PublicTrajectoryAdvisory | null;
}): OperationalTwinEvent[] {
  const events: OperationalTwinEvent[] = [];

  for (const waypoint of input.corridor.waypoints) {
    events.push({
      id: `waypoint:${waypoint.id}:${waypoint.at}`,
      type: "WAYPOINT",
      offsetMinutes: waypoint.offsetMinutes,
      at: waypoint.at,
      title: waypoint.name,
      detail: `${waypoint.sourceKind} · ${waypoint.distanceNm.toFixed(1)} NM`,
      provenance: waypoint.sourceKind.startsWith("PUBLISHED_") ? "PUBLISHED" : "INFERRED",
      confidence: input.corridor.routePrecision === "PRECISE" ? "HIGH" : "MEDIUM",
      source: "Route Intelligence V2",
      sourceReference: null,
      lat: waypoint.lat,
      lon: waypoint.lon,
      altitudeFt: null,
    });
  }

  if (input.atcDataset) {
    let previousPrimaryId: string | null = null;
    const emittedSectors = new Set<string>();
    const emittedPlans = new Set<string>();

    for (const point of input.corridor.points) {
      const context = computeAtcContext({
        lat: point.lat,
        lon: point.lon,
        altitude: point.altitudeFt,
        baroAltitude: point.altitudeFt,
        geomAltitude: point.altitudeFt,
        altitudeSource: "baro",
        track: point.trackDeg,
        groundSpeed: input.aircraft.groundSpeedKt,
        verticalRate: input.aircraft.verticalRateFpm,
        timestamp: point.at,
        onGround: false,
      }, input.atcDataset, new Date(point.at));

      const primary = context.primaryAirspace;
      if (point.offsetMinutes === 0) {
        previousPrimaryId = primary?.id ?? null;
      } else if (primary && primary.id !== previousPrimaryId && !emittedSectors.has(primary.id)) {
        emittedSectors.add(primary.id);
        events.push({
          id: `sector:${primary.id}:${point.at}`,
          type: "ATC_SECTOR_ENTRY",
          offsetMinutes: point.offsetMinutes,
          at: point.at,
          title: primary.name,
          detail: [primary.airspaceType, primary.publishedUnit].filter(Boolean).join(" · ") || null,
          provenance: "PREDICTED",
          confidence: eventConfidence(primary.confidence),
          source: primary.provenance.source,
          sourceReference: primary.provenance.sourceReference,
          lat: point.lat,
          lon: point.lon,
          altitudeFt: point.altitudeFt,
        });
        previousPrimaryId = primary.id;
      } else {
        previousPrimaryId = primary?.id ?? previousPrimaryId;
      }

      if (input.airspacePlan?.status !== "unavailable") {
        const pointMs = Date.parse(point.at);
        for (const airspace of context.currentAirspaces) {
          const canonical = canonicalAirspaceDesignator(airspace.id) ?? canonicalAirspaceDesignator(airspace.name);
          if (!canonical || emittedPlans.has(canonical)) continue;
          const window = input.airspacePlan.windows.find((candidate) =>
            canonicalWindow(candidate) === canonical && validAt(candidate, pointMs));
          if (!window) continue;
          emittedPlans.add(canonical);
          events.push({
            id: `plan:${canonical}:${window.sequence}:${point.at}`,
            type: "PLANNED_AIRSPACE",
            offsetMinutes: point.offsetMinutes,
            at: point.at,
            title: canonical,
            detail: [window.activity, window.responsibleUnit].filter(Boolean).join(" · ") || null,
            provenance: "PLANNED",
            confidence: input.airspacePlan.status === "ok" ? "HIGH" : "MEDIUM",
            source: window.source,
            sourceReference: window.sourceReference,
            lat: point.lat,
            lon: point.lon,
            altitudeFt: point.altitudeFt,
          });
        }
      }
    }
  }

  if (input.sigmets) {
    const emittedSigmets = new Set<string>();
    for (const point of input.corridor.points) {
      const pointMs = Date.parse(point.at);
      for (const feature of input.sigmets.features) {
        if (emittedSigmets.has(feature.id) || !sigmetValidAt(feature, pointMs)) continue;
        if (!pointInSigmetGeometry(point.lon, point.lat, feature.geometry)) continue;
        const vertical = sigmetVerticalMatch(
          point.altitudeFt,
          feature.properties.lowerFt,
          feature.properties.upperFt,
        );
        if (vertical === "outside") continue;
        emittedSigmets.add(feature.id);
        events.push({
          id: `sigmet:${feature.id}:${point.at}`,
          type: "SIGMET_INTERSECTION",
          offsetMinutes: point.offsetMinutes,
          at: point.at,
          title: feature.properties.hazard ?? feature.properties.phenomenon ?? "SIGMET",
          detail: [feature.properties.qualifier, feature.properties.firName, vertical === "unknown" ? "vertical ?" : null]
            .filter(Boolean).join(" · ") || null,
          provenance: "PREDICTED",
          confidence: vertical === "matched" && !input.sigmets.stale ? "HIGH" : "MEDIUM",
          source: feature.properties.source,
          sourceReference: feature.properties.seriesId ?? null,
          lat: point.lat,
          lon: point.lon,
          altitudeFt: point.altitudeFt,
        });
      }
    }
  }

  if (input.trajectoryAdvisory && input.trajectoryAdvisory.trajectoryState !== "NORMAL") {
    events.push({
      id: `trajectory:${input.trajectoryAdvisory.evaluatedAt}:${input.trajectoryAdvisory.trajectoryState}`,
      type: "TRAJECTORY_STATE",
      offsetMinutes: 0,
      at: input.generatedAt.toISOString(),
      title: input.trajectoryAdvisory.trajectoryState,
      detail: null,
      provenance: "PREDICTED",
      confidence: eventConfidence(input.trajectoryAdvisory.confidence),
      source: input.trajectoryAdvisory.modelVersion,
      sourceReference: null,
      lat: input.aircraft.lat,
      lon: input.aircraft.lon,
      altitudeFt: input.aircraft.altitudeFt,
    });
  }

  if (input.etaAdvisory) {
    const etaMs = Date.parse(input.etaAdvisory.estimatedArrivalAt);
    const offset = (etaMs - input.generatedAt.getTime()) / 60_000;
    if (Number.isFinite(offset) && offset >= 0 && offset <= OPERATIONAL_TWIN_HORIZON_MINUTES) {
      if (input.runwayAdvisory) {
        events.push({
          id: `runway:${input.runwayAdvisory.evaluatedAt}:${input.runwayAdvisory.runway}`,
          type: "RUNWAY_EXPECTATION",
          offsetMinutes: roundedOffset(offset),
          at: input.etaAdvisory.estimatedArrivalAt,
          title: `RWY ${input.runwayAdvisory.runway}`,
          detail: input.runwayAdvisory.alternative ? `ALT ${input.runwayAdvisory.alternative}` : null,
          provenance: "PREDICTED",
          confidence: eventConfidence(input.runwayAdvisory.confidence),
          source: input.runwayAdvisory.modelVersion,
          sourceReference: null,
          lat: null,
          lon: null,
          altitudeFt: null,
        });
      }
      events.push({
        id: `arrival:${input.etaAdvisory.estimatedArrivalAt}`,
        type: "ARRIVAL_ETA",
        offsetMinutes: roundedOffset(offset),
        at: input.etaAdvisory.estimatedArrivalAt,
        title: input.destination ? `Arrival ${input.destination}` : "Predicted arrival",
        detail: `± ${input.etaAdvisory.uncertaintyMinutes} min`,
        provenance: "PREDICTED",
        confidence: eventConfidence(input.etaAdvisory.confidence),
        source: input.etaAdvisory.modelVersion,
        sourceReference: null,
        lat: null,
        lon: null,
        altitudeFt: null,
      });
    }
  }

  return events
    .filter((event) => event.offsetMinutes >= 0 && event.offsetMinutes <= OPERATIONAL_TWIN_HORIZON_MINUTES)
    .sort(eventSort);
}
