import { execFileSync } from "node:child_process";
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Pool } from "pg";
import { Temporal } from "temporal-polyfill";
import type { Aircraft } from "@/lib/aircraft/types";
import {
  classifyWeatherDbError,
  getAircraftWeatherDiagnostics,
  persistAircraftWeatherObservations,
  resetAircraftWeatherDiagnostics,
  weatherObservationToInsertRow,
  observationFromAircraft,
} from "@/lib/server/aircraft-weather";
import { getPrisma } from "@/lib/server/db";
import { getDbOperationDiagnostics, resetDbOperationDiagnosticsForTests } from "@/lib/server/db-operation-diagnostics";

const url = process.env.DATABASE_URL?.trim() ?? "";
const safety = process.env.AIRRADAR_ALLOW_DESTRUCTIVE_TEST_DB === "true";
const enabled = safety && /(?:^|[_-])test(?:[_-]|$)/i.test(new URL(url).pathname.split("/").pop() ?? "") && Boolean(url);
const describeIfSafe = enabled ? describe : describe.skip;

function aircraft(hex: string, overrides: Partial<Aircraft> = {}): Aircraft {
  const at = new Date("2026-09-29T19:00:00.000Z");
  const timestamp = at.toISOString();
  return {
    icaoHex: hex, callsign: `T${hex}`, registration: null, aircraftType: null, aircraftDescription: null,
    lat: 50, lon: 14, altitude: 10_000, baroAltitude: 10_000, geomAltitude: null,
    groundSpeed: 250, track: 90, verticalRate: 0, baroRate: 0, geomRate: null,
    squawk: null, category: null, emergency: null, rssi: null, messages: 1,
    seenSeconds: 0, seenPosSeconds: 0, lastSeen: timestamp, source: "ADS-B", origin: "local",
    sourceType: "adsb", onGround: false, distanceKm: 1, bearing: 0, trail: [],
    adsbTelemetry: { iasKt: null, tasKt: 400, mach: null, windDirectionDeg: 350, windSpeedKt: 40, outsideAirTemperatureC: -40, totalAirTemperatureC: -30, staticPressureHpa: 250, humidityPct: 40, turbulenceLevel: 1, navQnhHpa: 1013, selectedAltitudeMcpFt: null, selectedAltitudeFmsFt: null, selectedHeadingDeg: null, navModes: [], nic: null, containmentRadiusM: null, nacP: null, nacV: null, sil: null, silType: null, gva: null, sda: null, adsbVersion: null, alert: null, spi: null, dbFlags: null },
    provenance: { seenLocal: true, seenNetwork: false, lastLocalSeen: timestamp, lastNetworkSeen: null, positionOrigin: "local", positionSource: "ADS-B", fields: {
      windDirectionDeg: { origin: "local", protocol: "readsb-json", observedAt: timestamp, confidence: "high" },
      windSpeedKt: { origin: "local", protocol: "readsb-json", observedAt: timestamp, confidence: "high" },
      outsideAirTemperatureC: { origin: "local", protocol: "readsb-json", observedAt: timestamp, confidence: "high" },
      totalAirTemperatureC: { origin: "local", protocol: "readsb-json", observedAt: timestamp, confidence: "high" },
      staticPressureHpa: { origin: "local", protocol: "readsb-json", observedAt: timestamp, confidence: "high" },
      humidityPct: { origin: "local", protocol: "readsb-json", observedAt: timestamp, confidence: "high" },
      turbulenceLevel: { origin: "local", protocol: "readsb-json", observedAt: timestamp, confidence: "high" },
    } },
    observationTimes: { altitude: at.getTime(), baroAltitude: at.getTime(), geomAltitude: null, groundSpeed: at.getTime(), track: at.getTime(), verticalRate: at.getTime(), position: at.getTime(), extendedTelemetry: at.getTime(), signal: at.getTime() },
    ...overrides,
  };
}

function observations(hexes: string[]): Aircraft[] { return hexes.map((hex) => aircraft(hex)); }

