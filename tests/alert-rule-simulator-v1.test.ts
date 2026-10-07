import { describe, expect, it } from "vitest";
import { simulateAlertRules } from "@/lib/server/alert-rule-simulator";

describe("Alert Rule Simulator V1", () => {
  it("builds a dry-run signal without creating an alert occurrence", async () => {
    const result = await simulateAlertRules({ icaoHex: "abc123", callsign: "csa123", trigger: "SQUAWK", squawk: "7700", occurredAt: "2026-10-07T10:00:00Z" });
    expect(result.signal.aircraft.icaoHex).toBe("ABC123");
    expect(result.signal.aircraft.callsign).toBe("CSA123");
    expect(result.signal.trigger).toBe("SQUAWK");
    expect(result.signal.squawk).toBe("7700");
    expect(result.signal.sourceKey).toContain("simulator:ABC123:SQUAWK");
  });

  it("rejects invalid identities and trigger details", async () => {
    await expect(simulateAlertRules({ icaoHex: "NOPE", trigger: "SQUAWK", squawk: "7700" })).rejects.toThrow(/icaoHex/);
    await expect(simulateAlertRules({ icaoHex: "ABC123", trigger: "SQUAWK", squawk: "7000" })).rejects.toThrow(/squawk/);
  });
});
