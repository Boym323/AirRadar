import { describe, expect, it, vi } from "vitest";
import { parseOgnPosition } from "@/lib/ogn/aprs-parser";
import { OgnDdb } from "@/lib/ogn/ddb";
import type { OgnConfig } from "@/lib/server/config";
import { OgnStateService } from "@/lib/server/ogn-state";
import { OGN_FIXTURES } from "@/tests/fixtures/ogn-packets";

const receiver = { lat: 50.0755, lon: 14.4378, name: "Test receiver" };
const fixtureNow = Date.parse("2026-09-10T11:49:00.000Z");
const config: OgnConfig = {
  enabled: true,
  host: "aprs.glidernet.org",
  port: 14580,
  radiusKm: 250,
  connectTimeoutMs: 1_000,
  handshakeTimeoutMs: 1_000,
  keepaliveMs: 240_000,
  staleAfterMs: 15_000,
  removeAfterMs: 60_000,
  maxPacketAgeMs: 120_000,
  reconnectMinMs: 1_000,
  reconnectMaxMs: 2_000,
  ddbRefreshMs: 60_000,
  ddbMaxStaleMs: 86_400_000,
  ddbUrl: "https://ddb.glidernet.org/download/?j=1&t=1",
  maxTargets: 5_000,
  configurationError: null,
};

function diagnosticProvider() {
  return {
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    getDiagnostics: vi.fn(() => ({
      enabled: true, status: "online" as const, host: config.host, port: config.port, radiusKm: config.radiusKm,
      connectedAt: null, lastActivityAt: null, lastPacketAt: null, lastAircraftPacketAt: null, loginAcknowledged: true,
      packets: 0, positionPackets: 0, canonicalPositionUpdates: 0, duplicatePackets: 0, malformed: 0, droppedAdsb: 0,
      droppedGroundStatus: 0, droppedStatus: 0, droppedDelayed: 0, droppedPrivacy: 0, droppedStale: 0, droppedCapacity: 0,
      unknownTocall: 0, sourceCounts: {}, unknownTocalls: [], activeTargets: 0, freshTargets: 0, staleTargets: 0,
      ddb: {
        status: "disabled" as const, mode: null, endpoint: "https://ddb.glidernet.org/download/", entries: 0,
        lastAttemptAt: null, lastRefreshAt: null, lastSuccessAt: null, lastHttpStatus: null, ageMs: null,
        failures: 0, fallbackCount: 0, fallbackUsed: false, rateLimited: false, retryAfterMs: null, nextRetryAt: null,
        aircraftTypeAvailable: false, stale: true,
      },
      reconnects: 0, configurationError: null,
    })),
  };
}

async function ddbWith(entry: Record<string, unknown>) {
  const ddb = new OgnDdb({ fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ devices: [entry] }))) as unknown as typeof fetch, refreshMs: 60_000 });
  await ddb.refresh();
  return ddb;
}

function position(at = "2026-09-10T11:49:00.000Z") {
  const parsed = parseOgnPosition(OGN_FIXTURES.ognTracker, { now: new Date(at) });
  return { ...parsed.position, receivedAt: at };
}

const ddbEntry = { device_type: "F", device_id: "8E20F0", aircraft_model: "ASW 20", registration: "OK-TEST", cn: "42", tracked: "Y", identified: "Y", aircraft_type: 1 };

