import { describe, expect, it } from "vitest";
import { prepareAtcContextDataset } from "@/lib/atc-context/engine";
import type { AtcSector } from "@/lib/atc/types";
import {
  buildOperationalTwinEvents,
  type OperationalTwinAircraftState,
  type OperationalTwinCorridor,
} from "@/lib/operational-twin";
import type { AirspacePlanSnapshot } from "@/lib/airspace-activity/types";
import type { SigmetSnapshot } from "@/lib/weather/types";

const now = new Date("2026-10-05T05:00:00.000Z");

function sector(id: string, name: string, west: number, east: number, type = "TMA"): AtcSector {
  return {
    id,
    name,
    atcCallsign: null,
    service: null,
    airspaceType: type,
    airspaceClass: "C",
    remarks: null,
    polygons: [[[west, 49], [east, 49], [east, 51], [west, 51], [west, 49]]],
    lowerAltitudeFt: 0,
    upperAltitudeFt: 30_000,
    lowerAltitudeReference: "MSL",
    upperAltitudeReference: "MSL",
    frequencies: [],
    validFrom: "2026-10-01",
    validTo: null,
    country: "CZ",
    source: "TEST AIP",
    sourceReference: "TEST-REF",
    lastVerifiedAt: now.toISOString(),
  };
}

const aircraft: OperationalTwinAircraftState = {
  icaoHex: "ABC123",
  callsign: "TEST123",
  registration: null,
  observedAt: now.toISOString(),
  lat: 50,
  lon: 14,
  altitudeFt: 10_000,
  groundSpeedKt: 240,
  trackDeg: 90,
  verticalRateFpm: 0,
  onGround: false,
};

const corridor: OperationalTwinCorridor = {
  horizonMinutes: 30,
  stepMinutes: 10,
  mode: "ROUTE_AWARE",
  routeAdherence: "ON_ROUTE",
  routePrecision: "PRECISE",
  maxUncertaintyNm: 3,
  points: [
    { offsetMinutes: 0, at: now.toISOString(), lat: 50, lon: 14, altitudeFt: 10_000, trackDeg: 90, uncertaintyNm: 1, mode: "ROUTE_AWARE" },
    { offsetMinutes: 10, at: "2026-10-05T05:10:00.000Z", lat: 50, lon: 15.5, altitudeFt: 10_000, trackDeg: 90, uncertaintyNm: 2, mode: "ROUTE_AWARE" },
    { offsetMinutes: 20, at: "2026-10-05T05:20:00.000Z", lat: 50, lon: 16, altitudeFt: 10_000, trackDeg: 90, uncertaintyNm: 3, mode: "ROUTE_AWARE" },
  ],
  waypoints: [{
    id: "FIX1",
    name: "FIX1",
    lat: 50,
    lon: 15.5,
    offsetMinutes: 10,
    at: "2026-10-05T05:10:00.000Z",
    distanceNm: 40,
    sourceKind: "PUBLISHED_ATS",
  }],
};

const plan: AirspacePlanSnapshot = {
  status: "ok",
  validityStart: "2026-10-05T04:00:00.000Z",
  validityEnd: "2026-10-05T06:00:00.000Z",
  issuedAt: "2026-10-05T03:00:00.000Z",
  aupReference: "https://example.invalid/aup",
  latestUupReference: null,
  uupCount: 0,
  fetchedAt: now.toISOString(),
  windows: [{
    sequence: 1,
    designator: "TRA 1",
    canonicalDesignator: "LKTRA1",
    lowerLimit: "GND",
    upperLimit: "FL200",
    startsAt: "2026-10-05T05:05:00.000Z",
    endsAt: "2026-10-05T05:30:00.000Z",
    responsibleUnit: "TEST",
    activity: "TRAINING",
    plannedNow: false,
    source: "AUP",
    sourceReference: "https://example.invalid/aup",
  }],
};

