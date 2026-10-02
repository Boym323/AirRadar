import { describe, expect, it } from "vitest";
import { appendDestinationObservation, getDestinationAsOf } from "@/lib/intelligence/destination-provenance";
import { fitTerminalEvidence, MAX_TERMINAL_EVIDENCE_BYTES, terminalEvidenceBytes, terminalEvidenceFor } from "@/lib/intelligence/terminal-evidence";
import type { Aircraft } from "@/lib/aircraft/types";

function aircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return { icaoHex: "ABC123", callsign: "TEST", registration: null, aircraftType: null, aircraftDescription: null, lat: 50, lon: 14, altitude: 120, baroAltitude: 120, geomAltitude: 110, groundSpeed: 35, track: 240, verticalRate: -100, baroRate: -100, geomRate: -100, squawk: null, category: null, emergency: null, rssi: null, messages: 1, seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-10-02T12:00:00.000Z", source: "ADS-B", origin: "local", sourceType: null, onGround: true, distanceKm: 1, bearing: 240, trail: [], ...overrides };
}

describe("prospective predictive ground truth contracts", () => {
  it("captures bounded factual terminal evidence without predictive fields", () => {
    const at = Date.parse("2026-10-02T12:00:00.000Z");
    const history = Array.from({ length: 40 }, (_, index) => ({ aircraft: aircraft({ lastSeen: new Date(at - index * 1_000).toISOString(), onGround: false }), observedAt: at - index * 1_000 }));
    const evidence = terminalEvidenceFor(aircraft(), history, at);
    expect(evidence).not.toBeNull();
    expect(evidence!.version).toBe("terminal-evidence-v1");
    expect(evidence!.recentTrack.length).toBeLessThanOrEqual(16);
    expect(JSON.stringify(evidence)).not.toContain("predictiveEta");
    expect(terminalEvidenceBytes(evidence!)).toBeLessThanOrEqual(MAX_TERMINAL_EVIDENCE_BYTES);
    expect(evidence!.groundConfirmation?.onGround).toBe(true);
  });

  it("drops oldest optional track points to fit the UTF-8 byte bound", () => {
    const at = Date.parse("2026-10-02T12:00:00.000Z");
    const normal = terminalEvidenceFor(aircraft(), Array.from({ length: 16 }, (_, index) => ({ aircraft: aircraft({ lastSeen: new Date(at - index * 1_000).toISOString() }), observedAt: at - index * 1_000 })), at)!;
    const oversized = fitTerminalEvidence({ ...normal, recentTrack: [], detection: { ...normal.detection, source: "é".repeat(20_000) }, groundConfirmation: { ...normal.groundConfirmation!, source: "é".repeat(20_000) } });
    expect(oversized).toBeNull();
    const reduced = fitTerminalEvidence({ ...normal, recentTrack: normal.recentTrack.map((item) => ({ ...item, source: "é".repeat(1_000) })) });
    expect(reduced).not.toBeNull();
    expect(terminalEvidenceBytes(reduced!)).toBeLessThanOrEqual(MAX_TERMINAL_EVIDENCE_BYTES);
  });

  it("records only semantic destination changes and resolves as-of", () => {
    let provenance = null;
    provenance = appendDestinationObservation(provenance, { destination: "LOWW", observedAt: "2026-10-02T10:00:00Z", source: "FlightAware", providerRetrievedAt: "2026-10-02T09:59:00Z" }).provenance;
    expect(appendDestinationObservation(provenance, { destination: "LOWW", observedAt: "2026-10-02T10:01:00Z", source: "FlightAware", providerRetrievedAt: null }).repeated).toBe(true);
    provenance = appendDestinationObservation(provenance, { destination: "LKPR", observedAt: "2026-10-02T11:00:00Z", source: "FlightAware", providerRetrievedAt: null }).provenance;
    expect(getDestinationAsOf(provenance, "2026-10-02T10:30:00Z")?.destination).toBe("LOWW");
    expect(getDestinationAsOf(provenance, "2026-10-02T11:30:00Z")?.destination).toBe("LKPR");
  });

  it("orders delayed observations chronologically and preserves the current value", () => {
    const provenance = appendDestinationObservation(null, { destination: "LOWW", observedAt: "2026-10-02T10:00:00Z", source: null, providerRetrievedAt: null }).provenance;
    const delayed = appendDestinationObservation(provenance, { destination: "LKPR", observedAt: "2026-10-02T09:00:00Z", source: null, providerRetrievedAt: null });
    expect(delayed.outOfOrder).toBe(true);
    expect(delayed.provenance.history.map((item) => item.destination)).toEqual(["LKPR", "LOWW"]);
    expect(delayed.currentChanged).toBe(false);
    expect(getDestinationAsOf(delayed.provenance, "2026-10-02T09:30:00Z")?.destination).toBe("LKPR");
    expect(getDestinationAsOf(delayed.provenance, "2026-10-02T10:30:00Z")?.destination).toBe("LOWW");
    expect(appendDestinationObservation(delayed.provenance, { destination: "PRG", observedAt: "2026-10-02T10:00:00Z", source: null, providerRetrievedAt: null }).conflict).toBe(true);
  });
});
