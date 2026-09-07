import { afterEach, describe, expect, it, vi } from "vitest";
import { MockReadsbProvider } from "@/lib/server/mock-readsb-provider";
import { AircraftStateService } from "@/lib/server/aircraft-state";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import type { Aircraft, AircraftEnrichment, ProviderSnapshot } from "@/lib/aircraft/types";
import { EnrichmentService } from "@/lib/server/enrichment-cache";
import { AtcSectorService, EmptyAtcSectorProvider } from "@/lib/server/atc-sector-service";
import type { AircraftProvider } from "@/lib/server/provider";
import type { AtcSector, AtcSectorMatch } from "@/lib/atc/types";
import { recordAircraftSnapshot } from "@/lib/server/history";

vi.mock("@/lib/server/history", () => ({
  recordAircraftSnapshot: vi.fn().mockResolvedValue(undefined),
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

  it("keeps trails in server memory but omits them from live wire snapshots", async () => {
    const service = new AircraftStateService(new MockReadsbProvider({ lat: 50, lon: 14, name: "Test" }));
    services.push(service);
    await service.waitForReady();
    const compact = service.getSnapshot();
    const full = service.getSnapshot({ includeTrails: true });

    expect(compact.aircraft[0].trail).toBeUndefined();
    expect(full.aircraft[0].trail).toHaveLength(1);
    expect(service.getAircraft(full.aircraft[0].icaoHex)?.trail).toHaveLength(1);
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

  it("removes ATC resolution keys when an aircraft disappears", async () => {
    const receiver = { lat: 50, lon: 14, name: "Test" };
    const aircraft = normalizeAircraft({ hex: "ABC123", flight: "TEST123", lat: 50, lon: 14 }, receiver);
    if (!aircraft) throw new Error("test aircraft could not be normalized");
    const provider: AircraftProvider = { name: "test", getSnapshot: async () => ({ aircraft: [], receiver, fetchedAt: new Date().toISOString(), provider: "test" }) };
    const service = new AircraftStateService(provider, new EnrichmentService({}), new AtcSectorService(new EmptyAtcSectorProvider()));
    const snapshot: ProviderSnapshot = { aircraft: [aircraft], receiver, fetchedAt: new Date().toISOString(), provider: "test" };
    const internal = service as unknown as { applySnapshot: (value: ProviderSnapshot) => void; resolveAtc: (value: ProviderSnapshot) => Promise<void>; atcResolutionKeys: Map<string, string> };
    internal.applySnapshot(snapshot);
    await internal.resolveAtc(snapshot);
    expect(internal.atcResolutionKeys.has("ABC123")).toBe(true);
    internal.applySnapshot({ ...snapshot, aircraft: [] });
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
    expect(service.getAircraft("ABC123")?.atc?.sectorId).toBe("NEW");
    releaseFirst(atcMatch("OLD"));
    await staleResolution;
    expect(service.getAircraft("ABC123")?.atc?.sectorId).toBe("NEW");
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
});
