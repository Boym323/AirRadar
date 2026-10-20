import { afterEach, describe, expect, it, vi } from "vitest";
import { createAircraftProvider } from "@/lib/server/providers";
import { readFileSync } from "node:fs";
import { shouldUseSampleAtcData } from "@/lib/server/config";

afterEach(() => vi.unstubAllEnvs());

describe("retired J10 simulated receiver", () => {
  it("never creates fictional aircraft when no receiver transport is configured", async () => {
    vi.stubEnv("READSB_BASE_URL", "");
    vi.stubEnv("READSB_BEAST_ENABLED", "false");
    vi.stubEnv("READSB_BEAST_HOST", "");
    const receiver = createAircraftProvider();
    expect(receiver.name).toBe("readsb-unconfigured");
    await expect(receiver.getSnapshot()).rejects.toThrow("Local ADS-B receiver is not configured");
  });

  it("does not turn on sample ATC merely because readsb is missing", () => {
    vi.stubEnv("READSB_BASE_URL", "");
    vi.stubEnv("ATC_SAMPLE_ENABLED", "");
    expect(shouldUseSampleAtcData()).toBe(false);
    vi.stubEnv("ATC_SAMPLE_ENABLED", "true");
    expect(shouldUseSampleAtcData()).toBe(true);
  });

  it("keeps isolated production gates fail-closed without fake traffic", () => {
    const gate = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(gate).toContain('healthPayload.status !== "degraded"');
    expect(gate).toContain('healthPayload.readsb?.provider !== "readsb-unconfigured"');
    expect(gate).toContain('healthPayload.aircraftCount !== 0');
  });

  it("keeps Beast-only live receiver configuration available", () => {
    vi.stubEnv("READSB_BASE_URL", "");
    vi.stubEnv("READSB_BEAST_ENABLED", "true");
    vi.stubEnv("READSB_BEAST_HOST", "127.0.0.1");
    const receiver = createAircraftProvider();
    expect(receiver.name).toBe("readsb-beast");
    receiver.abort?.();
  });
});
