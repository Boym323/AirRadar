import { describe, expect, it } from "vitest";
import { buildAlertEffectivenessAnalytics } from "@/lib/server/alert-effectiveness-analytics";
import type { AlertV1Config } from "@/lib/server/alerts-fleets-v1";
import type { AlertV1HistoryRow } from "@/lib/server/alerts-fleets-repository";

const config: AlertV1Config = {
  fleets: [],
  geofences: [],
  rules: [
    { id: "r1", name: "Rule one", enabled: true, target: { kind: "ALL_AIRCRAFT" }, trigger: "SQUAWK", squawks: ["7700"], channels: ["PUSHOVER"] },
    { id: "r2", name: "Dormant", enabled: true, target: { kind: "ALL_AIRCRAFT" }, trigger: "SQUAWK", squawks: ["7600"], channels: ["PUSHOVER"] },
  ],
};

function row(id: string, status: string | null, attempts: number, icaoHex: string, mode?: string): AlertV1HistoryRow {
  return {
    occurrence: { id, ruleId: "r1", aircraftIcao: icaoHex, payloadJson: JSON.stringify(mode ? { notificationDeliveryMode: mode } : {}), occurredAt: "2026-10-07T10:00:00Z" },
    ruleName: "Rule one",
    deliveries: status ? [{ id: "d-" + id, occurrenceId: id, channel: "PUSHOVER", status, attemptCount: attempts, nextAttemptAt: "2026-10-07T10:00:00Z", claimedAt: null, sentAt: status === "SENT" ? "2026-10-07T10:00:01Z" : null, lastError: status === "FAILED" ? "boom" : null }] : [],
    flightEvent: null,
  };
}

describe("Alert Effectiveness Analytics V1", () => {
  it("aggregates delivery outcomes and rule coverage", () => {
    const result = buildAlertEffectivenessAnalytics(config, [
      row("a", "SENT", 1, "ABC123"),
      row("b", "FAILED", 3, "ABC123"),
      row("c", null, 0, "DEF456", "CENTER_ONLY"),
    ]);
    expect(result.boundedOccurrences).toBe(3);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.centerOnly).toBe(1);
    expect(result.averageAttempts).toBe(2);
    expect(result.rules[0]).toMatchObject({ ruleId: "r1", occurrences: 3, sent: 1, failed: 1, centerOnly: 1, successRate: 0.5 });
    expect(result.dormantRules).toEqual([{ ruleId: "r2", ruleName: "Dormant" }]);
    expect(result.topAircraft[0]).toEqual({ icaoHex: "ABC123", occurrences: 2 });
  });
});
