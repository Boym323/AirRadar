import { describe, expect, it } from "vitest";
import { OperationalTwinTruthFirstValidator } from "@/lib/operational-twin/truth-first";
import type { OperationalTwinSituation } from "@/lib/operational-twin/types";
import type { FlightIntelligenceEvent } from "@/lib/intelligence/types";

function situation(generatedAt: string, type: "ARRIVAL_ETA" | "RUNWAY_EXPECTATION", title: string): OperationalTwinSituation {
  return {
    generatedAt,
    aircraft: { icaoHex: "ABC123" },
    events: [{
      type,
      at: "2026-10-05T15:20:00.000Z",
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

describe("Operational Digital Twin Truth-first Validation V1", () => {
  it("counts an independent landing truth as recalled when arrival was predicted beforehand", () => {
    const validator = new OperationalTwinTruthFirstValidator();
    validator.capture(situation("2026-10-05T15:00:00.000Z", "ARRIVAL_ETA", "Arrival LOWW"), {
      atcDataset: null,
      sigmets: null,
      destination: "LOWW",
    });
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
    validator.capture(situation("2026-10-05T15:00:00.000Z", "RUNWAY_EXPECTATION", "RWY 34"), {
      atcDataset: null,
      sigmets: null,
      destination: "LOWW",
    });
    validator.observeIntelligence([landing("29")], Date.parse("2026-10-05T15:21:00.000Z"));
    expect(validator.report(new Date("2026-10-05T15:22:00.000Z")).byType.RUNWAY_EXPECTATION.recall).toBe(0);
  });
});
