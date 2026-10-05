import { describe, expect, it } from "vitest";
import { OperationalTwinTruthFirstValidator } from "@/lib/operational-twin/truth-first";
import type { OperationalTwinEventType, OperationalTwinSituation } from "@/lib/operational-twin/types";
import type { FlightIntelligenceEvent } from "@/lib/intelligence/types";
import type { RouteIntelligenceV2Snapshot } from "@/lib/route-intelligence";
import type { SigmetSnapshot } from "@/lib/weather/types";

function situation(
  generatedAt: string,
  type: OperationalTwinEventType,
  title: string,
  id?: string,
  at = "2026-10-05T15:20:00.000Z",
): OperationalTwinSituation {
  return {
    generatedAt,
    aircraft: { icaoHex: "ABC123" },
    events: [{
      id: id ?? `${type.toLowerCase()}:${at}`,
      type,
      at,
      title,
    }],
  } as unknown as OperationalTwinSituation;
}

function landing(runway = "34"): FlightIntelligenceEvent {
  return {
    id: "landing-1",
    eventKey: "landing-1",
    lifecycleKey: "flight-1:landing",
    type: "LANDING",
    icaoHex: "ABC123",
    occurredAt: "2026-10-05T15:21:00.000Z",
    airportIcao: "LOWW",
    metadata: {
      terminalEvidence: {
        reportedArrivalRunway: { runway },
      },
    },
  } as unknown as FlightIntelligenceEvent;
}

function route(nextPointId: string): RouteIntelligenceV2Snapshot {
  return {
    route: { id: "route-1" },
    dynamic: {
      routeAdherence: "ON_ROUTE",
      nextPoint: { id: nextPointId, name: nextPointId },
    },
  } as unknown as RouteIntelligenceV2Snapshot;
}

function sigmets(): SigmetSnapshot {
  return {
    stale: false,
    features: [{
      id: "SIG1",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ]],
      },
      properties: {
        validFrom: "2026-10-05T14:00:00.000Z",
        validTo: "2026-10-05T17:00:00.000Z",
        lowerFt: null,
        upperFt: null,
      },
    }],
  } as unknown as SigmetSnapshot;
}

const captureContext = {
  atcDataset: null,
  sigmets: null,
  destination: "LOWW",
};

