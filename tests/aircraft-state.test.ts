import { afterEach, describe, expect, it, vi } from "vitest";
import { MockReadsbProvider } from "@/lib/server/mock-readsb-provider";
import { AircraftStateService } from "@/lib/server/aircraft-state";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import type { Aircraft, AircraftEnrichment, ProviderSnapshot, StateSnapshot } from "@/lib/aircraft/types";
import { EnrichmentService } from "@/lib/server/enrichment-cache";
import { AtcSectorService, EmptyAtcSectorProvider } from "@/lib/server/atc-sector-service";
import { AlertEngine } from "@/lib/server/alert-engine";
import type { AircraftAlert } from "@/lib/server/alert-notifier";
import type { AircraftProvider, NetworkAircraftProvider } from "@/lib/server/provider";
import type { AtcSector, AtcSectorMatch } from "@/lib/atc/types";
import { recordAircraftSnapshot } from "@/lib/server/history";
import { logger } from "@/lib/server/logger";
import { classifyAircraftIcon } from "@/lib/aircraft/icon-classification";

vi.mock("@/lib/server/history", () => ({
  recordAircraftSnapshot: vi.fn().mockImplementation((aircraft: Aircraft[]) => Promise.resolve({
    succeeded: aircraft.map((item) => item.icaoHex),
    failed: [],
  })),
}));

const services: AircraftStateService[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await Promise.all(services.splice(0).map((service) => service.stop()));
});