describe("OGN state service", () => {
  it("holds targets outside ADS-B state, deduplicates by address type/address, and does not roll back", async () => {
    const ddb = await ddbWith(ddbEntry);
    const service = new OgnStateService({ config, ddb, receiver, now: () => fixtureNow, provider: diagnosticProvider() as never });
    const first = position();
    service.ingest(first);
    service.ingest({ ...first, latitude: 49, lastReceiver: "OTHER" });
    service.ingest({ ...first, observedAt: "2026-09-10T11:48:00.000Z", latitude: 49, lastReceiver: "OLDER" });

    const snapshot = service.getSnapshot();
    expect(snapshot.targets).toHaveLength(1);
    expect(snapshot.targets[0]).toMatchObject({ address: "8E20F0", latitude: first.latitude, registration: "OK-TEST", lastReceiver: "OTHER" });
    expect(service.getDiagnostics()).toMatchObject({ canonicalPositionUpdates: 1, duplicatePackets: 2, activeTargets: 1, freshTargets: 1 });
  });

  it("fails closed before DDB availability and re-applies privacy after an atomic refresh", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ devices: [ddbEntry] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ devices: [{ ...ddbEntry, identified: "N" }] })));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch, refreshMs: 60_000 });
    const service = new OgnStateService({ config, ddb, receiver, now: () => fixtureNow, provider: diagnosticProvider() as never });
    service.ingest(position());
    expect(service.getSnapshot().targets).toEqual([]);

    await ddb.refresh();
    expect(service.getSnapshot().targets).toHaveLength(1);
    await ddb.refresh();
    expect(service.getSnapshot().targets[0]).toMatchObject({ identityVisible: false, address: null, registration: null, senderCallsign: null, lastReceiver: null });
  });

  it("expires RAM targets without persisting them", async () => {
    let clock = Date.parse("2026-09-10T11:49:00.000Z");
    const ddb = await ddbWith(ddbEntry);
    const service = new OgnStateService({ config, ddb, receiver, now: () => clock, provider: diagnosticProvider() as never });
    service.ingest(position(new Date(clock).toISOString()));
    expect(service.getSnapshot().targets).toHaveLength(1);
    clock += config.removeAfterMs + 1;
    (service as unknown as { removeExpired: () => void }).removeExpired();
    expect(service.getSnapshot().targets).toEqual([]);
    expect(service.getDiagnostics().droppedStale).toBe(1);
  });

  it("hard-bounds positions and targets while keeping updates for an existing key", async () => {
    const ddb = await ddbWith(ddbEntry);
    const boundedConfig = { ...config, maxTargets: 3 };
    const service = new OgnStateService({ config: boundedConfig, ddb, receiver, provider: diagnosticProvider() as never });
    const base = position();
    for (let index = 0; index < 10; index += 1) {
      const address = index.toString(16).padStart(6, "0").toUpperCase();
      service.ingest({
        ...base,
        id: { ...base.id, address },
        observedAt: new Date(Date.parse(base.observedAt) + index * 1_000).toISOString(),
        receivedAt: new Date(Date.parse(base.receivedAt) + index * 1_000).toISOString(),
      });
    }
    const internals = service as unknown as { positions: Map<string, unknown>; targets: Map<string, unknown> };
    expect(internals.positions.size).toBeLessThanOrEqual(3);
    expect(internals.targets.size).toBeLessThanOrEqual(3);

    const before = internals.targets.size;
    const existingKey = [...internals.targets.keys()][0];
    const existingAddress = existingKey.split(":")[1];
    const existing = { ...base, id: { ...base.id, address: existingAddress }, latitude: 48.5, observedAt: "2026-09-10T11:50:00.000Z", receivedAt: "2026-09-10T11:50:00.000Z" };
    service.ingest(existing);
    expect(internals.targets.size).toBe(before);
    expect((internals.positions.get(existingKey) as { latitude: number }).latitude).toBe(48.5);
  });

  it("keeps reapplyPrivacy within the target cap after DDB recovery", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ devices: [ddbEntry] })));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch, refreshMs: 60_000 });
    const boundedConfig = { ...config, maxTargets: 3 };
    const service = new OgnStateService({ config: boundedConfig, ddb, receiver, provider: diagnosticProvider() as never });
    const base = position();
    for (let index = 0; index < 10; index += 1) {
      service.ingest({ ...base, id: { ...base.id, address: index.toString(16).padStart(6, "0").toUpperCase() }, observedAt: new Date(Date.parse(base.observedAt) + index * 1_000).toISOString(), receivedAt: new Date(Date.parse(base.receivedAt) + index * 1_000).toISOString() });
    }
    await ddb.refresh();
    const internals = service as unknown as { positions: Map<string, unknown>; targets: Map<string, unknown> };
    expect(internals.positions.size).toBeLessThanOrEqual(3);
    expect(internals.targets.size).toBeLessThanOrEqual(3);
  });

  it("uses the exact stale and removal boundaries", async () => {
    let clock = Date.parse("2026-09-10T11:49:00.000Z");
    const ddb = await ddbWith(ddbEntry);
    const service = new OgnStateService({ config, ddb, receiver, now: () => clock, provider: diagnosticProvider() as never });
    service.ingest(position(new Date(clock).toISOString()));

    clock += 14_999;
    expect(service.getSnapshot().targets[0].stale).toBe(false);
    clock += 1;
    expect(service.getSnapshot().targets[0].stale).toBe(true);
    clock = Date.parse("2026-09-10T11:49:00.000Z") + 60_000;
    expect(service.getSnapshot().targets[0].stale).toBe(true);
    clock += 1;
    (service as unknown as { removeExpired: () => void }).removeExpired();
    expect(service.getSnapshot().targets).toEqual([]);
  });
});
