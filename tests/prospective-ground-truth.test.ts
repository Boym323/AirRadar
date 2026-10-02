import { describe, expect, it } from "vitest";
import { appendDestinationObservation, getDestinationAsOf } from "@/lib/intelligence/destination-provenance";
import { terminalEvidenceFor } from "@/lib/intelligence/terminal-evidence";
import type { Aircraft } from "@/lib/aircraft/types";

function aircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return { icaoHex: "ABC123", callsign: "TEST", registration: null, aircraftType: null, aircraftDescription: null, lat: 50, lon: 14, altitude: 120, baroAltitude: 120, geomAltitude: 110, groundSpeed: 35, track: 240, verticalRate: -100, baroRate: -100, geomRate: -100, squawk: null, category: null, emergency: null, rssi: null, messages: 1, seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-10-02T12:00:00.000Z", source: "ADS-B", origin: "local", sourceType: null, onGround: true, distanceKm: 1, bearing: 240, trail: [], ...overrides };
}

describe("prospective predictive ground truth contracts", () => {
  it("captures bounded factual terminal evidence without predictive fields", () => {
    const at = Date.parse("2026-10-02T12:00:00.000Z");
    const history = Array.from({ length: 40 }, (_, index) => ({ aircraft: aircraft({ lastSeen: new Date(at - index * 1_000).toISOString(), onGround: false }), observedAt: at - index * 1_000 }));
    const evidence = terminalEvidenceFor(aircraft(), history, at);
    expect(evidence.version).toBe("terminal-evidence-v1");
    expect(evidence.recentTrack.length).toBeLessThanOrEqual(16);
    expect(JSON.stringify(evidence)).not.toContain("predictiveEta");
    expect(JSON.stringify(evidence).length).toBeLessThan(16_384);
    expect(evidence.groundConfirmation?.onGround).toBe(true);
  });

  it("records only semantic destination changes and resolves as-of", () => {
    let provenance = null;
    provenance = appendDestinationObservation(provenance, { destination: "LOWW", observedAt: "2026-10-02T10:00:00Z", source: "FlightAware", providerRetrievedAt: "2026-10-02T09:59:00Z" }).provenance;
    expect(appendDestinationObservation(provenance, { destination: "LOWW", observedAt: "2026-10-02T10:01:00Z", source: "FlightAware", providerRetrievedAt: null }).repeated).toBe(true);
    provenance = appendDestinationObservation(provenance, { destination: "LKPR", observedAt: "2026-10-02T11:00:00Z", source: "FlightAware", providerRetrievedAt: null }).provenance;
    expect(getDestinationAsOf(provenance, "2026-10-02T10:30:00Z")?.destination).toBe("LOWW");
    expect(getDestinationAsOf(provenance, "2026-10-02T11:30:00Z")?.destination).toBe("LKPR");
  });
});