describe("aircraft state service", () => {
  function atcMatch(sectorId: string): AtcSectorMatch {
    const sector: AtcSector = {
      id: sectorId,
      name: sectorId,
      atcCallsign: sectorId,
      service: "ACC",
      polygons: [[[13, 49], [16, 49], [16, 51], [13, 51], [13, 49]]],
      lowerAltitudeFt: null,
      upperAltitudeFt: null,
      frequencies: [{ frequencyMhz: 127.35, label: sectorId, isPrimary: true }],
      validFrom: null,
      validTo: null,
      country: "CZ",
      source: "test",
      sourceReference: "test://atc",
      lastVerifiedAt: "2026-01-01T00:00:00.000Z",
    };
    return { sector, confidence: "inside" };
  }

  it("reuses the already parsed network timestamp for trail age pruning", () => {
    const at = new Date("2026-10-19T09:00:00.000Z");
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const normalized = normalizeAircraft(
      { hex: "ABC123", flight: "NET123", lat: 50.1, lon: 14.1, seen: 0, seen_pos: 10 },
      receiver, at,
    );
    if (!normalized) throw new Error("missing normalized aircraft");
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    services.push(service);
    const internal = service as unknown as {
      updateTrail: (previous: Aircraft | undefined, incoming: Aircraft, maxAge?: number, maxPoints?: number, parsedAt?: number) => Aircraft["trail"];
    };

    // A fresh network poll already validates lastSeen before calling updateTrail.
    // Only trailPointFromAircraft should still need to parse this lastSeen.
    const parseSpy = vi.spyOn(Date, "parse");
    try {
      const trail = internal.updateTrail(undefined, { ...normalized, origin: "adsblol" }, 60_000, 50, at.getTime());
      expect(trail).toHaveLength(1);
      expect(trail[0]?.recordedAt).toBe(new Date(at.getTime() - 10_000).toISOString());
      const incomingParses = parseSpy.mock.calls.filter(([value]) => value === normalized.lastSeen);
      expect(incomingParses).toHaveLength(1);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("does not rewrite an existing source preference on unchanged network membership", () => {
    vi.useFakeTimers();
    const at = new Date("2026-10-19T09:00:00.000Z");
    vi.setSystemTime(at);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const normalized = normalizeAircraft(
      { hex: "ABC123", flight: "NET123", lat: 50.1, lon: 14.1, seen: 0, seen_pos: 0 },
      receiver, at,
    );
    if (!normalized) throw new Error("missing normalized aircraft");
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    services.push(service);
    const internal = service as unknown as {
      applyNetworkSnapshot: (snapshot: { aircraft: Aircraft[]; fetchedAt: string | null; provider: string }) => void;
      sourcePreferences: Map<string, "local" | "network">;
    };
    const network = { ...normalized, origin: "adsblol" as const };
    const snapshot = { aircraft: [network], fetchedAt: at.toISOString(), provider: "network-test" };
    internal.applyNetworkSnapshot(snapshot);
    expect(internal.sourcePreferences.get("ABC123")).toBe("network");

    const preferenceSet = vi.spyOn(internal.sourcePreferences, "set");
    try {
      internal.applyNetworkSnapshot(snapshot);
      expect(preferenceSet).not.toHaveBeenCalled();
      // Respect an existing local affinity even when an alternate network
      // observation arrives; failover remains governed by its grace timer.
      internal.sourcePreferences.set("ABC123", "local");
      preferenceSet.mockClear();
      internal.applyNetworkSnapshot(snapshot);
      expect(internal.sourcePreferences.get("ABC123")).toBe("local");
      expect(preferenceSet).not.toHaveBeenCalled();
    } finally {
      preferenceSet.mockRestore();
    }
  });

  it("resolves the network trail limit per snapshot and preserves live config changes", () => {
    vi.useFakeTimers();
    vi.stubEnv("NETWORK_TRAIL_MAX_POINTS", "1");
    const base = new Date("2026-10-15T12:00:00.000Z");
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    services.push(service);
    const internal = service as unknown as {
      applyNetworkSnapshot: (snapshot: { aircraft: Aircraft[]; fetchedAt: string | null; provider: string }) => void;
    };
    function publish(second: number): void {
      const at = new Date(base.getTime() + second * 1_000);
      vi.setSystemTime(at);
      const normalized = normalizeAircraft({
        hex: "ABC123", flight: "NETWORK123", lat: 50.1 + second * 0.0001,
        lon: 14.1, seen: 0, seen_pos: 0,
      }, receiver, at);
      if (!normalized) throw new Error("missing normalized aircraft");
      internal.applyNetworkSnapshot({
        aircraft: [{ ...normalized, origin: "adsblol" }],
        fetchedAt: at.toISOString(), provider: "network-test",
      });
    }
    publish(0);
    publish(1);
    expect(service.getAircraft("ABC123", "extended")?.trail).toHaveLength(1);
    vi.stubEnv("NETWORK_TRAIL_MAX_POINTS", "3");
    publish(2);
    expect(service.getAircraft("ABC123", "extended")?.trail).toHaveLength(2);
  });

  it("keeps trails in server memory but omits them from live wire snapshots", async () => {
    const service = new AircraftStateService(new MockReadsbProvider({ lat: 50, lon: 14, name: "Test" }));
    services.push(service);
    await service.waitForReady();
    const compact = service.getSnapshot();
    const compactAgain = service.getSnapshot();
    const full = service.getSnapshot({ includeTrails: true });
    const fullAgain = service.getSnapshot({ includeTrails: true });

    expect(compactAgain).toBe(compact);
    expect(fullAgain).toBe(full);
    expect(service.getSnapshotCacheDiagnostics().builds.local).toBe(2);
    expect(compact.aircraft[0].trail).toBeUndefined();
    expect(full.aircraft[0].trail).toHaveLength(1);
    expect(service.getAircraft(full.aircraft[0].icaoHex)?.trail).toHaveLength(1);
    const diagnostics = service.getDiagnostics();
    expect(diagnostics.localTrailMaxPointsPerAircraft).toBeLessThanOrEqual(600);
    expect(diagnostics.localTrailOverLimitAircraftCount).toBe(0);
    expect(diagnostics.networkTrailOverLimitAircraftCount).toBe(0);
    expect(diagnostics.localTrailPointCount).toBeGreaterThanOrEqual(1);
  });

  it("uses one snapshot per calibration validator for its full diagnostic output", () => {
    const service = new AircraftStateService(new MockReadsbProvider({ lat: 50, lon: 14, name: "Test" }));
    services.push(service);
    const internal = service as unknown as {
      operationalTwinTrajectoryQualityOutcome: { report: (now?: Date) => unknown };
      operationalTwinTrajectoryQualityOutcomeV2: { report: (now?: Date) => unknown };
      regionalAttentionOutcome: { report: (now?: Date) => unknown };
    };
    const legacyReport = vi.spyOn(internal.operationalTwinTrajectoryQualityOutcome, "report");
    const v2Report = vi.spyOn(internal.operationalTwinTrajectoryQualityOutcomeV2, "report");
    const regionalReport = vi.spyOn(internal.regionalAttentionOutcome, "report");

    const diagnostics = service.getDiagnostics();
    expect(legacyReport).toHaveBeenCalledTimes(1);
    expect(v2Report).toHaveBeenCalledTimes(1);
    expect(regionalReport).toHaveBeenCalledTimes(1);
    expect(diagnostics.operationalTwinTrajectoryQualityGraduation.outcomeVersion)
      .toBe(diagnostics.operationalTwinTrajectoryQualityOutcome.version);
    expect(diagnostics.operationalTwinTrajectoryQualityV3Graduation.outcomeVersion)
      .toBe(diagnostics.operationalTwinTrajectoryQualityOutcomeV2.version);
    expect(diagnostics.regionalAttentionGraduation.outcomeVersion)
      .toBe(diagnostics.regionalAttentionOutcome.version);
    legacyReport.mockRestore();
    v2Report.mockRestore();
    regionalReport.mockRestore();
  });

  it("publishes the correct aircraft icon identity in the first live snapshot", async () => {
    vi.useFakeTimers();
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const observedAt = new Date("2026-09-27T12:00:00.000Z");
    vi.setSystemTime(observedAt);
    const aircraft = normalizeAircraft(
      { hex: "ABC123", flight: "TEST123", lat: 50.1, lon: 14.1, seen: 0, seen_pos: 0 },
      receiver,
      observedAt,
    );
    if (!aircraft) throw new Error("test aircraft could not be normalized");

    const provider: AircraftProvider = {
      name: "first-render-test",
      getSnapshot: async () => ({
        aircraft: [aircraft],
        receiver,
        fetchedAt: observedAt.toISOString(),
        provider: "first-render-test",
      }),
    };
    const getMetadata = vi.fn(async () => ({
      registration: "OK-ABC",
      registrationCountry: "Czechia",
      registrationCountryCode: "CZ",
      aircraftType: "A320",
      icaoTypeCode: "A320",
      aircraftDescription: "Airbus A320",
      operator: "Test Air",
      manufacturer: "Airbus",
      source: "tar1090-db",
      retrievedAt: observedAt.toISOString(),
    }));
    const enrichment = new EnrichmentService({
      initialAircraftMetadata: { name: "local-metadata", getMetadata },
    });
    const service = new AircraftStateService(
      provider,
      enrichment,
      new AtcSectorService(new EmptyAtcSectorProvider()),
    );
    services.push(service);

    const published: StateSnapshot[] = [];
    service.subscribe((snapshot) => published.push(snapshot));
    await service.waitForReady();

    expect(getMetadata).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      const latest = published.at(-1)?.aircraft.find((item) => item.icaoHex === "ABC123");
      expect(latest?.enrichment?.metadata?.icaoTypeCode).toBe("A320");
    });
    const publishedAircraft = published
      .map((snapshot) => snapshot.aircraft.find((item) => item.icaoHex === "ABC123"))
      .filter((item): item is Aircraft => item !== undefined);
    expect(publishedAircraft.length).toBeGreaterThan(0);
    const metadataAircraft = publishedAircraft.filter((item) => item.enrichment?.metadata?.icaoTypeCode === "A320");
    expect(metadataAircraft.length).toBeGreaterThan(0);
    expect(metadataAircraft.map((item) => classifyAircraftIcon(item).asset))
      .toEqual(metadataAircraft.map(() => "/aircraft-icons-tar1090/A320.svg"));
  });

  it("returns only metadata patches instead of rebuilding the full aircraft snapshot", async () => {
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const first = normalizeAircraft({ hex: "ABC123", flight: "ONE123", lat: 50, lon: 14 }, receiver);
    const second = normalizeAircraft({ hex: "DEF456", flight: "TWO456", lat: 50, lon: 14 }, receiver);
    if (!first || !second) throw new Error("failed to normalize aircraft");
    const getMetadata = vi.fn(async (hex: string) => hex === "DEF456" ? {
      registration: "OK-DEF", registrationCountry: null, registrationCountryCode: null,
      aircraftType: "A320", icaoTypeCode: "A320", aircraftDescription: null, operator: null,
      manufacturer: null, source: "fixture", retrievedAt: new Date().toISOString(),
    } : null);
    const enrichment = new EnrichmentService({ initialAircraftMetadata: { name: "initial", getMetadata } });
    const service = new AircraftStateService(new MockReadsbProvider(receiver), enrichment);
    services.push(service);
    const hydrate = (service as unknown as {
      hydrateInitialIconMetadata: (aircraft: Aircraft[], existing: Map<string, Aircraft>) => Promise<Aircraft[]>;
    }).hydrateInitialIconMetadata.bind(service);
    const current = new Map([[first.icaoHex, { ...first, enrichment: { metadata: {
      registration: "OK-ABC", registrationCountry: null, registrationCountryCode: null,
      aircraftType: null, icaoTypeCode: null, aircraftDescription: null, operator: null,
      manufacturer: null, source: "fixture", retrievedAt: new Date().toISOString(),
    } } }]]);
    const patches = await hydrate([first, second], current);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ icaoHex: "DEF456", enrichment: { metadata: { registration: "OK-DEF" } } });
    expect(getMetadata).toHaveBeenCalledTimes(1);
    expect(getMetadata).toHaveBeenCalledWith("DEF456");
  });

  it("coalesces in-flight local enrichment batches while continuing aircraft polls", async () => {
    const receiver = { lat: 50, lon: 14, name: "Test" };
    let releaseFirst!: (value: null) => void;
    const observed = new Date();
    const aircraft = normalizeAircraft(
      { hex: "ABC123", flight: "TEST123", lat: 50.2, lon: 14.3, seen: 0, seen_pos: 0 },
      receiver, observed,
    );
    if (!aircraft) throw new Error("missing test aircraft");
    const getSnapshot = vi.fn(async (): Promise<ProviderSnapshot> => ({
      aircraft: [{ ...aircraft, lastSeen: new Date().toISOString() }],
      receiver, fetchedAt: new Date().toISOString(), provider: "coalesce-local",
    }));
    const enrichment = new EnrichmentService({
      aircraftMetadata: { name: "metadata", getMetadata: vi.fn(async () => null) },
    });
    const enrich = vi.spyOn(enrichment, "enrich")
      .mockImplementationOnce(() => new Promise<null>((resolve) => { releaseFirst = resolve; }))
      .mockResolvedValue(null);
    const service = new AircraftStateService(
      { name: "coalesce-local", getSnapshot },
      enrichment,
      new AtcSectorService(new EmptyAtcSectorProvider()),
    );
    services.push(service);
    await service.waitForReady();
    const internal = service as unknown as {
      refresh: () => Promise<void>;
      localEnrichmentRefreshing: boolean;
    };
    // Optional enrichment can remain blocked while ingest keeps refreshing.
    expect(enrich).toHaveBeenCalledTimes(1);
    await internal.refresh();
    await internal.refresh();
    expect(getSnapshot.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(enrich).toHaveBeenCalledTimes(1);
    releaseFirst(null);
    // The async enrich loop resolves through Promise.allSettled and .finally.
    // Explicitly wait for the gate, not for an already-true call count.
    await vi.waitFor(() => expect(internal.localEnrichmentRefreshing).toBe(false));
    await internal.refresh();
    await vi.waitFor(() => expect(enrich).toHaveBeenCalledTimes(2));
  });

  it("patches network metadata without reapplying network positions", () => {
    vi.useFakeTimers();
    const observedAt = new Date("2026-10-07T12:00:00.000Z");
    vi.setSystemTime(observedAt);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const normalized = normalizeAircraft(
      { hex: "ABC123", flight: "NET123", lat: 50.1, lon: 14.1, seen: 0, seen_pos: 0 },
      receiver,
      observedAt,
    );
    if (!normalized) throw new Error("test aircraft could not be normalized");
    const network: Aircraft = {
      ...normalized,
      origin: "adsblol",
      provenance: {
        seenLocal: false,
        seenNetwork: true,
        lastLocalSeen: null,
        lastNetworkSeen: normalized.lastSeen,
        positionOrigin: "adsblol",
        positionSource: normalized.source,
      },
    };
    const metadata: NonNullable<AircraftEnrichment["metadata"]> = {
      registration: "OK-NET",
      registrationCountry: "Czechia",
      registrationCountryCode: "CZ",
      aircraftType: "A320",
      icaoTypeCode: "A320",
      aircraftDescription: "Airbus A320",
      operator: "Test Air",
      manufacturer: "Airbus",
      source: "tar1090-db",
      retrievedAt: observedAt.toISOString(),
    };
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    services.push(service);
    const internal = service as unknown as {
      applyNetworkSnapshot: (snapshot: { aircraft: Aircraft[]; fetchedAt: string | null; provider: string }) => void;
      applyNetworkInitialMetadata: (aircraft: Aircraft[]) => void;
    };

    internal.applyNetworkSnapshot({ aircraft: [network], fetchedAt: observedAt.toISOString(), provider: "network-test" });
    const beforeTrail = service.getAircraft("ABC123", "extended")?.trail.length;

    internal.applyNetworkInitialMetadata([{ ...network, enrichment: { metadata } }]);

    expect(service.getAircraft("ABC123", "extended")?.enrichment?.metadata?.icaoTypeCode).toBe("A320");
    expect(service.getAircraft("ABC123", "extended")?.trail.length).toBe(beforeTrail);
  });

  it("continues publishing fresh network positions while initial metadata is pending", async () => {
    vi.useFakeTimers();
    vi.stubEnv("READSB_POLL_INTERVAL_MS", "30000");
    const receiver = { lat: 50, lon: 14, name: "Test" };
    vi.setSystemTime(new Date("2026-10-08T07:05:54.000Z"));
    let finishMetadata!: (value: null) => void;
    const getMetadata = vi.fn(() => new Promise<null>((resolve) => { finishMetadata = resolve; }));
    const enrichment = new EnrichmentService({
      initialAircraftMetadata: { name: "pending-catalog", getMetadata },
    });
    const networkGetSnapshot = vi.fn(async () => {
      const now = new Date();
      const aircraft = normalizeAircraft({
        hex: "DEF456", lat: 50.2, lon: 14.2 + networkGetSnapshot.mock.calls.length / 1000,
        seen: 0, seen_pos: 0, type: "adsb_icao",
      }, receiver, now)!;
      return { aircraft: [{ ...aircraft, origin: "adsblol" as const }],
        fetchedAt: now.toISOString(), provider: "network-test" };
    });
    const service = new AircraftStateService(
      { name: "empty-local", getSnapshot: async () => ({
        aircraft: [], receiver, fetchedAt: new Date().toISOString(), provider: "empty-local",
      }) },
      enrichment,
      new AtcSectorService(new EmptyAtcSectorProvider()),
      undefined, undefined,
      {
        name: "network-test", start: vi.fn(), stop: vi.fn(async () => undefined),
        getSnapshot: networkGetSnapshot, getNextPollDelayMs: () => 1000,
        getDiagnostics: () => ({
          enabled: true, status: "online", lastAttemptAt: null, lastSuccessAt: null,
          latencyMs: null, consecutiveFailures: 0, aircraftCount: 1,
          positionedAircraftCount: 1, mlatAircraftCount: 0, radiusNm: 250,
          pollIntervalMs: 1000, retryAfterMs: null,
        }),
      },
    );
    services.push(service);
    const published: StateSnapshot[] = [];
    service.subscribe((snapshot) => published.push(snapshot), { coverage: "extended" });
    await service.waitForReady();
    await vi.advanceTimersByTimeAsync(1000);
    expect(getMetadata).toHaveBeenCalledOnce();

    // Longer than the position TTL: a frozen first snapshot would disappear.
    await vi.advanceTimersByTimeAsync(35_000);
    expect(networkGetSnapshot.mock.calls.length).toBeGreaterThanOrEqual(36);
    expect(getMetadata).toHaveBeenCalledOnce(); // No growing enrichment queue.
    const aircraft = published.at(-1)?.aircraft.find((item) => item.icaoHex === "DEF456");
    expect(aircraft?.lat).toBe(50.2);
    expect(aircraft?.lastSeen).toBe(new Date().toISOString());
    expect(aircraft?.lon).toBeGreaterThan(14.201);

    await service.stop();
    const notificationCount = published.length;
    finishMetadata(null);
    await vi.advanceTimersByTimeAsync(2000);
    expect(published).toHaveLength(notificationCount);
  });

  it("shares one cached snapshot construction across many listeners", async () => {
    const service = new AircraftStateService(new MockReadsbProvider({ lat: 50, lon: 14, name: "Test" }));
    services.push(service);
    const unsubscribers = Array.from({ length: 20 }, () => service.subscribe(() => undefined));
    await service.waitForReady();
    const before = service.getSnapshotCacheDiagnostics();
    (service as unknown as { notify: () => void }).notify();
    const after = service.getSnapshotCacheDiagnostics();

    expect(after.builds.local).toBe(before.builds.local);
    expect(after.cachedSnapshots).toBeGreaterThanOrEqual(1);
    for (const unsubscribe of unsubscribers) unsubscribe();
  });

  it("does not trigger AviationWeather fetches during the live poll and subscription path", async () => {
    vi.stubEnv("READSB_BASE_URL", "");
    vi.stubEnv("ADSBDB_ENABLED", "false");
    vi.stubEnv("FLIGHTAWARE_API_KEY", "");
    vi.stubEnv("ATC_SAMPLE_ENABLED", "true");
    const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("weather fetch must be explicit"));
    const service = new AircraftStateService(new MockReadsbProvider({ lat: 50, lon: 14, name: "Test" }));
    services.push(service);
    let notifications = 0;
    const unsubscribe = service.subscribe(() => {
      notifications += 1;
    });

    await service.waitForReady();
    unsubscribe();

    expect(notifications).toBeGreaterThan(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps network-only coverage out of local statistics and history", async () => {
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const local = normalizeAircraft({ hex: "ABC123", flight: "LOCAL123", lat: 50.1, lon: 14.1, messages: 10, seen: 0, seen_pos: 0 }, receiver);
    const network = normalizeAircraft({ hex: "DEF456", flight: "NETWORK456", lat: 50.2, lon: 14.2, seen: 0, seen_pos: 0 }, receiver);
    if (!local || !network) throw new Error("test aircraft could not be normalized");
    const networkObservation = {
      ...network,
      origin: "adsblol" as const,
      provenance: {
        seenLocal: false,
        seenNetwork: true,
        lastLocalSeen: null,
        lastNetworkSeen: network.lastSeen,
        positionOrigin: "adsblol" as const,
        positionSource: network.source,
      },
    };
    const localProvider: AircraftProvider = {
      name: "readsb",
      getSnapshot: async () => ({ aircraft: [local], receiver, fetchedAt: new Date().toISOString(), provider: "readsb" }),
    };
    const networkProvider: NetworkAircraftProvider = {
      name: "adsb.lol",
      start: vi.fn(),
      getSnapshot: vi.fn(async () => ({ aircraft: [networkObservation], fetchedAt: new Date().toISOString(), provider: "adsb.lol" })),
      getDiagnostics: () => ({
        enabled: true,
        status: "online" as const,
        lastAttemptAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        latencyMs: 20,
        consecutiveFailures: 0,
        aircraftCount: 1,
        positionedAircraftCount: 1,
        mlatAircraftCount: 0,
        radiusNm: 250,
        pollIntervalMs: 10_000,
        retryAfterMs: null,
      }),
      stop: vi.fn(async () => undefined),
    };
    vi.mocked(recordAircraftSnapshot).mockClear();
    const alertSend = vi.fn(async (alert: AircraftAlert) => { void alert; });
    const alerts = new AlertEngine({
      rules: [{ id: "network-watch", enabled: true, type: "callsignPattern", value: "NETWORK*" }],
      notifier: { name: "test", enabled: true, send: alertSend },
      history: { recordDetected: vi.fn(async () => undefined), recordNotification: vi.fn(async () => undefined) },
    });
    const service = new AircraftStateService(
      localProvider,
      new EnrichmentService({}),
      new AtcSectorService(new EmptyAtcSectorProvider()),
      alerts,
      undefined,
      networkProvider,
    );
    services.push(service);

    await service.waitForReady();
    const localSnapshot = service.getSnapshot();
    const extendedSnapshot = service.getSnapshot({ coverage: "extended" });
    await service.stop();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(localSnapshot.aircraft.map((item) => item.icaoHex)).toEqual(["ABC123"]);
    expect(extendedSnapshot.aircraft.map((item) => item.icaoHex).sort()).toEqual(["ABC123", "DEF456"]);
    expect(extendedSnapshot.coverageStats).toMatchObject({ localAircraft: 1, networkAircraft: 1, networkOnlyAircraft: 1 });
    expect(service.getStatistics().live.aircraftCount).toBe(1);
    const persistedAircraft = vi.mocked(recordAircraftSnapshot).mock.calls
      .map(([aircraft]) => aircraft)
      .filter((aircraft) => aircraft.length > 0)
      .flat();
    expect(persistedAircraft.map((item) => item.icaoHex)).toEqual(["ABC123"]);
    expect(alertSend.mock.calls.some(([alert]) => alert.aircraft.icaoHex === "DEF456")).toBe(false);
    expect(alertSend.mock.calls.some(([alert]) => alert.type === "watchlist")).toBe(false);
    expect(networkProvider.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("keeps local aircraft without a usable position in extended snapshots", () => {
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const positioned = normalizeAircraft({ hex: "ABC123", flight: "LOCAL123", lat: 50.1, lon: 14.1, seen: 0.5, seen_pos: 0.5 }, receiver);
    const noPosition = normalizeAircraft({ hex: "DEF456", flight: "LOCAL456", alt_baro: 12_000, seen: 0.2, seen_pos: null }, receiver);
    if (!positioned || !noPosition) throw new Error("test aircraft could not be normalized");
    const service = new AircraftStateService(
      new MockReadsbProvider(receiver),
      new EnrichmentService({}),
      new AtcSectorService(new EmptyAtcSectorProvider()),
      undefined,
      undefined,
      {
        name: "adsb.lol",
        start: vi.fn(),
        getSnapshot: vi.fn(async () => ({ aircraft: [], fetchedAt: null, provider: "adsb.lol" })),
        getDiagnostics: () => ({
          enabled: false,
          status: "disabled" as const,
          lastAttemptAt: null,
          lastSuccessAt: null,
          latencyMs: null,
          consecutiveFailures: 0,
          aircraftCount: 0,
          positionedAircraftCount: 0,
          mlatAircraftCount: 0,
          radiusNm: 250,
          pollIntervalMs: 10_000,
          retryAfterMs: null,
        }),
        stop: vi.fn(async () => undefined),
      },
    );
    const internal = service as unknown as { applySnapshot: (snapshot: ProviderSnapshot) => void };
    internal.applySnapshot({ aircraft: [positioned, noPosition], receiver, fetchedAt: new Date().toISOString(), provider: "readsb" });

    const local = service.getSnapshot();
    const extended = service.getSnapshot({ coverage: "extended" });
    const localIds = new Set(local.aircraft.map((aircraft) => aircraft.icaoHex));
    const extendedIds = new Set(extended.aircraft.map((aircraft) => aircraft.icaoHex));

    expect(localIds).toEqual(new Set(["ABC123", "DEF456"]));
    for (const id of localIds) expect(extendedIds.has(id)).toBe(true);
    expect(extended.aircraft).toHaveLength(local.aircraft.length);
    expect(extended.aircraft.find((aircraft) => aircraft.icaoHex === "DEF456")).toMatchObject({ lat: null, lon: null });
    expect(extended.coverageStats).toMatchObject({ displayedAircraft: 2, localAircraft: 2, networkAircraft: 0, networkOnlyAircraft: 0 });
  });

  it("keeps the preferred last-known position and fails over without a blank interval", () => {
    vi.useFakeTimers();
    vi.stubEnv("SOURCE_AFFINITY_FAILOVER_GRACE_MS", "1000");
    const base = new Date("2026-09-22T08:00:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const local = normalizeAircraft({ hex: "ABC123", flight: "LOCAL123", lat: 50.1, lon: 14.1, seen: 0, seen_pos: 0 }, receiver, base);
    const network = normalizeAircraft({ hex: "ABC123", flight: "NETWORK123", lat: 50.2, lon: 14.2, seen: 0, seen_pos: 0 }, receiver, base);
    if (!local || !network) throw new Error("test aircraft could not be normalized");
    const networkObservation: Aircraft = {
      ...network,
      origin: "adsblol",
      provenance: {
        seenLocal: false,
        seenNetwork: true,
        lastLocalSeen: null,
        lastNetworkSeen: network.lastSeen,
        positionOrigin: "adsblol",
        positionSource: network.source,
      },
    };
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const internal = service as unknown as {
      applySnapshot: (snapshot: ProviderSnapshot) => void;
      applyNetworkSnapshot: (snapshot: { aircraft: Aircraft[]; fetchedAt: string | null; provider: string }) => void;
      sourcePreferences: Map<string, "local" | "network">;
    };

    internal.applyNetworkSnapshot({ aircraft: [networkObservation], fetchedAt: base.toISOString(), provider: "adsb.lol" });
    internal.applySnapshot({ aircraft: [local], receiver, fetchedAt: base.toISOString(), provider: "readsb" });
    expect(internal.sourcePreferences.get("ABC123")).toBe("network");

    internal.applyNetworkSnapshot({ aircraft: [], fetchedAt: base.toISOString(), provider: "adsb.lol" });
    expect(service.getSnapshot({ coverage: "extended" }).aircraft[0]).toMatchObject({
      icaoHex: "ABC123",
      lat: 50.2,
      lon: 14.2,
      origin: "adsblol",
    });

    const afterGrace = new Date(base.getTime() + 1_100);
    vi.setSystemTime(afterGrace);
    const refreshedLocal = normalizeAircraft({ hex: "ABC123", flight: "LOCAL123", lat: 50.11, lon: 14.11, seen: 0, seen_pos: 0 }, receiver, afterGrace);
    if (!refreshedLocal) throw new Error("test aircraft could not be normalized");
    internal.applySnapshot({ aircraft: [refreshedLocal], receiver, fetchedAt: afterGrace.toISOString(), provider: "readsb" });

    expect(internal.sourcePreferences.get("ABC123")).toBe("local");
    expect(service.getSnapshot({ coverage: "extended" }).aircraft[0]).toMatchObject({
      icaoHex: "ABC123",
      lat: 50.11,
      lon: 14.11,
      origin: "local",
    });
  });

  it("computes extended local coverage ratio from raw network observations", () => {
    vi.useFakeTimers();
    const base = new Date("2026-09-22T08:10:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const local = normalizeAircraft({ hex: "ABC123", flight: "LOCAL123", lat: 55, lon: 14, seen: 0, seen_pos: 0 }, receiver, base);
    const network = normalizeAircraft({ hex: "ABC123", flight: "NETWORK123", lat: 50.1, lon: 14.1, seen: 0, seen_pos: 0 }, receiver, base);
    if (!local || !network) throw new Error("test aircraft could not be normalized");
    const networkObservation: Aircraft = {
      ...network,
      origin: "adsblol",
      provenance: {
        seenLocal: false,
        seenNetwork: true,
        lastLocalSeen: null,
        lastNetworkSeen: network.lastSeen,
        positionOrigin: "adsblol",
        positionSource: network.source,
      },
    };
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const internal = service as unknown as {
      applySnapshot: (snapshot: ProviderSnapshot) => void;
      applyNetworkSnapshot: (snapshot: { aircraft: Aircraft[]; fetchedAt: string | null; provider: string }) => void;
    };

    internal.applySnapshot({ aircraft: [local], receiver, fetchedAt: base.toISOString(), provider: "readsb" });
    internal.applyNetworkSnapshot({ aircraft: [networkObservation], fetchedAt: base.toISOString(), provider: "adsb.lol" });

    expect(service.getSnapshot({ coverage: "extended" }).localCoverageRatio).toEqual({
      radiusNm: 175,
      numerator: 1,
      denominator: 1,
      percentage: 100,
    });
  });

  it("keeps single-aircraft extended lookup equivalent to the extended snapshot merge", () => {
    vi.useFakeTimers();
    const base = new Date("2026-09-22T08:10:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const local = normalizeAircraft({ hex: "ABC123", flight: "LOCAL123", lat: 50.1, lon: 14.1, seen: 0, seen_pos: 0 }, receiver, base);
    const network = normalizeAircraft({ hex: "ABC123", flight: "NETWORK123", lat: 50.101, lon: 14.101, seen: 0, seen_pos: 0 }, receiver, base);
    if (!local || !network) throw new Error("test aircraft could not be normalized");
    const networkObservation = { ...network, origin: "adsblol" as const };
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const internal = service as unknown as {
      applySnapshot: (snapshot: ProviderSnapshot) => void;
      applyNetworkSnapshot: (snapshot: { aircraft: Aircraft[]; fetchedAt: string | null; provider: string }) => void;
    };
    internal.applySnapshot({ aircraft: [local], receiver, fetchedAt: base.toISOString(), provider: "readsb" });
    internal.applyNetworkSnapshot({ aircraft: [networkObservation], fetchedAt: base.toISOString(), provider: "adsb.lol" });

    const expected = service.getSnapshot({ coverage: "extended", includeTrails: true }).aircraft.find((item) => item.icaoHex === "ABC123");
    expect(service.getAircraft("abc123", "extended")).toEqual(expected);
  });

  it("reconciles affinity once per snapshot and cleans up the final stale identity", () => {
    vi.useFakeTimers();
    vi.stubEnv("ADSBLOL_STALE_AFTER_MS", "5000");
    vi.stubEnv("AIRCRAFT_STALE_AFTER_MS", "5000");
    const at = new Date("2026-10-16T08:00:00Z");
    vi.setSystemTime(at);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const incoming = normalizeAircraft(
      { hex: "ABC123", flight: "NET123", lat: 50.1, lon: 14.1 }, receiver, at,
    );
    if (!incoming) throw new Error("missing aircraft");
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const internal = service as unknown as {
      applySnapshot: (snapshot: ProviderSnapshot) => void;
      applyNetworkSnapshot: (snapshot: { aircraft: Aircraft[]; fetchedAt: string | null; provider: string }) => void;
      reconcileSourcePreferences: (now?: number) => void;
      sourcePreferences: Map<string, "local" | "network">;
      sourcePreferenceMissingSince: Map<string, number>;
      networkAircraft: Map<string, Aircraft>;
    };
    const scan = vi.spyOn(internal, "reconcileSourcePreferences");
    internal.applyNetworkSnapshot({ aircraft: [{ ...incoming, origin: "adsblol" }], fetchedAt: at.toISOString(), provider: "network" });
    expect(scan).toHaveBeenCalledTimes(1);
    expect(internal.sourcePreferences.get("ABC123")).toBe("network");

    // Stable membership cannot start or advance a failover: skip even the
    // first complete map scan while preserving the received position.
    const stable = new Date(at.getTime() + 1_000);
    vi.setSystemTime(stable);
    internal.applyNetworkSnapshot({
      aircraft: [{ ...incoming, origin: "adsblol", lastSeen: stable.toISOString() }],
      fetchedAt: stable.toISOString(), provider: "network",
    });
    expect(scan).toHaveBeenCalledTimes(1);

    const stale = new Date(at.getTime() + 6_001);
    vi.setSystemTime(stale);
    internal.applyNetworkSnapshot({ aircraft: [], fetchedAt: stale.toISOString(), provider: "network" });
    expect(scan).toHaveBeenCalledTimes(2);
    expect(internal.networkAircraft.has("ABC123")).toBe(false);
    expect(internal.sourcePreferences.has("ABC123")).toBe(false);
    expect(internal.sourcePreferenceMissingSince.has("ABC123")).toBe(false);

    const local = normalizeAircraft({ hex: "DEF456", flight: "LOCAL456", lat: 50, lon: 14 }, receiver, stale);
    if (!local) throw new Error("missing local");
    internal.applySnapshot({ aircraft: [local], receiver, fetchedAt: stale.toISOString(), provider: "local" });
    expect(scan).toHaveBeenCalledTimes(3);
    // Same local membership and no pending handoff: also skip the local scan.
    internal.applySnapshot({ aircraft: [local], receiver, fetchedAt: stale.toISOString(), provider: "local" });
    expect(scan).toHaveBeenCalledTimes(3);
  });

  it("retains a missing network aircraft until its stale window expires", () => {
    vi.useFakeTimers();
    vi.stubEnv("ADSBLOL_STALE_AFTER_MS", "30000");
    const base = new Date("2026-09-22T08:20:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const local = normalizeAircraft({ hex: "ABC123", flight: "LOCAL123", lat: 50.1, lon: 14.1, seen: 0, seen_pos: 0 }, receiver, base);
    const network = normalizeAircraft({ hex: "DEF456", flight: "NETWORK456", lat: 50.2, lon: 14.2, seen: 0, seen_pos: 0 }, receiver, base);
    if (!local || !network) throw new Error("test aircraft could not be normalized");
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const internal = service as unknown as {
      applySnapshot: (snapshot: ProviderSnapshot) => void;
      applyNetworkSnapshot: (snapshot: { aircraft: Aircraft[]; fetchedAt: string | null; provider: string }) => void;
    };
    internal.applySnapshot({ aircraft: [local], receiver, fetchedAt: base.toISOString(), provider: "readsb" });
    internal.applyNetworkSnapshot({ aircraft: [network], fetchedAt: base.toISOString(), provider: "adsb.lol" });
    expect(service.getSnapshot({ coverage: "extended" }).aircraft.map((item) => item.icaoHex).sort()).toEqual(["ABC123", "DEF456"]);
    expect(service.getDiagnostics().networkTrailPointCount).toBeGreaterThan(0);
    expect(service.getDiagnostics().networkTrailMaxPointsPerAircraft).toBeGreaterThan(0);
    expect(service.getDiagnostics().networkTrailOverLimitAircraftCount).toBe(0);

    const shortGap = new Date(base.getTime() + 10_000);
    vi.setSystemTime(shortGap);
    internal.applyNetworkSnapshot({ aircraft: [], fetchedAt: shortGap.toISOString(), provider: "adsb.lol" });
    expect(service.getSnapshot({ coverage: "extended" }).aircraft.map((item) => item.icaoHex).sort()).toEqual(["ABC123", "DEF456"]);

    const expired = new Date(base.getTime() + 30_001);
    vi.setSystemTime(expired);
    internal.applyNetworkSnapshot({ aircraft: [], fetchedAt: expired.toISOString(), provider: "adsb.lol" });
    const degraded = service.getSnapshot({ coverage: "extended" });
    expect(degraded.aircraft.map((item) => item.icaoHex)).toEqual(["ABC123"]);
    expect(degraded.coverageStats).toMatchObject({ displayedAircraft: 1, localAircraft: 1, networkAircraft: 0, networkOnlyAircraft: 0 });
    expect(service.getDiagnostics().networkTrailPointCount).toBe(0);
    expect(service.getDiagnostics().networkTrailMaxPointsPerAircraft).toBe(0);
    expect(service.getDiagnostics().networkTrailAtLimitAircraftCount).toBe(0);
  });

  it("retains a locally observed aircraft through a short successful snapshot omission", () => {
    vi.useFakeTimers();
    vi.stubEnv("AIRCRAFT_STALE_AFTER_MS", "15000");
    const base = new Date("2026-09-22T08:30:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const local = normalizeAircraft({ hex: "ABC123", flight: "LOCAL123", lat: 50.1, lon: 14.1, seen: 0, seen_pos: 0 }, receiver, base);
    if (!local) throw new Error("test aircraft could not be normalized");
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const internal = service as unknown as { applySnapshot: (snapshot: ProviderSnapshot) => void };

    internal.applySnapshot({ aircraft: [local], receiver, fetchedAt: base.toISOString(), provider: "readsb" });
    const shortGap = new Date(base.getTime() + 3_000);
    vi.setSystemTime(shortGap);
    internal.applySnapshot({ aircraft: [], receiver, fetchedAt: shortGap.toISOString(), provider: "readsb" });
    expect(service.getSnapshot().aircraft[0]).toMatchObject({ icaoHex: "ABC123", lat: 50.1, lon: 14.1 });

    const expired = new Date(base.getTime() + 15_001);
    vi.setSystemTime(expired);
    internal.applySnapshot({ aircraft: [], receiver, fetchedAt: expired.toISOString(), provider: "readsb" });
    expect(service.getSnapshot().aircraft).toEqual([]);
  });

  it("defers one suspicious mass-disappearance cycle before pruning stale local aircraft", () => {
    vi.useFakeTimers();
    vi.stubEnv("AIRCRAFT_STALE_AFTER_MS", "15000");
    vi.stubEnv("AIRCRAFT_MASS_DROP_MIN_BASELINE", "20");
    vi.stubEnv("AIRCRAFT_MASS_DROP_RATIO", "0.5");
    const base = new Date("2026-09-22T08:40:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const makeAircraft = (index: number, at: Date): Aircraft => {
      const hex = index.toString(16).padStart(6, "0").toUpperCase();
      const aircraft = normalizeAircraft({
        hex,
        flight: `TEST${index}`,
        lat: 50 + index / 10_000,
        lon: 14 + index / 10_000,
        seen: 0,
        seen_pos: 0,
      }, receiver, at);
      if (!aircraft) throw new Error("test aircraft could not be normalized");
      return aircraft;
    };
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const internal = service as unknown as { applySnapshot: (snapshot: ProviderSnapshot) => void };
    const initial = Array.from({ length: 20 }, (_, index) => makeAircraft(index + 1, base));
    internal.applySnapshot({ aircraft: initial, receiver, fetchedAt: base.toISOString(), provider: "readsb" });

    const firstDropAt = new Date(base.getTime() + 16_000);
    vi.setSystemTime(firstDropAt);
    const firstLow = [makeAircraft(1, firstDropAt), makeAircraft(2, firstDropAt)];
    internal.applySnapshot({ aircraft: firstLow, receiver, fetchedAt: firstDropAt.toISOString(), provider: "readsb" });

    expect(service.getSnapshot().aircraft).toHaveLength(20);
    expect(service.getDiagnostics().continuity.local).toMatchObject({
      massDropCandidates: 1,
      massDropDeferrals: 1,
      massDropConfirmed: 0,
      massDropPending: true,
      retainedAircraft: 20,
      observedAircraft: 2,
    });

    const confirmedAt = new Date(base.getTime() + 17_000);
    vi.setSystemTime(confirmedAt);
    const secondLow = [makeAircraft(1, confirmedAt), makeAircraft(2, confirmedAt)];
    internal.applySnapshot({ aircraft: secondLow, receiver, fetchedAt: confirmedAt.toISOString(), provider: "readsb" });

    expect(service.getSnapshot().aircraft.map((aircraft) => aircraft.icaoHex).sort()).toEqual(["000001", "000002"]);
    expect(service.getDiagnostics().continuity.local).toMatchObject({
      massDropCandidates: 1,
      massDropDeferrals: 1,
      massDropConfirmed: 1,
      massDropPending: false,
      staleExpirations: 18,
    });
  });

  it("cancels a deferred mass drop when the next local snapshot recovers", () => {
    vi.useFakeTimers();
    vi.stubEnv("AIRCRAFT_STALE_AFTER_MS", "15000");
    vi.stubEnv("AIRCRAFT_MASS_DROP_MIN_BASELINE", "20");
    vi.stubEnv("AIRCRAFT_MASS_DROP_RATIO", "0.5");
    const base = new Date("2026-09-22T08:50:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const makeAircraft = (index: number, at: Date): Aircraft => {
      const hex = index.toString(16).padStart(6, "0").toUpperCase();
      const aircraft = normalizeAircraft({ hex, flight: `TEST${index}`, lat: 50, lon: 14 + index / 10_000, seen: 0, seen_pos: 0 }, receiver, at);
      if (!aircraft) throw new Error("test aircraft could not be normalized");
      return aircraft;
    };
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const internal = service as unknown as { applySnapshot: (snapshot: ProviderSnapshot) => void };
    internal.applySnapshot({
      aircraft: Array.from({ length: 20 }, (_, index) => makeAircraft(index + 1, base)),
      receiver,
      fetchedAt: base.toISOString(),
      provider: "readsb",
    });

    const dropAt = new Date(base.getTime() + 16_000);
    vi.setSystemTime(dropAt);
    internal.applySnapshot({
      aircraft: [makeAircraft(1, dropAt), makeAircraft(2, dropAt)],
      receiver,
      fetchedAt: dropAt.toISOString(),
      provider: "readsb",
    });
    expect(service.getSnapshot().aircraft).toHaveLength(20);

    const recoveredAt = new Date(base.getTime() + 17_000);
    vi.setSystemTime(recoveredAt);
    internal.applySnapshot({
      aircraft: Array.from({ length: 20 }, (_, index) => makeAircraft(index + 1, recoveredAt)),
      receiver,
      fetchedAt: recoveredAt.toISOString(),
      provider: "readsb",
    });

    expect(service.getSnapshot().aircraft).toHaveLength(20);
    expect(service.getDiagnostics().continuity.local).toMatchObject({
      massDropCandidates: 1,
      massDropDeferrals: 1,
      massDropConfirmed: 0,
      massDropRecovered: 1,
      massDropPending: false,
      recoveredOmissions: 18,
    });
  });

  it("keeps the history sample throttle across a short disappearance", async () => {
    vi.useFakeTimers();
    vi.stubEnv("HISTORY_SAMPLE_INTERVAL_MS", "20000");
    const base = new Date("2026-09-07T12:00:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const internal = service as unknown as {
      applySnapshot: (snapshot: ProviderSnapshot) => void;
      persistHistory: (snapshot: ProviderSnapshot) => Promise<void>;
    };
    const snapshot = (aircraft: Aircraft[], at: Date): ProviderSnapshot => ({
      aircraft,
      receiver,
      fetchedAt: at.toISOString(),
      provider: "test",
    });
    const makeAircraft = (at: Date, lon = 14): Aircraft => {
      const aircraft = normalizeAircraft({ hex: "ABC123", flight: "TEST123", lat: 50, lon }, receiver, at);
      if (!aircraft) throw new Error("test aircraft could not be normalized");
      return aircraft;
    };
    const historyWrites = () => vi.mocked(recordAircraftSnapshot).mock.calls.filter(([aircraft]) => aircraft.length > 0);

    vi.mocked(recordAircraftSnapshot).mockClear();
    const firstAt = new Date(base);
    const first = makeAircraft(firstAt);
    const firstSnapshot = snapshot([first], firstAt);
    internal.applySnapshot(firstSnapshot);
    await internal.persistHistory(firstSnapshot);
    expect(historyWrites()).toHaveLength(1);

    const disappearedAt = new Date(base.getTime() + 3_000);
    vi.setSystemTime(disappearedAt);
    const disappeared = snapshot([], disappearedAt);
    internal.applySnapshot(disappeared);
    await internal.persistHistory(disappeared);

    const reappearedAt = new Date(base.getTime() + 6_000);
    vi.setSystemTime(reappearedAt);
    const reappeared = snapshot([makeAircraft(reappearedAt, 14.01)], reappearedAt);
    internal.applySnapshot(reappeared);
    await internal.persistHistory(reappeared);
    expect(historyWrites()).toHaveLength(1);

    const laterAt = new Date(base.getTime() + 21_000);
    vi.setSystemTime(laterAt);
    const later = snapshot([makeAircraft(laterAt, 14.02)], laterAt);
    internal.applySnapshot(later);
    await internal.persistHistory(later);
    expect(historyWrites()).toHaveLength(2);
  });

  it("uses fetchedAt for history cadence when a snapshot is delayed", async () => {
    vi.useFakeTimers();
    vi.stubEnv("HISTORY_SAMPLE_INTERVAL_MS", "20000");
    const base = new Date("2026-09-07T12:00:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const internal = service as unknown as {
      persistHistory: (snapshot: ProviderSnapshot) => Promise<void>;
    };
    const makeSnapshot = (at: Date, lon: number): ProviderSnapshot => {
      const aircraft = normalizeAircraft({ hex: "ABC123", flight: "TEST123", lat: 50, lon }, receiver, at);
      if (!aircraft) throw new Error("test aircraft could not be normalized");
      return { aircraft: [aircraft], receiver, fetchedAt: at.toISOString(), provider: "test" };
    };
    const historyWrites = () => vi.mocked(recordAircraftSnapshot).mock.calls.filter(([aircraft]) => aircraft.length > 0);

    vi.mocked(recordAircraftSnapshot).mockClear();
    await internal.persistHistory(makeSnapshot(base, 14));

    vi.setSystemTime(new Date(base.getTime() + 21_000));
    await internal.persistHistory(makeSnapshot(new Date(base.getTime() + 6_000), 14.01));
    expect(historyWrites()).toHaveLength(1);

    vi.setSystemTime(new Date(base.getTime() + 24_000));
    await internal.persistHistory(makeSnapshot(new Date(base.getTime() + 21_000), 14.02));
    expect(historyWrites()).toHaveLength(2);
    expect(historyWrites()[1]?.[1]).toEqual(new Date(base.getTime() + 21_000));
  });

  it("keeps queued observation fields paired with its fetchedAt", async () => {
    vi.useFakeTimers();
    vi.stubEnv("HISTORY_SAMPLE_INTERVAL_MS", "20000");
    const base = new Date("2026-09-07T12:00:00.000Z");
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const queuedAt = new Date(base.getTime() + 6_000);
    const currentAt = new Date(base.getTime() + 21_000);
    const queued = normalizeAircraft(
      { hex: "ABC123", flight: "TEST123", lat: 50, lon: 14, alt_baro: 10_000 },
      receiver,
      queuedAt,
    );
    const current = normalizeAircraft(
      { hex: "ABC123", flight: "TEST123", lat: 50, lon: 14.2, alt_baro: 18_000 },
      receiver,
      currentAt,
    );
    if (!queued || !current) throw new Error("test aircraft could not be normalized");
    vi.setSystemTime(currentAt);
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const internal = service as unknown as {
      applySnapshot: (snapshot: ProviderSnapshot) => void;
      persistHistory: (snapshot: ProviderSnapshot) => Promise<void>;
    };
    internal.applySnapshot({ aircraft: [current], receiver, fetchedAt: currentAt.toISOString(), provider: "test" });
    vi.mocked(recordAircraftSnapshot).mockClear();

    await internal.persistHistory({ aircraft: [queued], receiver, fetchedAt: queuedAt.toISOString(), provider: "test" });

    const persisted = vi.mocked(recordAircraftSnapshot).mock.calls[0]?.[0]?.[0];
    expect(vi.mocked(recordAircraftSnapshot).mock.calls[0]?.[1]).toEqual(queuedAt);
    expect(persisted).toMatchObject({ callsign: "TEST123", lon: 14, altitude: 10_000 });
    expect(persisted?.lon).not.toBe(14.2);
    expect(persisted?.altitude).not.toBe(18_000);
  });

  it("does not copy callsign-bound enrichment from a newer callsign", async () => {
    vi.useFakeTimers();
    const base = new Date("2026-09-07T12:00:00.000Z");
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const queuedAt = new Date(base.getTime() + 6_000);
    const currentAt = new Date(base.getTime() + 21_000);
    const queued = normalizeAircraft({ hex: "ABC123", flight: "OLD123", lat: 50, lon: 14 }, receiver, queuedAt);
    const current = normalizeAircraft({ hex: "ABC123", flight: "NEW123", lat: 50, lon: 14.2 }, receiver, currentAt);
    if (!queued || !current) throw new Error("test aircraft could not be normalized");
    current.enrichment = {
      metadata: {
        registration: "OK-ABC", registrationCountry: null, registrationCountryCode: null,
        aircraftType: "A320", icaoTypeCode: "A320", aircraftDescription: "Airbus A320", operator: "Test Air",
        manufacturer: "Airbus", source: "test", retrievedAt: currentAt.toISOString(),
      },
      route: {
        callsign: "NEW123", airline: "New Air", airlineIcao: null, airlineIata: null,
        origin: "LKPR", destination: "EDDF", originAirport: null, destinationAirport: null,
        source: "test", retrievedAt: currentAt.toISOString(),
      },
    };
    vi.setSystemTime(currentAt);
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const internal = service as unknown as {
      applySnapshot: (snapshot: ProviderSnapshot) => void;
      persistHistory: (snapshot: ProviderSnapshot) => Promise<void>;
    };
    internal.applySnapshot({ aircraft: [current], receiver, fetchedAt: currentAt.toISOString(), provider: "test" });
    vi.mocked(recordAircraftSnapshot).mockClear();

    await internal.persistHistory({ aircraft: [queued], receiver, fetchedAt: queuedAt.toISOString(), provider: "test" });

    const persisted = vi.mocked(recordAircraftSnapshot).mock.calls[0]?.[0]?.[0];
    expect(persisted?.callsign).toBe("OLD123");
    expect(persisted?.enrichment?.route).toBeUndefined();
    expect(persisted?.enrichment?.metadata).toMatchObject({ registration: "OK-ABC", manufacturer: "Airbus" });
  });

  it("advances history cadence only for aircraft whose write succeeded", async () => {
    vi.useFakeTimers();
    vi.stubEnv("HISTORY_SAMPLE_INTERVAL_MS", "20000");
    const base = new Date("2026-09-07T12:00:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const makeAircraft = (hex: string): Aircraft => {
      const aircraft = normalizeAircraft({ hex, flight: hex, lat: 50, lon: 14 }, receiver, base);
      if (!aircraft) throw new Error("test aircraft could not be normalized");
      return aircraft;
    };
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const internal = service as unknown as {
      persistHistory: (snapshot: ProviderSnapshot) => Promise<void>;
      lastHistorySample: Map<string, number>;
    };
    const aircraft = [makeAircraft("ABC123"), makeAircraft("DEF456")];
    const snapshot = (at: Date): ProviderSnapshot => ({ aircraft, receiver, fetchedAt: at.toISOString(), provider: "test" });
    vi.mocked(recordAircraftSnapshot).mockClear();
    vi.mocked(recordAircraftSnapshot).mockResolvedValueOnce({ succeeded: ["ABC123"], failed: ["DEF456"] });
    await internal.persistHistory(snapshot(base));
    expect(internal.lastHistorySample.has("ABC123")).toBe(true);
    expect(internal.lastHistorySample.has("DEF456")).toBe(false);

    const later = new Date(base.getTime() + 20_000);
    vi.setSystemTime(later);
    await internal.persistHistory(snapshot(later));
    expect(vi.mocked(recordAircraftSnapshot).mock.calls[1]?.[0]?.map((item) => item.icaoHex)).toEqual(["ABC123", "DEF456"]);
  });

  it("skips history without writing when fetchedAt is invalid", async () => {
    const service = new AircraftStateService(new MockReadsbProvider({ lat: 50, lon: 14, name: "Test" }));
    const persistHistory = (service as unknown as { persistHistory: (snapshot: ProviderSnapshot) => Promise<void> }).persistHistory;
    vi.mocked(recordAircraftSnapshot).mockClear();
    const error = vi.spyOn(logger, "error").mockImplementation(() => logger);

    await persistHistory({ aircraft: [], receiver: { lat: 50, lon: 14, name: "Test" }, fetchedAt: "invalid", provider: "test" });

    expect(recordAircraftSnapshot).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("AirRadar history snapshot skipped: invalid fetchedAt");
    error.mockRestore();
  });

  it("stores observation metadata in each RAM trail point", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:00:06.000Z"));
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const service = new AircraftStateService(new MockReadsbProvider(receiver));
    const applySnapshot = (aircraft: Aircraft): void => {
      (service as unknown as { applySnapshot: (snapshot: ProviderSnapshot) => void }).applySnapshot({
        aircraft: [aircraft],
        receiver,
        fetchedAt: aircraft.lastSeen,
        provider: "test",
      });
    };
    const observations = [
      { at: "2026-09-07T12:00:00.000Z", lon: 14, altitude: 8_000, groundSpeed: 250, track: 90 },
      { at: "2026-09-07T12:00:03.000Z", lon: 14.01, altitude: 12_000, groundSpeed: 300, track: 180 },
      { at: "2026-09-07T12:00:06.000Z", lon: 14.02, altitude: 18_000, groundSpeed: 350, track: 270 },
    ];
    for (const observation of observations) {
      const aircraft = normalizeAircraft({
        hex: "ABC123",
        flight: "TEST123",
        lat: 50,
        lon: observation.lon,
        alt_baro: observation.altitude,
        gs: observation.groundSpeed,
        track: observation.track,
        seen: 0,
        seen_pos: 0,
      }, receiver, new Date(observation.at));
      if (!aircraft) throw new Error("test aircraft could not be normalized");
      applySnapshot(aircraft);
    }

    expect(service.getAircraft("ABC123")?.trail.map((point) => ({
      altitude: point.altitude,
      groundSpeed: point.groundSpeed,
      track: point.track,
    }))).toEqual([
      { altitude: 8_000, groundSpeed: 250, track: 90 },
      { altitude: 12_000, groundSpeed: 300, track: 180 },
      { altitude: 18_000, groundSpeed: 350, track: 270 },
    ]);
  });

  it("keeps hex-bound metadata when the same aircraft changes callsign", async () => {
    const firstAircraft = normalizeAircraft({ hex: "ABC123", flight: "OLD123", lat: 50, lon: 14 }, { lat: 50, lon: 14, name: "Test" });
    const secondAircraft = normalizeAircraft({ hex: "ABC123", flight: "NEW123", lat: 50.01, lon: 14.01 }, { lat: 50, lon: 14, name: "Test" });
    if (!firstAircraft || !secondAircraft) throw new Error("test aircraft could not be normalized");
    firstAircraft.enrichment = {
      metadata: {
        registration: "OK-ABC", registrationCountry: "Testland", registrationCountryCode: "TT",
        aircraftType: "A320", icaoTypeCode: "A320", aircraftDescription: "Airbus A320", operator: "Operator ABC123",
        manufacturer: "Airbus", source: "test", retrievedAt: new Date().toISOString(),
      },
      route: {
        callsign: "OLD123", airline: "Old Airline", airlineIcao: null, airlineIata: null,
        origin: "LKPR", destination: "EDDF", originAirport: null, destinationAirport: null,
        source: "test", retrievedAt: new Date().toISOString(),
      },
    };
    const snapshots: ProviderSnapshot[] = [
      { aircraft: [firstAircraft], receiver: { lat: 50, lon: 14, name: "Test" }, fetchedAt: new Date().toISOString(), provider: "test" },
      { aircraft: [secondAircraft], receiver: { lat: 50, lon: 14, name: "Test" }, fetchedAt: new Date(Date.now() + 1_000).toISOString(), provider: "test" },
    ];
    const provider: AircraftProvider = {
      name: "test",
      getSnapshot: async () => snapshots.shift() ?? snapshots[0],
    };
    const service = new AircraftStateService(provider, new EnrichmentService({}), new AtcSectorService(new EmptyAtcSectorProvider()));
    services.push(service);

    await service.waitForReady();
    await (service as unknown as { refresh: () => Promise<void> }).refresh();

    const current = service.getAircraft("ABC123");
    expect(current?.callsign).toBe("NEW123");
    expect(current?.enrichment?.metadata).toMatchObject({ registration: "OK-ABC", operator: "Operator ABC123" });
    expect(current?.enrichment?.route).toBeUndefined();
  });

  it("does not attach a slow enrichment result to a newer observation", async () => {
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const observedAt = new Date();
    const first = normalizeAircraft({ hex: "ABC123", flight: "TEST123", lat: 50, lon: 14 }, receiver, observedAt);
    const second = normalizeAircraft({ hex: "ABC123", flight: "TEST123", lat: 50, lon: 14.02 }, receiver, new Date(observedAt.getTime() + 1000));
    if (!first || !second) throw new Error("test aircraft could not be normalized");
    const enrichmentFor = (operator: string): AircraftEnrichment => ({ metadata: {
      registration: null, registrationCountry: null, registrationCountryCode: null, aircraftType: null,
      icaoTypeCode: null, aircraftDescription: null, operator, manufacturer: null, source: "test",
      retrievedAt: new Date().toISOString(),
    } });
    let releaseOld!: (value: AircraftEnrichment) => void;
    const oldResult = new Promise<AircraftEnrichment>((resolve) => { releaseOld = resolve; });
    const enrichment = {
      hasProviders: true,
      needsEnrichment: () => true,
      enrich: vi.fn((item: Aircraft) => item.lon === 14 ? oldResult : Promise.resolve(enrichmentFor("NEW"))),
    } as unknown as EnrichmentService;
    const service = new AircraftStateService(new MockReadsbProvider(receiver), enrichment, new AtcSectorService(new EmptyAtcSectorProvider()));
    const internal = service as unknown as { applySnapshot: (value: ProviderSnapshot) => void; enrichSnapshot: (value: ProviderSnapshot) => Promise<void> };
    const firstSnapshot: ProviderSnapshot = { aircraft: [first], receiver, fetchedAt: observedAt.toISOString(), provider: "test" };
    const secondSnapshot: ProviderSnapshot = { aircraft: [second], receiver, fetchedAt: new Date(observedAt.getTime() + 1000).toISOString(), provider: "test" };
    internal.applySnapshot(firstSnapshot);
    const staleEnrichment = internal.enrichSnapshot(firstSnapshot);
    internal.applySnapshot(secondSnapshot);
    await internal.enrichSnapshot(secondSnapshot);
    expect(service.getAircraft("ABC123")?.enrichment?.metadata?.operator).toBe("NEW");
    releaseOld(enrichmentFor("OLD"));
    await staleEnrichment;
    expect(service.getAircraft("ABC123")?.enrichment?.metadata?.operator).toBe("NEW");
  });

  it("counts unique aircraft once and resets daily maxima at midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T21:59:00Z"));
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const makeAircraft = (hex: string, lon: number) => {
      const value = normalizeAircraft({ hex, flight: hex, lat: 50, lon }, receiver, new Date());
      if (!value) throw new Error("test aircraft could not be normalized");
      return value;
    };
    const service = new AircraftStateService(new MockReadsbProvider(receiver), new EnrichmentService({}), new AtcSectorService(new EmptyAtcSectorProvider()));
    const apply = (aircraft: ReturnType<typeof makeAircraft>[]) => (service as unknown as { applySnapshot: (snapshot: ProviderSnapshot) => void }).applySnapshot({
      aircraft, receiver, fetchedAt: new Date().toISOString(), provider: "test",
    });

    apply([makeAircraft("AAA001", 14)]);
    apply([makeAircraft("AAA001", 14), makeAircraft("BBB002", 15)]);
    expect(service.getSnapshot().stats).toMatchObject({ aircraftSeenToday: 2, uniqueAircraftToday: 2, maxConcurrentAircraft: 2 });

    vi.setSystemTime(new Date("2026-07-01T22:01:00Z"));
    apply([makeAircraft("CCC003", 14.05)]);
    expect(service.getSnapshot().stats).toMatchObject({ aircraftSeenToday: 1, uniqueAircraftToday: 1, maxConcurrentAircraft: 1 });
    expect(service.getSnapshot().stats.maxDistanceKm).toBeLessThan(10);
    vi.useRealTimers();
  });

  it("removes ATC resolution keys only after a missing aircraft becomes stale", async () => {
    vi.useFakeTimers();
    vi.stubEnv("AIRCRAFT_STALE_AFTER_MS", "15000");
    const base = new Date("2026-09-22T09:00:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const aircraft = normalizeAircraft({ hex: "ABC123", flight: "TEST123", lat: 50, lon: 14 }, receiver, base);
    if (!aircraft) throw new Error("test aircraft could not be normalized");
    const provider: AircraftProvider = { name: "test", getSnapshot: async () => ({ aircraft: [], receiver, fetchedAt: new Date().toISOString(), provider: "test" }) };
    const service = new AircraftStateService(provider, new EnrichmentService({}), new AtcSectorService(new EmptyAtcSectorProvider()));
    const snapshot: ProviderSnapshot = { aircraft: [aircraft], receiver, fetchedAt: base.toISOString(), provider: "test" };
    const internal = service as unknown as { applySnapshot: (value: ProviderSnapshot) => void; resolveAtc: (value: ProviderSnapshot) => Promise<void>; atcResolutionKeys: Map<string, string> };
    internal.applySnapshot(snapshot);
    await internal.resolveAtc(snapshot);
    expect(internal.atcResolutionKeys.has("ABC123")).toBe(true);

    const shortGap = new Date(base.getTime() + 3_000);
    vi.setSystemTime(shortGap);
    internal.applySnapshot({ ...snapshot, aircraft: [], fetchedAt: shortGap.toISOString() });
    expect(internal.atcResolutionKeys.has("ABC123")).toBe(true);

    const expired = new Date(base.getTime() + 15_001);
    vi.setSystemTime(expired);
    internal.applySnapshot({ ...snapshot, aircraft: [], fetchedAt: expired.toISOString() });
    expect(internal.atcResolutionKeys.has("ABC123")).toBe(false);
  });

  it("does not let a slow ATC lookup overwrite a newer position result", async () => {
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const first = normalizeAircraft({ hex: "ABC123", flight: "TEST123", lat: 50, lon: 14 }, receiver);
    const second = normalizeAircraft({ hex: "ABC123", flight: "TEST123", lat: 50, lon: 14.02 }, receiver);
    if (!first || !second) throw new Error("test aircraft could not be normalized");
    let releaseFirst!: (match: AtcSectorMatch) => void;
    const firstLookup = new Promise<AtcSectorMatch>((resolve) => { releaseFirst = resolve; });
    const lookup = vi.fn(({ longitude }: { longitude: number }) => longitude < 14.01 ? firstLookup : Promise.resolve(atcMatch("NEW")));
    const service = new AircraftStateService(
      new MockReadsbProvider(receiver),
      new EnrichmentService({}),
      { lookup } as unknown as AtcSectorService,
    );
    const internal = service as unknown as { applySnapshot: (value: ProviderSnapshot) => void; resolveAtc: (value: ProviderSnapshot) => Promise<void> };
    const firstSnapshot: ProviderSnapshot = { aircraft: [first], receiver, fetchedAt: new Date().toISOString(), provider: "test" };
    const secondSnapshot: ProviderSnapshot = { aircraft: [second], receiver, fetchedAt: new Date().toISOString(), provider: "test" };
    internal.applySnapshot(firstSnapshot);
    const staleResolution = internal.resolveAtc(firstSnapshot);
    internal.applySnapshot(secondSnapshot);
    await internal.resolveAtc(secondSnapshot);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(service.getAircraft("ABC123")?.atc).toBeUndefined();
    releaseFirst(atcMatch("OLD"));
    await staleResolution;
    expect(service.getAircraft("ABC123")?.atc).toBeUndefined();
    await internal.resolveAtc(secondSnapshot);
    expect(service.getAircraft("ABC123")?.atc?.sectorId).toBe("NEW");
  });

  it("isolates the ATC lane without affecting local snapshots or subscribers", async () => {
    vi.stubEnv("AIRRADAR_ATC_RESOLUTION_ENABLED", "false");
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const aircraft = normalizeAircraft({ hex: "ABC123", flight: "TEST123", lat: 50, lon: 14 }, receiver);
    if (!aircraft) throw new Error("test aircraft could not be normalized");
    const lookup = vi.fn().mockResolvedValue(atcMatch("DISABLED"));
    const snapshot: ProviderSnapshot = { aircraft: [aircraft], receiver, fetchedAt: new Date().toISOString(), provider: "test" };
    const service = new AircraftStateService(
      { name: "test", getSnapshot: vi.fn(async () => snapshot) },
      new EnrichmentService({}),
      { lookup } as unknown as AtcSectorService,
    );
    services.push(service);
    const published: StateSnapshot[] = [];
    service.subscribe((value) => published.push(value));
    await service.waitForReady();

    expect(lookup).not.toHaveBeenCalled();
    expect(service.getAircraft("ABC123")).toMatchObject({ icaoHex: "ABC123" });
    expect(service.getAircraft("ABC123")?.atc).toBeUndefined();
    expect(published.at(-1)?.aircraft).toHaveLength(1);
  });

  it("keeps ATC assignment enabled when shadow prediction is explicitly disabled", async () => {
    vi.stubEnv("AIRRADAR_ATC_RESOLUTION_ENABLED", "true");
    vi.stubEnv("AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED", "false");
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const aircraft = normalizeAircraft({ hex: "ABC123", flight: "TEST123", lat: 50, lon: 14 }, receiver);
    if (!aircraft) throw new Error("test aircraft could not be normalized");
    const lookup = vi.fn().mockResolvedValue(atcMatch("ASSIGNED"));
    const service = new AircraftStateService(new MockReadsbProvider(receiver), new EnrichmentService({}), { lookup } as unknown as AtcSectorService);
    const internal = service as unknown as {
      applySnapshot: (value: ProviderSnapshot) => void;
      resolveAtc: (value: ProviderSnapshot) => Promise<void>;
      pendingAtcShadowPredictions: Map<string, unknown>;
    };
    const snapshot: ProviderSnapshot = { aircraft: [aircraft], receiver, fetchedAt: aircraft.lastSeen, provider: "test" };
    internal.applySnapshot(snapshot);
    await internal.resolveAtc(snapshot);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(service.getAircraft("ABC123")?.atc?.sectorId).toBe("ASSIGNED");
    expect(internal.pendingAtcShadowPredictions.size).toBe(0);
  });

  it("bounds 100 shadow predictions, keeps latest work per ICAO, and contains provider errors", async () => {
    vi.stubEnv("AIRRADAR_ATC_RESOLUTION_ENABLED", "true");
    vi.stubEnv("AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED", "true");
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const now = Date.now();
    const aircraft = Array.from({ length: 100 }, (_, index) => normalizeAircraft({
      hex: index.toString(16).padStart(6, "0"), flight: `TEST${index}`, lat: 50 + index / 1000, lon: 14 + index / 1000,
    }, receiver, new Date(now + index)))
      .filter((value): value is Aircraft => value !== null);
    const service = new AircraftStateService(new MockReadsbProvider(receiver), new EnrichmentService({}), new AtcSectorService(new EmptyAtcSectorProvider()));
    const internal = service as unknown as {
      applySnapshot: (value: ProviderSnapshot) => void;
      enqueueShadowPrediction: (aircraft: Aircraft, currentSector: string | null, resolutionKey: string) => void;
      runShadowPrediction: (work: { aircraft: Aircraft }) => Promise<void>;
      atcShadowPredictionRunning: number;
      pendingAtcShadowPredictions: Map<string, unknown>;
    };
    internal.applySnapshot({ aircraft, receiver, fetchedAt: new Date(now).toISOString(), provider: "test" });
    let active = 0;
    let maximum = 0;
    const completed: string[] = [];
    internal.runShadowPrediction = vi.fn(async (work: { aircraft: Aircraft }) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      completed.push(work.aircraft.icaoHex);
      active -= 1;
    });
    for (const item of aircraft) internal.enqueueShadowPrediction(item, "SECTOR", "resolution");
    const moved = { ...aircraft[0]!, lastSeen: new Date(now + 10_000).toISOString(), lon: 14.9 };
    internal.applySnapshot({ aircraft: [moved], receiver, fetchedAt: moved.lastSeen, provider: "test" });
    internal.enqueueShadowPrediction(moved, "SECTOR", "resolution");
    expect(internal.pendingAtcShadowPredictions.size).toBeLessThanOrEqual(100);
    await vi.waitFor(() => expect(internal.atcShadowPredictionRunning).toBe(0));
    expect(maximum).toBeLessThanOrEqual(2);
    expect(completed.at(-1)).toBe(moved.icaoHex);
  });

  it("retries ATC after a transient lookup failure", async () => {
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const aircraft = normalizeAircraft({ hex: "ABC123", flight: "TEST123", lat: 50, lon: 14 }, receiver);
    if (!aircraft) throw new Error("test aircraft could not be normalized");
    const lookup = vi.fn()
      .mockRejectedValueOnce(new Error("database offline"))
      .mockResolvedValueOnce(atcMatch("RETRY"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const service = new AircraftStateService(
      new MockReadsbProvider(receiver),
      new EnrichmentService({}),
      { lookup } as unknown as AtcSectorService,
    );
    const internal = service as unknown as { applySnapshot: (value: ProviderSnapshot) => void; resolveAtc: (value: ProviderSnapshot) => Promise<void>; atcResolutionKeys: Map<string, string> };
    const snapshot: ProviderSnapshot = { aircraft: [aircraft], receiver, fetchedAt: new Date().toISOString(), provider: "test" };
    internal.applySnapshot(snapshot);
    await internal.resolveAtc(snapshot);
    expect(internal.atcResolutionKeys.has("ABC123")).toBe(false);
    await internal.resolveAtc(snapshot);
    expect(service.getAircraft("ABC123")?.atc?.sectorId).toBe("RETRY");
    expect(lookup).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("polls network coverage on its own timer while local polling is in backoff", async () => {
    vi.useFakeTimers();
    vi.stubEnv("READSB_POLL_INTERVAL_MS", "30000");
    const base = new Date("2026-09-09T16:00:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const localGetSnapshot = vi.fn(async () => { throw new Error("readsb offline"); });
    const localProvider: AircraftProvider = { name: "readsb", getSnapshot: localGetSnapshot };
    const networkAircraft = normalizeAircraft({ hex: "DEF456", flight: "NETWORK456", lat: 50.2, lon: 14.2, seen: 0, seen_pos: 0 }, receiver, base);
    if (!networkAircraft) throw new Error("test aircraft could not be normalized");
    const networkObservation = { ...networkAircraft, origin: "adsblol" as const };
    const networkGetSnapshot = vi.fn(async () => ({ aircraft: [networkObservation], fetchedAt: base.toISOString(), provider: "adsb.lol" }));
    const diagnostics = {
      enabled: true,
      status: "online" as const,
      lastAttemptAt: base.toISOString(),
      lastSuccessAt: base.toISOString(),
      latencyMs: 1,
      consecutiveFailures: 0,
      aircraftCount: 1,
      positionedAircraftCount: 1,
      mlatAircraftCount: 0,
      radiusNm: 250,
      pollIntervalMs: 10_000,
      retryAfterMs: null,
    };
    const networkProvider: NetworkAircraftProvider = {
      name: "adsb.lol",
      start: vi.fn(),
      getSnapshot: networkGetSnapshot,
      getDiagnostics: () => diagnostics,
      getNextPollDelayMs: () => 10_000,
      stop: vi.fn(async () => undefined),
    };
    const service = new AircraftStateService(
      localProvider,
      new EnrichmentService({}),
      new AtcSectorService(new EmptyAtcSectorProvider()),
      undefined,
      undefined,
      networkProvider,
    );
    services.push(service);

    await service.waitForReady();
    expect(localGetSnapshot).toHaveBeenCalledTimes(1);
    expect(networkGetSnapshot).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20_000);

    expect(localGetSnapshot).toHaveBeenCalledTimes(1);
    expect(networkGetSnapshot).toHaveBeenCalledTimes(3);
    expect(service.getSnapshot({ coverage: "extended" }).aircraft.map((item) => item.icaoHex)).toContain("DEF456");
  });

  it("keeps local polling running when the network provider fails", async () => {
    vi.useFakeTimers();
    vi.stubEnv("READSB_POLL_INTERVAL_MS", "3000");
    const base = new Date("2026-09-09T16:00:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const localAircraft = normalizeAircraft({ hex: "ABC123", flight: "LOCAL123", lat: 50.1, lon: 14.1, seen: 0, seen_pos: 0 }, receiver, base);
    if (!localAircraft) throw new Error("test aircraft could not be normalized");
    const localGetSnapshot = vi.fn(async () => ({ aircraft: [localAircraft], receiver, fetchedAt: new Date().toISOString(), provider: "readsb" }));
    const networkGetSnapshot = vi.fn(async () => { throw new Error("ADSB.lol offline"); });
    const networkProvider: NetworkAircraftProvider = {
      name: "adsb.lol",
      start: vi.fn(),
      getSnapshot: networkGetSnapshot,
      getDiagnostics: () => ({
        enabled: true,
        status: "http_error" as const,
        lastAttemptAt: null,
        lastSuccessAt: null,
        latencyMs: null,
        consecutiveFailures: 1,
        aircraftCount: 0,
        positionedAircraftCount: 0,
        mlatAircraftCount: 0,
        radiusNm: 250,
        pollIntervalMs: 10_000,
        retryAfterMs: null,
      }),
      getNextPollDelayMs: () => 10_000,
      stop: vi.fn(async () => undefined),
    };
    const service = new AircraftStateService(
      { name: "readsb", getSnapshot: localGetSnapshot },
      new EnrichmentService({}),
      new AtcSectorService(new EmptyAtcSectorProvider()),
      undefined,
      undefined,
      networkProvider,
    );
    services.push(service);

    await service.waitForReady();
    await vi.advanceTimersByTimeAsync(9_000);

    expect(localGetSnapshot.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(networkGetSnapshot).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().aircraft.map((item) => item.icaoHex)).toEqual(["ABC123"]);
  });

  it("stops both polling loops and prevents post-shutdown publishing", async () => {
    vi.useFakeTimers();
    const base = new Date("2026-09-09T16:00:00.000Z");
    vi.setSystemTime(base);
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const aircraft = normalizeAircraft({ hex: "ABC123", flight: "TEST123", lat: 50, lon: 14, seen: 0, seen_pos: 0 }, receiver, base);
    if (!aircraft) throw new Error("test aircraft could not be normalized");
    const localGetSnapshot = vi.fn(async () => ({ aircraft: [aircraft], receiver, fetchedAt: new Date().toISOString(), provider: "readsb" }));
    const networkGetSnapshot = vi.fn(async () => ({ aircraft: [], fetchedAt: new Date().toISOString(), provider: "adsb.lol" }));
    const networkStop = vi.fn(async () => undefined);
    const networkProvider: NetworkAircraftProvider = {
      name: "adsb.lol",
      start: vi.fn(),
      getSnapshot: networkGetSnapshot,
      getDiagnostics: () => ({
        enabled: true,
        status: "online" as const,
        lastAttemptAt: null,
        lastSuccessAt: null,
        latencyMs: null,
        consecutiveFailures: 0,
        aircraftCount: 0,
        positionedAircraftCount: 0,
        mlatAircraftCount: 0,
        radiusNm: 250,
        pollIntervalMs: 1000,
        retryAfterMs: null,
      }),
      getNextPollDelayMs: () => 1000,
      stop: networkStop,
    };
    const service = new AircraftStateService(
      { name: "readsb", getSnapshot: localGetSnapshot },
      new EnrichmentService({}),
      new AtcSectorService(new EmptyAtcSectorProvider()),
      undefined,
      undefined,
      networkProvider,
    );
    services.push(service);
    let notifications = 0;
    service.subscribe(() => { notifications += 1; });
    await service.waitForReady();
    const notificationsAtStop = notifications;
    const localCallsAtStop = localGetSnapshot.mock.calls.length;
    const networkCallsAtStop = networkGetSnapshot.mock.calls.length;

    await service.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(localGetSnapshot.mock.calls.length).toBe(localCallsAtStop);
    expect(networkGetSnapshot.mock.calls.length).toBe(networkCallsAtStop);
    expect(notifications).toBe(notificationsAtStop);
    expect(networkStop).toHaveBeenCalledOnce();
  });
});