const sigmets: SigmetSnapshot = {
  type: "FeatureCollection",
  fetchedAt: now.toISOString(),
  stale: false,
  features: [{
    type: "Feature",
    id: "SIG-1",
    properties: {
      id: "SIG-1",
      issuingOffice: "LKAA",
      firId: "LKAA",
      firName: "PRAHA FIR",
      phenomenon: "TS",
      hazard: "THUNDERSTORM",
      qualifier: null,
      validFrom: "2026-10-05T04:30:00.000Z",
      validTo: "2026-10-05T06:00:00.000Z",
      lowerFt: 5_000,
      upperFt: 20_000,
      seriesId: "A1",
      rawText: null,
      source: "isigmet",
      fetchedAt: now.toISOString(),
    },
    geometry: {
      type: "Polygon",
      coordinates: [[[15, 49.5], [16, 49.5], [16, 50.5], [15, 50.5], [15, 49.5]]],
    },
  }],
};

describe("Operational Digital Twin V1 events", () => {
  it("fuses waypoint, sector, AUP and SIGMET intersections on one timeline", () => {
    const dataset = prepareAtcContextDataset({
      sectors: [
        sector("TMA-A", "TMA A", 13.5, 14.5),
        sector("TMA-B", "TMA B", 14.5, 16.5),
        sector("LKTRA1", "TRA 1", 15, 16, "TRA"),
      ],
      routeDocuments: [],
    });
    const events = buildOperationalTwinEvents({
      generatedAt: now,
      aircraft,
      corridor,
      atcDataset: dataset,
      airspacePlan: plan,
      sigmets,
      destination: "LKPR",
      etaAdvisory: {
        kind: "ETA",
        state: "available",
        estimatedArrivalAt: "2026-10-05T05:25:00.000Z",
        evaluatedAt: now.toISOString(),
        ageSeconds: 0,
        horizonMinutes: 25,
        confidence: "HIGH",
        uncertaintyMinutes: 3,
        uncertaintyBasis: "readiness_p90",
        modelVersion: "predictive-intelligence-v1",
        provenance: "predicted",
      },
      runwayAdvisory: {
        kind: "RUNWAY",
        state: "available",
        runway: "24",
        alternative: null,
        evaluatedAt: now.toISOString(),
        ageSeconds: 0,
        confidence: "MEDIUM",
        modelVersion: "predictive-intelligence-v1",
        provenance: "predicted",
      },
      trajectoryAdvisory: null,
    });

    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "WAYPOINT",
      "ATC_SECTOR_ENTRY",
      "PLANNED_AIRSPACE",
      "SIGMET_INTERSECTION",
      "RUNWAY_EXPECTATION",
      "ARRIVAL_ETA",
    ]));
    expect(events.find((event) => event.type === "PLANNED_AIRSPACE")?.provenance).toBe("PLANNED");
    expect(events.find((event) => event.type === "SIGMET_INTERSECTION")?.offsetMinutes).toBe(10);
    expect(events.find((event) => event.type === "ATC_SECTOR_ENTRY")?.title).toBe("TMA B");
  });

  it("does not emit expired SIGMET or out-of-window ETA", () => {
    const expired = structuredClone(sigmets);
    expired.features[0]!.properties.validTo = "2026-10-05T04:59:00.000Z";
    const events = buildOperationalTwinEvents({
      generatedAt: now,
      aircraft,
      corridor,
      atcDataset: null,
      airspacePlan: null,
      sigmets: expired,
      destination: "LKPR",
      etaAdvisory: {
        kind: "ETA",
        state: "available",
        estimatedArrivalAt: "2026-10-05T05:45:00.000Z",
        evaluatedAt: now.toISOString(),
        ageSeconds: 0,
        horizonMinutes: 45,
        confidence: "HIGH",
        uncertaintyMinutes: 4,
        uncertaintyBasis: "readiness_p90",
        modelVersion: "predictive-intelligence-v1",
        provenance: "predicted",
      },
      runwayAdvisory: null,
      trajectoryAdvisory: null,
    });
    expect(events.some((event) => event.type === "SIGMET_INTERSECTION")).toBe(false);
    expect(events.some((event) => event.type === "ARRIVAL_ETA")).toBe(false);
  });
});
