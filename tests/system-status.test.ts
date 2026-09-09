import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { StateSnapshot } from "@/lib/aircraft/types";
import type { AtcDataResponse } from "@/lib/atc/types";
import { getTranslations } from "@/lib/i18n";
import { buildSystemStatus } from "@/lib/server/system-status";

const checkedAt = new Date("2026-09-08T12:00:00.000Z");
const systemSource = readFileSync(new URL("../lib/server/system-status.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../components/system-status-page.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function snapshot(readsbOnline = true, provider = "readsb"): StateSnapshot {
  return {
    aircraft: [{
      icaoHex: "ABC123", callsign: "TEST123", registration: null, aircraftType: "A320", aircraftDescription: null,
      lat: 50.1, lon: 14.4, altitude: 30_000, baroAltitude: 30_000, geomAltitude: null,
      groundSpeed: 400, track: 90, verticalRate: 0, baroRate: 0, geomRate: null, squawk: null,
      category: null, emergency: null, rssi: null, messages: 100, seenSeconds: 0, seenPosSeconds: 0,
      lastSeen: checkedAt.toISOString(), source: "ADS-B", sourceType: "adsb_icao", onGround: false,
      distanceKm: 15, bearing: 90, trail: [],
    }],
    relevantAtcFrequencies: [],
    receiver: { lat: 50.1, lon: 14.4, name: "Private receiver" },
    fetchedAt: checkedAt.toISOString(),
    provider,
    sourceOnline: readsbOnline,
    lastSourceUpdate: readsbOnline ? checkedAt.toISOString() : null,
    sourceError: readsbOnline ? null : "postgresql://secret:password@internal",
    readsbOnline,
    lastReadsbUpdate: readsbOnline ? checkedAt.toISOString() : null,
    lastError: readsbOnline ? null : "DATABASE_URL=secret",
    stats: {
      currentAircraft: 1, aircraftSeenToday: 12, uniqueAircraftToday: 12,
      maxConcurrentAircraft: 4, maxDistanceKm: 150.5, aircraftTypes: [], airlines: [], messagesPerSecond: 486.2,
    },
  };
}

function statistics() {
  return {
    date: "2026-09-08",
    timezone: "Europe/Prague",
    live: { aircraftCount: 1, messagesPerSecond: 486.2 },
    daily: { uniqueAircraft: 12, maxConcurrentAircraft: 4, maxDistanceKm: 150.5 },
    coverage: Array.from({ length: 36 }, (_, index) => ({ bearingFrom: index * 10, bearingTo: index * 10 + 10, maxDistanceKm: index === 2 ? 150.5 : 0 })),
    coverageSummary: { maxDistanceKm: 150.5, maxBearing: 24, populatedBuckets: 1, averageDistanceKm: 150.5, bestDirections: [{ bearingFrom: 20, bearingTo: 30, maxDistanceKm: 150.5 }] },
    topAircraftTypes: [],
    topAirlines: [],
  };
}

const atc: AtcDataResponse = {
  sectors: [],
  transmitters: [],
  metadata: {
    status: "configured", source: "AIM eAIP", sourceReference: "https://example.invalid/source",
    effectiveDate: "2026-09-01T00:00:00.000Z", lastVerifiedAt: checkedAt.toISOString(), sectorCount: 42, transmitterCount: 0,
  },
};

function build(overrides: Partial<Parameters<typeof buildSystemStatus>[0]> = {}) {
  return buildSystemStatus({
    snapshot: snapshot(),
    statistics: statistics(),
    database: { status: "ok", connected: true },
    history: { lastSuccessfulWriteAt: checkedAt.toISOString(), failureCount: 0 },
    statisticsPersistence: { status: "ok", lastSuccessfulWriteAt: checkedAt.toISOString(), failureCount: 0 },
    atc,
    alerts: { status: "ok", enabled: true, notifier: "noop", ruleCount: 2 },
    airportData: { rowCount: 5886, fallbackRowCount: 6 },
    weather: { entries: 2, airports: 1 },
    now: checkedAt,
    runtime: { version: "0.1.0", commit: "abcdef1234567", channel: "development", uptimeSeconds: 120, startedAt: "2026-09-08T11:58:00.000Z" },
    ...overrides,
  });
}

describe("SYSTEM / RECEIVER STATUS V1", () => {
  it("builds a healthy bounded status DTO from current runtime data", () => {
    const value = build();
    expect(value.status).toBe("ok");
    expect(value.application.status).toBe("ok");
    expect(value.application).toMatchObject({ name: "AirRadar", channel: "development" });
    expect(value.receiver.readsb).toMatchObject({ status: "ok", online: true, aircraftCount: 1, messagesPerSecond: 486.2 });
    expect(value.database).toMatchObject({ status: "ok", connected: true });
    expect(value.statistics).toMatchObject({ uniqueAircraftToday: 12, maxConcurrentToday: 4, coverageBucketCount: 36, coverageBucketsWithData: 1 });
    expect(value.atc).toMatchObject({ status: "ok", configured: true, freshness: "current", sectorCount: 42 });
    expect(value.weather).toMatchObject({ enabled: true, cache: { status: "warm", entries: 2 } });
    expect(value.alerts).toMatchObject({ status: "ok", enabled: true, ruleCount: 2 });
    expect(value.airportData).toMatchObject({ source: "database", rowCount: 5886, bounded: true });
    expect(value.dataSources).toMatchObject({
      adsbdb: { status: "disabled", enabled: false, provider: "ADSBDB enrichment" },
      aircraftPhotos: { status: "disabled", enabled: false, provider: "Planespotters photos" },
      ourAirports: { status: "ok", enabled: true, provider: "OurAirports / bundled catalog" },
    });
    expect(value.runtime).toMatchObject({ sseClientLimit: 128, activeSseClients: 0 });
    expect(value.runtime.processRssBytes).toBeGreaterThan(0);
  });

  it("reports readsb offline without exposing its provider error", () => {
    const value = build({ snapshot: snapshot(false) });
    expect(value.status).toBe("degraded");
    expect(value.receiver.status).toBe("offline");
    expect(value.receiver.readsb.status).toBe("offline");
    expect(value.receiver.readsb.lastSnapshot).toBeNull();
    expect(JSON.stringify(value)).not.toContain("postgresql://");
  });

  it("reports database unavailable while keeping the live status shape", () => {
    const value = build({ database: { status: "offline", connected: false }, airportData: { rowCount: null, fallbackRowCount: 6 } });
    expect(value.database).toMatchObject({ status: "offline", connected: false });
    expect(value.database.history.status).toBe("offline");
    expect(value.database.statistics.status).toBe("offline");
    expect(value.airportData).toMatchObject({ source: "fallback", fallbackRowCount: 6 });
  });

  it("keeps disabled alerts and ATC disabled as explicit safe states", () => {
    const value = build({
      alerts: { status: "disabled", enabled: false, notifier: "noop", ruleCount: 0 },
      atc: { ...atc, metadata: { ...atc.metadata, status: "empty", sectorCount: 0, source: null, effectiveDate: null, lastVerifiedAt: null } },
      database: { status: "disabled", connected: false },
    });
    expect(value.alerts).toMatchObject({ status: "disabled", enabled: false, ruleCount: 0 });
    expect(value.atc).toMatchObject({ status: "disabled", configured: false, freshness: "disabled" });
  });

  it("does not expose coordinates, secrets, raw errors, or arbitrary paths", () => {
    const value = build({ runtime: { commit: "postgresql://user:password@db", version: "DATABASE_URL=secret" } });
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain("50.1");
    expect(serialized).not.toContain("14.4");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("postgresql://");
    expect(value.application.commit).toBeNull();
  });

  it("keeps airport status queries explicitly bounded", () => {
    const value = build({ airportData: { rowCount: 10_000, fallbackRowCount: 6, rowCountIsLowerBound: true } });
    expect(value.airportData).toMatchObject({ bounded: true, rowCount: 10_000, rowCountIsLowerBound: true });
    expect(systemSource).toContain("AIRPORT_STATUS_QUERY_LIMIT + 1");
    expect(systemSource).toContain('.select("id")');
  });

  it("does not make weather or eAIP requests from the status path", () => {
    expect(systemSource).not.toContain("fetch(");
    expect(systemSource).not.toContain("fetchOfficialCzEaip");
    expect(systemSource).not.toContain("atc-sync");
    expect(pageSource).not.toContain("EventSource");
    expect(pageSource).not.toContain("setInterval(");
  });

  it("has complete Czech and English labels and a mobile layout", () => {
    expect(getTranslations("cs").system.pageTitle).toBe("Stav systému");
    expect(getTranslations("en").system.pageTitle).toBe("System status");
    expect(pageSource).toContain('fetch("/api/system/status"');
    expect(pageSource).toContain("data.application.name");
    expect(stylesSource).toContain(".system-grid { display: grid; grid-template-columns: repeat(2");
    expect(stylesSource).toContain(".system-grid { grid-template-columns: 1fr;");
  });
});
