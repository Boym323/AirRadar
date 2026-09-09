import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import type { Aircraft, ProviderSnapshot, StateSnapshot } from "@/lib/aircraft/types";
import { matchesAircraftRule } from "@/lib/aircraft/watchlist";
import { parseAlertRules, type AlertRule } from "@/lib/server/alert-config";
import { AlertEngine, type AlertEngineOptions } from "@/lib/server/alert-engine";
import type { AlertNotifier, AircraftAlert } from "@/lib/server/alert-notifier";
import { NoopAlertNotifier } from "@/lib/server/alert-notifier";
import { AircraftStateService } from "@/lib/server/aircraft-state";
import { MockReadsbProvider } from "@/lib/server/mock-readsb-provider";
import { formatAircraftAlert } from "@/lib/server/alert-notifier";
import { toPublicHealthResponse } from "@/lib/server/public-health";

const receiver = { lat: 50, lon: 14, name: "Test" };

function aircraft(hex = "ABC123", overrides: Partial<Aircraft> = {}): Aircraft {
  const value = normalizeAircraft({ hex, flight: "UAE139", lat: 50, lon: 14, alt_baro: 35_000, track: 284 }, receiver, new Date("2026-09-07T12:00:00.000Z"));
  if (!value) throw new Error("test aircraft could not be normalized");
  return { ...value, ...overrides };
}

function rule(id: string, type: AlertRule["type"], value: string, maxDistanceKm?: number): AlertRule {
  return { id, enabled: true, type, value, ...(maxDistanceKm === undefined ? {} : { maxDistanceKm }) };
}

function recordingNotifier(): AlertNotifier & { calls: AircraftAlert[] } {
  const calls: AircraftAlert[] = [];
  return { name: "test", enabled: true, calls, send: vi.fn(async (alert: AircraftAlert) => { calls.push(alert); }) };
}

function testHistory(): NonNullable<AlertEngineOptions["history"]> {
  return {
    recordDetected: vi.fn(async () => undefined),
    recordNotification: vi.fn(async () => undefined),
  };
}

function createTestAlertEngine(options: AlertEngineOptions = {}): AlertEngine {
  return new AlertEngine({ ...options, history: options.history ?? testHistory() });
}

