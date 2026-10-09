import { describe, expect, it } from "vitest";
import { buildFlightEvidenceE5, type FlightEvidenceObservation, type FlightEvidenceLanding } from "@/lib/predictive-intelligence/flight-evidence-e5";

const predictedAt = "2026-10-08T10:00:00.000Z";
const observation: FlightEvidenceObservation = {
  observationKey: "first", lifecycleKey: "flight:17", capability: "ETA",
  aircraftIcao: "ABC123", flightId: 17, predictedAt,
  predictedLandingAt: "2026-10-08T10:30:00.000Z", predictedRunway: null,
};
function landing(metadata: unknown): FlightEvidenceLanding {
  return {icaoHex: "ABC123", flightId: 17, occurredAt: "2026-10-08T10:33:00.000Z", metadataJson: JSON.stringify(metadata)};
}
const confirmed = {
  lifecycleKey: "flight:17",
  terminalEvidence: {
    groundConfirmation: {observedAt: "2026-10-08T10:32:00.000Z"},
    reportedArrivalRunway: {runway: "RWY 24"},
  },
};
describe("E5 Flight Story independent evidence", () => {
  it("shows earliest immutable predictions vs later matching terminal outcome", () => {
    const runway: FlightEvidenceObservation = {...observation,
      observationKey: "runway", capability: "RUNWAY", predictedRunway: "24"};
    const got = buildFlightEvidenceE5({flightId:17, aircraftIcao:"ABC123",
      observations: [
        {...observation, observationKey:"later", predictedAt:"2026-10-08T10:10:00.000Z",
          predictedLandingAt:"2026-10-08T10:31:59.000Z"},
        runway, observation,
      ], landings:[landing(confirmed)], complete:true});
    expect(got.items[0]).toMatchObject({capability:"ETA", status:"SCORED", absoluteErrorSeconds:120});
    expect(got.items[1]).toMatchObject({capability:"RUNWAY", status:"SCORED", runwayExactEnd:true});
  });
  it("never treats a landing without independent ground confirmation as scored ETA", () => {
    const got = buildFlightEvidenceE5({flightId:17, aircraftIcao:"ABC123",
      observations:[observation], landings:[landing({lifecycleKey:"flight:17"})], complete:true});
    expect(got.items[0]).toMatchObject({status:"UNSCORABLE", outcome:null, reason:"INDEPENDENT_TRUTH_MISSING"});
  });
  it("rejects wrong flight, lifecycle, aircraft and pre-prediction evidence", () => {
    const bad = [landing({...confirmed, lifecycleKey:"other"}),
      {...landing(confirmed), flightId: 18},
      {...landing(confirmed), icaoHex:"FFF000"},
      {...landing(confirmed), occurredAt:"2026-10-08T09:55:00.000Z"}];
    const got = buildFlightEvidenceE5({flightId:17, aircraftIcao:"ABC123",
      observations:[observation], landings:bad, complete:false});
    expect(got.items[0]?.status).toBe("UNSCORABLE");
    expect(got.complete).toBe(false);
  });
  it("never exposes arbitrary metadata or predictions from a different flight", () => {
    const got = buildFlightEvidenceE5({flightId:17, aircraftIcao:"ABC123",
      observations:[{...observation, flightId: 21}], landings:[], complete:true});
    expect(got.items).toEqual([]);
    expect(JSON.stringify(got)).not.toContain("metadataJson");
  });
});
