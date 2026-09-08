import { describe, expect, it } from "vitest";
import { selectFleetIdentityRules } from "@/lib/server/fleet";

describe("Fleet identity selection", () => {
  it("deduplicates ICAO rules and ignores observation rules", () => {
    const result = selectFleetIdentityRules([
      { type: "icaoHex", value: "abc123", enabled: false },
      { type: "icaoHex", value: " ABC123 ", enabled: true },
      { type: "callsign", value: "ABC123", enabled: true },
      { type: "registration", value: "OK-ABC", enabled: true },
    ]);

    expect(result.identities).toEqual(["ABC123"]);
    expect(result.enabledByHex.get("ABC123")).toBe(true);
    expect(result.ignoredRuleCount).toBe(2);
  });

  it("keeps a disabled concrete identity without inventing a callsign identity", () => {
    const result = selectFleetIdentityRules([
      { type: "icaoHex", value: "DEF456", enabled: false },
      { type: "callsignPattern", value: "TEST*", enabled: true },
    ]);

    expect(result.identities).toEqual(["DEF456"]);
    expect(result.enabledByHex.get("DEF456")).toBe(false);
    expect(result.ignoredRuleCount).toBe(1);
  });
});