describe("Operational Digital Twin Truth-first Validation V2", () => {
  it("counts an independent landing truth as recalled when arrival was predicted beforehand", () => {
    const validator = new OperationalTwinTruthFirstValidator();
    validator.capture(situation("2026-10-05T15:00:00.000Z", "ARRIVAL_ETA", "Arrival LOWW"), captureContext);
    validator.observeIntelligence([landing()], Date.parse("2026-10-05T15:21:00.000Z"));
    const report = validator.report(new Date("2026-10-05T15:22:00.000Z"));
    expect(report.byType.ARRIVAL_ETA).toMatchObject({
      truthEvents: 1,
      predictedTruthEvents: 1,
      missedTruthEvents: 0,
      recall: 1,
    });
  });

  it("counts a landing without a prior arrival prediction as missed truth", () => {
    const validator = new OperationalTwinTruthFirstValidator();
    validator.observeIntelligence([landing()], Date.parse("2026-10-05T15:21:00.000Z"));
    expect(validator.report(new Date("2026-10-05T15:22:00.000Z")).byType.ARRIVAL_ETA).toMatchObject({
      truthEvents: 1,
      predictedTruthEvents: 0,
      missedTruthEvents: 1,
      recall: 0,
    });
  });

  it("requires the independently reported runway to match the predicted runway", () => {
    const validator = new OperationalTwinTruthFirstValidator();
    validator.capture(situation("2026-10-05T15:00:00.000Z", "RUNWAY_EXPECTATION", "RWY 34"), captureContext);
    validator.observeIntelligence([landing("29")], Date.parse("2026-10-05T15:21:00.000Z"));
    expect(validator.report(new Date("2026-10-05T15:22:00.000Z")).byType.RUNWAY_EXPECTATION.recall).toBe(0);
  });

  it("scores waypoint recall from an observed Route Intelligence progress transition", () => {
    const validator = new OperationalTwinTruthFirstValidator();
    const start = Date.parse("2026-10-05T15:00:00.000Z");
    validator.observeContext({
      icaoHex: "ABC123",
      route: route("FIXA"),
      observed: { lat: 49, lon: 17, altitudeFt: 30_000 },
      sigmets: null,
    }, start);
    validator.capture(
      situation(
        "2026-10-05T15:00:00.000Z",
        "WAYPOINT",
        "FIXA",
        "waypoint:FIXA:2026-10-05T15:10:00.000Z",
        "2026-10-05T15:10:00.000Z",
      ),
      captureContext,
      start,
    );
    validator.observeContext({
      icaoHex: "ABC123",
      route: route("FIXB"),
      observed: { lat: 49.1, lon: 17.1, altitudeFt: 30_000 },
      sigmets: null,
    }, Date.parse("2026-10-05T15:09:00.000Z"));

    expect(validator.report(new Date("2026-10-05T15:10:00.000Z")).byType.WAYPOINT).toMatchObject({
      truthEvents: 1,
      predictedTruthEvents: 1,
      recall: 1,
    });
  });

  it("scores sector-entry recall from the independent Flight Intelligence boundary event", () => {
    const validator = new OperationalTwinTruthFirstValidator();
    validator.capture(
      situation(
        "2026-10-05T15:00:00.000Z",
        "ATC_SECTOR_ENTRY",
        "LZBB CTA",
        "sector:LZBB_CTA:2026-10-05T15:10:00.000Z",
        "2026-10-05T15:10:00.000Z",
      ),
      captureContext,
    );
    validator.observeIntelligence([{
      id: "airspace-entry-1",
      eventKey: "airspace-entry-1",
      lifecycleKey: "flight-1:airspace-entry",
      type: "AIRSPACE_ENTRY",
      icaoHex: "ABC123",
      occurredAt: "2026-10-05T15:11:00.000Z",
      sectorId: "LZBB_CTA",
    } as unknown as FlightIntelligenceEvent], Date.parse("2026-10-05T15:09:00.000Z"));

    expect(validator.report(new Date("2026-10-05T15:10:00.000Z")).byType.ATC_SECTOR_ENTRY).toMatchObject({
      truthEvents: 1,
      predictedTruthEvents: 1,
      recall: 1,
    });
  });

  it("scores SIGMET recall only after the observed aircraft position enters the active polygon", () => {
    const validator = new OperationalTwinTruthFirstValidator();
    const snapshot = sigmets();
    const start = Date.parse("2026-10-05T15:00:00.000Z");
    validator.observeContext({
      icaoHex: "ABC123",
      route: null,
      observed: { lat: 10, lon: 10, altitudeFt: 30_000 },
      sigmets: snapshot,
    }, start);
    validator.capture(
      situation(
        "2026-10-05T15:00:00.000Z",
        "SIGMET_INTERSECTION",
        "TURB",
        "sigmet:SIG1:2026-10-05T15:10:00.000Z",
        "2026-10-05T15:10:00.000Z",
      ),
      { ...captureContext, sigmets: snapshot },
      start,
    );
    validator.observeContext({
      icaoHex: "ABC123",
      route: null,
      observed: { lat: 1, lon: 1, altitudeFt: 30_000 },
      sigmets: snapshot,
    }, Date.parse("2026-10-05T15:09:00.000Z"));

    expect(validator.report(new Date("2026-10-05T15:10:00.000Z")).byType.SIGMET_INTERSECTION).toMatchObject({
      truthEvents: 1,
      predictedTruthEvents: 1,
      recall: 1,
    });
  });

  it("does not let a same-instant prediction satisfy truth that was observed first", () => {
    const validator = new OperationalTwinTruthFirstValidator();
    const at = Date.parse("2026-10-05T15:10:00.000Z");
    validator.observeIntelligence([{
      ...landing(),
      occurredAt: "2026-10-05T15:10:00.000Z",
    }], at);
    validator.capture(
      situation("2026-10-05T15:10:00.000Z", "ARRIVAL_ETA", "Arrival LOWW", undefined, "2026-10-05T15:20:00.000Z"),
      captureContext,
      at,
    );
    expect(validator.report(new Date("2026-10-05T15:11:00.000Z")).byType.ARRIVAL_ETA.recall).toBe(0);
  });
});