describeIfSafe("real PostgreSQL weather batch gate", () => {
  const db = enabled ? getPrisma() : null;
  const pool = new Pool({ connectionString: url });
  pool.on("error", () => undefined);
  const table = db ? (db.sql.public as unknown as { aircraftWeatherObservation: { insert(rows: unknown[]): { build(): unknown } } }).aircraftWeatherObservation : null;

  async function truncate(): Promise<void> { await pool.query('TRUNCATE TABLE "aircraftWeatherObservation" RESTART IDENTITY CASCADE'); resetAircraftWeatherDiagnostics(); resetDbOperationDiagnosticsForTests(); }
  async function count(): Promise<number> { return Number((await pool.query('SELECT count(*)::int AS count FROM "aircraftWeatherObservation"')).rows[0].count); }
  async function executeRows(rows: ReturnType<typeof weatherObservationToInsertRow>[]): Promise<void> { if (!db || !table) throw new Error("isolated test database is not configured"); await (await db.runtime()).execute(table.insert(rows).build() as never); }
  function row(hex: string, suffix = ""): ReturnType<typeof weatherObservationToInsertRow> {
    const observation = observationFromAircraft(aircraft(hex), new Date("2026-09-29T19:00:00.000Z"))!;
    observation.provider = "local";
    observation.dedupKey = `${hex}-${suffix || "base"}`;
    return weatherObservationToInsertRow(observation);
  }

  beforeAll(async () => {
    expect(url).not.toMatch(/192\.168\.1\.55|\/airradar(?:\?|$)/i);
    expect(new URL(url).pathname).toMatch(/_test_/i);
    const metadata = await pool.query(`SELECT n.nspname AS schema_name, c.relname AS table_name, i.relname AS index_name, a.attname AS column_name, con.conname AS constraint_name, con.contype AS constraint_type, NOT a.attnotnull AS nullable FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_index ix ON ix.indrelid = c.oid JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey) LEFT JOIN pg_constraint con ON con.conindid = ix.indexrelid WHERE n.nspname = 'public' AND c.relname = 'aircraftWeatherObservation' AND a.attname = 'dedupKey'`);
    expect(metadata.rows).toEqual(expect.arrayContaining([expect.objectContaining({ schema_name: "public", table_name: "aircraftWeatherObservation", constraint_name: "aircraftWeatherObservation_dedupKey_key", constraint_type: "u", nullable: false })]));
    await truncate();
  });

  afterAll(async () => { await pool.end(); });
  beforeEach(async () => { process.env.AIRRADAR_WEATHER_BATCH_INSERT_ENABLED = "true"; await truncate(); });

  it("uses the exact builder/runtime path for 1, 2, 4, 8, and 16 rows", async () => {
    for (const size of [1, 2, 4, 8, 16]) {
      await persistAircraftWeatherObservations(observations(Array.from({ length: size }, (_, i) => `A${String(size).padStart(2, "0")}${String(i).padStart(3, "0")}`)), new Date("2026-09-29T19:00:00.000Z"));
      expect(await count()).toBe(size);
      await pool.query('TRUNCATE TABLE "aircraftWeatherObservation" RESTART IDENTITY CASCADE'); resetAircraftWeatherDiagnostics();
    }
    expect(getAircraftWeatherDiagnostics().batchSuccesses).toBe(0);
  });

  it("proves the real duplicate error shape, classifier, temporal parity, and field parity", async () => {
    const first = row("DUP001"); await executeRows([first]);
    let error: unknown;
    try { await executeRows([first]); } catch (caught) { error = caught; }
    expect(classifyWeatherDbError(error)).toBe("EXACT_DEDUP_CONFLICT");
    expect(error).toBeTruthy();
    const safe = error as Record<string, unknown>;
    expect(String(safe.code ?? safe.sqlState)).toBe("23505");
    expect(String(safe.constraint ?? (safe.meta as Record<string, unknown> | undefined)?.constraint)).toBe("aircraftWeatherObservation_dedupKey_key");
    const stored = (await pool.query('SELECT "dedupKey", "aircraftHex", "observedAt", "receivedAt", lat, lon, "altitudeFt", "windSpeedKt", "staticAirTempC", "staticPressureHpa", "humidityPct", "turbulenceLevel", source, provider, quality, "weatherSourceQuality", "bdsConfidence", "provenanceJson" FROM "aircraftWeatherObservation" WHERE "dedupKey"=$1', [first.dedupKey])).rows[0];
    expect(stored.dedupKey).toBe("DUP001-base"); expect(stored.aircraftHex).toBe("DUP001"); expect(stored.lat).toBe(50); expect(stored.lon).toBe(14); expect(stored.altitudeFt).toBe(10000); expect(stored.windSpeedKt).toBe(40); expect(stored.staticAirTempC).toBe(-40); expect(stored.staticPressureHpa).toBe(250); expect(stored.humidityPct).toBe(40); expect(stored.turbulenceLevel).toBe(1); expect(stored.source).toBe("READSB_JSON"); expect(stored.provider).toBe("local"); expect(stored.quality).toBe("HIGH"); expect(JSON.parse(stored.provenanceJson)).toBeTruthy();
    expect(Temporal.Instant.from(stored.observedAt.toISOString()).epochMilliseconds).toBe(new Date("2026-09-29T19:00:00.000Z").getTime());
    expect(Temporal.Instant.from(stored.receivedAt.toISOString()).epochMilliseconds).toBe(new Date("2026-09-29T19:00:00.000Z").getTime());
  });

  it("proves statement atomicity and bounded duplicate fallback", async () => {
    const duplicate = row("ATOM02"); await executeRows([duplicate]);
    await expect(executeRows([row("ATOM01"), duplicate, row("ATOM03")])).rejects.toBeTruthy();
    expect(await count()).toBe(1);
    await truncate();
    await persistAircraftWeatherObservations([aircraft("ATOM02")], new Date("2026-09-29T19:00:00.000Z"));
    resetAircraftWeatherDiagnostics(); resetDbOperationDiagnosticsForTests();
    await persistAircraftWeatherObservations(observations(["ATOM01", "ATOM02", "ATOM03"]), new Date("2026-09-29T19:00:00.000Z"));
    expect(await count()).toBe(3);
    expect(getAircraftWeatherDiagnostics()).toMatchObject({ batchDedupFailures: 1, fallbackRows: 3, fallbackSuccesses: 2 });
    await truncate();
    await persistAircraftWeatherObservations([aircraft("CAP00")], new Date("2026-09-29T19:00:00.000Z"));
    resetAircraftWeatherDiagnostics(); resetDbOperationDiagnosticsForTests();
    await persistAircraftWeatherObservations(observations(["CAP00", ...Array.from({ length: 9 }, (_, i) => `CAP${String(i + 1).padStart(2, "0")}`)]), new Date("2026-09-29T19:00:00.000Z"));
    expect(getAircraftWeatherDiagnostics().fallbackRows).toBeLessThanOrEqual(8);
    expect(await count()).toBeLessThanOrEqual(9);
  });

  it("keeps legacy and batch fallback diagnostics in separate lanes and preserves sequential aircraft behavior", async () => {
    process.env.AIRRADAR_WEATHER_BATCH_INSERT_ENABLED = "false";
    await persistAircraftWeatherObservations([aircraft("LEG001")], new Date("2026-09-29T19:00:00.000Z"));
    expect(getDbOperationDiagnostics().lanes["weather.observation.create"].attempts).toBe(1);
    expect(getDbOperationDiagnostics().lanes["weather.observation.fallback-create"].attempts).toBe(0);
    await truncate(); process.env.AIRRADAR_WEATHER_BATCH_INSERT_ENABLED = "true";
    await persistAircraftWeatherObservations([aircraft("LANE02")], new Date("2026-09-29T19:00:00.000Z"));
    resetAircraftWeatherDiagnostics(); resetDbOperationDiagnosticsForTests();
    await persistAircraftWeatherObservations(observations(["LANE01", "LANE02", "LANE03"]), new Date("2026-09-29T19:00:00.000Z"));
    expect(getDbOperationDiagnostics().lanes["weather.observation.fallback-create"].attempts).toBe(3);
    await truncate(); process.env.AIRRADAR_WEATHER_BATCH_INSERT_ENABLED = "false";
    const second = aircraft("SEQ001", { lat: 50.3, lastSeen: "2026-09-29T19:00:05.000Z", adsbTelemetry: { ...aircraft("SEQ001").adsbTelemetry!, outsideAirTemperatureC: -42 }, observationTimes: { altitude: Date.parse("2026-09-29T19:00:05.000Z"), baroAltitude: Date.parse("2026-09-29T19:00:05.000Z"), geomAltitude: null, groundSpeed: Date.parse("2026-09-29T19:00:05.000Z"), track: Date.parse("2026-09-29T19:00:05.000Z"), verticalRate: Date.parse("2026-09-29T19:00:05.000Z"), position: Date.parse("2026-09-29T19:00:05.000Z"), extendedTelemetry: Date.parse("2026-09-29T19:00:05.000Z"), signal: Date.parse("2026-09-29T19:00:05.000Z") } });
    for (const value of Object.values(second.provenance?.fields ?? {})) if (value) value.observedAt = "2026-09-29T19:00:05.000Z";
    await persistAircraftWeatherObservations([aircraft("SEQ001"), second], new Date("2026-09-29T19:00:05.000Z"));
    expect(await count()).toBe(2);
  });

  it("records the 16-row runtime cap and compares benchmark lanes", async () => {
    const benchmark: Array<Record<string, number>> = [];
    for (const size of [1, 4, 8, 16, 32, 64]) {
      await truncate(); const fresh = observations(Array.from({ length: size }, (_, i) => `B${String(size).padStart(2, "0")}${String(i).padStart(3, "0")}`));
      process.env.AIRRADAR_WEATHER_BATCH_INSERT_ENABLED = "false"; const singleStart = performance.now(); await persistAircraftWeatherObservations(fresh, new Date("2026-09-29T19:00:00.000Z")); const singleMs = performance.now() - singleStart; const singleOps = getDbOperationDiagnostics().lanes["weather.observation.create"].attempts;
      await truncate(); process.env.AIRRADAR_WEATHER_BATCH_INSERT_ENABLED = "true"; const batchStart = performance.now(); await persistAircraftWeatherObservations(fresh, new Date("2026-09-29T19:00:00.000Z")); const batchMs = performance.now() - batchStart; const batchOps = getDbOperationDiagnostics().lanes["weather.observation.batch-insert"].attempts;
      benchmark.push({ rows: size, singleMs, batchMs, speedup: singleMs / Math.max(batchMs, 0.001), singleOperations: singleOps, batchOperations: batchOps });
    }
    expect(getAircraftWeatherDiagnostics()).toMatchObject({ maxBatchSize: 16, naturalMaxSelectedRows: 64 });
    console.log(`WEATHER_BATCH_BENCHMARK ${JSON.stringify(benchmark)}`);
    expect(benchmark).toHaveLength(6);
  });

  it("does not classify a controlled row error as dedup", async () => {
    const invalid = row("BAD001") as unknown as Record<string, unknown>; invalid.dedupKey = null;
    let error: unknown; try { await executeRows([invalid as never]); } catch (caught) { error = caught; }
    expect(classifyWeatherDbError(error)).not.toBe("EXACT_DEDUP_CONFLICT");
  });

  it("opens the breaker after two real connection failures and resumes after restoration", async () => {
    const root = process.env.AIRRADAR_PG_TEST_ROOT;
    if (!root) return;
    const pgCtl = `${root}/root/usr/lib/postgresql/17/bin/pg_ctl`;
    const run = (args: string[]) => execFileSync("runuser", ["-u", "airradar", "--", pgCtl, "-D", `${root}/data`, ...args], { stdio: "ignore" });
    run(["-m", "fast", "stop"]);
    try {
      await persistAircraftWeatherObservations([aircraft("OUT001")], new Date("2026-09-29T19:00:00.000Z"));
      await persistAircraftWeatherObservations([aircraft("OUT002")], new Date("2026-09-29T19:00:00.000Z"));
      expect(getAircraftWeatherDiagnostics()).toMatchObject({ batchInfrastructureFailures: 2, currentCircuitState: "open" });
    } finally {
      run(["-l", `${root}/postgres.log`, "-o", `-p 55432 -h 127.0.0.1 -k ${root}/socket`, "start"]);
    }
    await new Promise((resolve) => setTimeout(resolve, 30_500));
    await persistAircraftWeatherObservations([aircraft("OUT003")], new Date("2026-09-29T19:00:00.000Z"));
    expect(getAircraftWeatherDiagnostics()).toMatchObject({ currentCircuitState: "closed" });
    expect(await count()).toBe(1);
    vi.restoreAllMocks();
  }, 40_000);
});

if (!enabled) console.warn("SKIP aircraft-weather-batch-postgres.integration.test.ts: requires AIRRADAR_ALLOW_DESTRUCTIVE_TEST_DB=true and a DATABASE_URL database name containing _test_.");