async function flushAlerts(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("server alerts", () => {
  it("alerts on the first condition match", async () => {
    const notifier = recordingNotifier();
    const engine = createTestAlertEngine({ rules: [rule("uae", "callsignPattern", "UAE*")], notifier });
    engine.observe([], [aircraft()]);
    await flushAlerts();
    expect(notifier.calls).toHaveLength(1);
  });

  it("does not alert again on the next poll", async () => {
    const notifier = recordingNotifier();
    const engine = createTestAlertEngine({ rules: [rule("uae", "callsignPattern", "UAE*")], notifier });
    const first = aircraft();
    engine.observe([], [first]);
    engine.observe([first], [aircraft()]);
    await flushAlerts();
    expect(notifier.calls).toHaveLength(1);
  });

  it("does not alert after a short disappear/reappear", async () => {
    let now = 0;
    const notifier = recordingNotifier();
    const engine = createTestAlertEngine({ rules: [rule("uae", "callsignPattern", "UAE*")], notifier, cooldownMs: 7_200_000, now: () => now });
    const first = aircraft();
    engine.observe([], [first]);
    engine.observe([first], []);
    now = 20_000;
    engine.observe([], [aircraft()]);
    await flushAlerts();
    expect(notifier.calls).toHaveLength(1);
  });

  it("alerts again after the cooldown", async () => {
    let now = 0;
    const notifier = recordingNotifier();
    const engine = createTestAlertEngine({ rules: [rule("uae", "callsignPattern", "UAE*")], notifier, cooldownMs: 7_200_000, now: () => now });
    engine.observe([], [aircraft()]);
    now = 7_200_001;
    engine.observe([], [aircraft()]);
    await flushAlerts();
    expect(notifier.calls).toHaveLength(2);
  });

  it("alerts on a false to true max-distance transition", async () => {
    const notifier = recordingNotifier();
    const engine = createTestAlertEngine({ rules: [rule("a380-near", "aircraftType", "A388", 150)], notifier });
    const far = aircraft("ABC123", { aircraftType: "A388", distanceKm: 220 });
    const near = aircraft("ABC123", { aircraftType: "A388", distanceKm: 149 });
    engine.observe([], [far]);
    engine.observe([far], [near]);
    await flushAlerts();
    expect(notifier.calls).toHaveLength(1);
  });

  it("aggregates multiple matching rules into one aircraft alert", async () => {
    const notifier = recordingNotifier();
    const value = aircraft("ABC123", { callsign: "UAE139", registration: "A6-EVN", aircraftType: "A388" });
    const engine = createTestAlertEngine({ rules: [
      rule("uae", "callsignPattern", "UAE*"),
      rule("a380", "aircraftType", "A388"),
      rule("registration", "registration", "A6-EVN"),
    ], notifier });
    engine.observe([], [value]);
    await flushAlerts();
    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0]?.matchedRules).toHaveLength(3);
  });

  it("uses the shared callsign wildcard semantics", () => {
    expect(matchesAircraftRule(aircraft("ABC123", { callsign: "UAE139" }), { type: "callsignPattern", value: "UAE*" })).toBe(true);
    expect(matchesAircraftRule(aircraft("ABC123", { callsign: "UAE139" }), { type: "callsignPattern", value: "UAE14*" })).toBe(false);
  });

  it("matches registration", () => {
    expect(matchesAircraftRule(aircraft("ABC123", { registration: "OK-PMP" }), { type: "registration", value: "ok-pmp" })).toBe(true);
  });

  it("matches aircraft type", () => {
    expect(matchesAircraftRule(aircraft("ABC123", { aircraftType: "A388" }), { type: "aircraftType", value: "a388" })).toBe(true);
  });

  it("matches airline enrichment", () => {
    const value = aircraft();
    value.enrichment = { route: {
      callsign: "UAE139", airline: "Emirates", airlineIcao: "UAE", airlineIata: "EK", origin: null, destination: null,
      originAirport: null, destinationAirport: null, source: "test", retrievedAt: new Date().toISOString(),
    } };
    expect(matchesAircraftRule(value, { type: "airline", value: "emirates" })).toBe(true);
  });

  it("reports invalid config without preventing valid rules from loading", () => {
    const parsed = parseAlertRules([
      rule("valid", "callsign", "UAE139"),
      { id: "valid", enabled: true, type: "callsignPattern", value: "UAE?" },
      { id: "negative", enabled: true, type: "aircraftType", value: "A388", maxDistanceKm: -1 },
    ]);
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.errors.join(" ")).toContain("duplicated");
    expect(parsed.errors.join(" ")).toContain("invalid wildcard");
    expect(parsed.errors.join(" ")).toContain("non-negative");
  });

  it("does nothing with a disabled notifier", async () => {
    const send = vi.fn();
    const notifier: AlertNotifier = { name: "disabled", enabled: false, send };
    const engine = createTestAlertEngine({ rules: [rule("uae", "callsign", "UAE139")], notifier });
    engine.observe([], [aircraft()]);
    await flushAlerts();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not let notifier failure affect AircraftStateService", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const notifier: AlertNotifier = { name: "test", enabled: true, send: vi.fn().mockRejectedValue(new Error("network")) };
    const engine = createTestAlertEngine({ rules: [rule("uae", "callsign", "UAE139")], notifier });
    const service = new AircraftStateService(new MockReadsbProvider(receiver), undefined, undefined, engine);
    const value = aircraft();
    value.lastSeen = new Date().toISOString();
    (service as unknown as { applySnapshot: (snapshot: ProviderSnapshot) => void }).applySnapshot({
      aircraft: [value], receiver, fetchedAt: value.lastSeen, provider: "test",
    });
    await flushAlerts();
    expect(service.getAircraft(value.icaoHex)).toBeTruthy();
    expect(engine.getStatus().status).toBe("error");
    expect(error).toHaveBeenCalledWith("AirRadar alert delivery failed: provider=test status=network");
  });

  it("alerts once on an explicit emergency transition", async () => {
    vi.stubEnv("ALERT_EMERGENCY_ENABLED", "true");
    const notifier = recordingNotifier();
    const engine = createTestAlertEngine({ notifier });
    const normal = aircraft();
    const emergency = aircraft("ABC123", { emergency: "general" });
    engine.observe([], [normal]);
    engine.observe([normal], [emergency]);
    engine.observe([emergency], [emergency]);
    await flushAlerts();
    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0]?.priority).toBe("high");
  });

  it("uses probable ATC wording without claiming a tuned frequency", () => {
    const value = aircraft();
    value.atc = {
      sectorId: "PRAHA", name: "PRAHA RADAR", service: "ACC", callsign: "PRAHA RADAR", primaryFrequencyMhz: 127.35,
      alternateFrequenciesMhz: [], lowerAltitudeFt: null, upperAltitudeFt: null, country: "CZ", source: "test",
      sourceReference: "test", validFrom: null, validTo: null, lastVerifiedAt: new Date().toISOString(), confidence: "inside",
    };
    const message = formatAircraftAlert({ aircraft: value, matchedRules: [], emergency: false, priority: "normal" });
    expect(message).toContain("Pravděpodobně relevantní ATC");
    expect(message).not.toContain("naladěnou frekvenci");
    expect(message).not.toContain("tuned frequency");
  });

  it("cleans expired dedup cache entries", () => {
    let now = 0;
    const engine = createTestAlertEngine({ rules: [rule("uae", "callsign", "UAE139")], notifier: new NoopAlertNotifier(), cooldownMs: 1000, now: () => now });
    engine.observe([], [aircraft()]);
    const internal = engine as unknown as { dedupCache: Map<string, number> };
    expect(internal.dedupCache.size).toBeGreaterThan(0);
    now = 1001;
    engine.cleanupDedupCache();
    expect(internal.dedupCache.size).toBe(0);
  });

  it("keeps secrets and rule values out of public alert status", () => {
    const snapshot: StateSnapshot = {
      aircraft: [], relevantAtcFrequencies: [], receiver, fetchedAt: new Date().toISOString(), provider: "mock",
      sourceOnline: true, lastSourceUpdate: new Date().toISOString(), sourceError: null, readsbOnline: true,
      lastReadsbUpdate: new Date().toISOString(), lastError: null,
      stats: { currentAircraft: 0, aircraftSeenToday: 0, uniqueAircraftToday: 0, maxConcurrentAircraft: 0, maxDistanceKm: 0, aircraftTypes: [], airlines: [], messagesPerSecond: null },
    };
    const value = JSON.stringify(toPublicHealthResponse(snapshot, { status: "not_configured" }, new Date().toISOString(), undefined, {
      status: "ok", enabled: true, notifier: "pushover", ruleCount: 3,
    }));
    expect(value).toContain('"ruleCount":3');
    expect(value).not.toContain("PUSHOVER_USER_KEY");
    expect(value).not.toContain("PUSHOVER_API_TOKEN");
    expect(value).not.toContain("UAE*");
  });
});
