import { describe, expect, it, vi } from "vitest";
import { AlertEngine } from "@/lib/server/alert-engine";
import type { AlertHistoryDetection, AlertHistoryEntry } from "@/lib/server/alert-history";
import type { Aircraft } from "@/lib/aircraft/types";

function aircraft(): Aircraft {
  return {
    icaoHex: "ABC123", callsign: "TEST123", registration: "OK-ABC", aircraftType: "A320", aircraftDescription: null,
    lat: 50, lon: 14, altitude: 20_000, baroAltitude: 20_000, geomAltitude: null, groundSpeed: 300, track: 90,
    verticalRate: 0, baroRate: 0, geomRate: null, squawk: null, category: null, emergency: null, rssi: null,
    messages: null, seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-09-08T12:00:00Z", source: "ADS-B", sourceType: null,
    onGround: false, distanceKm: 410, bearing: 90, trail: [],
  };
}

function historyRecorder() {
  const detected: AlertHistoryEntry[] = [];
  return {
    detected,
    recordDetected: vi.fn(async (event: AlertHistoryDetection) => {
      detected.push({
        id: event.id,
        detectedAt: event.detectedAt,
        type: event.type,
        reason: event.reason,
        aircraft: {
          icaoHex: event.aircraft.icaoHex,
          registration: event.aircraft.registration,
          callsign: event.aircraft.callsign,
          aircraftType: event.aircraft.aircraftType,
        },
        ruleIds: event.ruleIds ?? [],
        ruleNames: event.ruleNames ?? [],
        radiusKm: event.radiusKm ?? null,
        squawk: event.squawk ?? null,
        record: event.record ?? null,
        notificationStatus: "pending",
        notificationAttemptedAt: null,
      });
    }),
    recordNotification: vi.fn(async () => undefined),
  };
}

describe("batch 4 alert transitions", () => {
  it("deduplicates durable new-aircraft and reception-record events", async () => {
    const history = historyRecorder();
    const send = vi.fn(async () => undefined);
    const engine = new AlertEngine({ history, notifier: { name: "test", enabled: true, send } });
    const item = aircraft();
    engine.observeNewAircraft(item);
    engine.observeNewAircraft(item);
    engine.observeReceptionRecord("daily", { date: "2026-09-08", distanceKm: 410, icaoHex: "ABC123", registration: "OK-ABC", recordedAt: item.lastSeen, bearing: 90 }, { date: "2026-09-08", distanceKm: 400, icaoHex: "DEF456", registration: null, recordedAt: item.lastSeen, bearing: 80 });
    engine.observeReceptionRecord("daily", { date: "2026-09-08", distanceKm: 410, icaoHex: "ABC123", registration: "OK-ABC", recordedAt: item.lastSeen, bearing: 90 }, null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(history.detected.map((entry) => entry.type)).toEqual(["new_aircraft", "reception_record"]);
    expect(send).toHaveBeenCalledTimes(2);
  });
});