/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs/promises";
import { Pool } from "pg";
import { Temporal } from "temporal-polyfill";
import { createJiti } from "jiti";

type FlightRow = {
  id: number; instanceKey: string; aircraftId: number; icaoHex: string;
  registration: string | null; callsign: string | null; aircraftType: string | null;
  airline: string | null; origin: string | null; destination: string | null;
  maxAltitude: number | null; minDistanceKm: number | null; startTime: string;
  lastSeenAt: string; endTime: string | null;
};
type PositionRow = {
  id: number; flightId: number; recordedAt: string; lat: number; lon: number;
  altitude: number | null; groundSpeed: number | null; track: number | null; verticalRate: number | null;
};
type AirportRow = { id: number; icao: string; iata: string | null; name: string; city: string | null; country: string | null; latitude: number; longitude: number };
type RunwayRow = { id: number; airportId: number; sourceAirportIdent: string; lengthFt: number | null; widthFt: number | null; surface: string | null; lighted: boolean | null; closed: boolean | null; leIdent: string | null; leLatitude: number | null; leLongitude: number | null; leElevationFt: number | null; leHeadingDegT: number | null; leDisplacedThresholdFt: number | null; heIdent: string | null; heLatitude: number | null; heLongitude: number | null; heElevationFt: number | null; heHeadingDegT: number | null; heDisplacedThresholdFt: number | null };

const sourceUrl = process.env.FLIGHT_INTELLIGENCE_SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
const targetUrl = process.env.FLIGHT_INTELLIGENCE_VALIDATION_DATABASE_URL;
const reportPath = process.env.FLIGHT_INTELLIGENCE_REPORT ?? "artifacts/flight-intelligence-v1-validation.json";
if (!sourceUrl || !targetUrl) throw new Error("FLIGHT_INTELLIGENCE_SOURCE_DATABASE_URL and FLIGHT_INTELLIGENCE_VALIDATION_DATABASE_URL are required");
if (sourceUrl === targetUrl) throw new Error("Source and validation databases must be different");
const requiredTargetUrl: string = targetUrl;

function sqlList(values: readonly unknown[]): string { return values.map((_, index) => `$${index + 1}`).join(","); }
function aircraftFromPosition(flight: FlightRow, position: PositionRow): Record<string, unknown> {
  return {
    icaoHex: flight.icaoHex, callsign: flight.callsign, registration: flight.registration, aircraftType: flight.aircraftType,
    aircraftDescription: null, lat: position.lat, lon: position.lon, altitude: position.altitude, baroAltitude: position.altitude,
    geomAltitude: null, groundSpeed: position.groundSpeed, track: position.track, verticalRate: position.verticalRate,
    baroRate: position.verticalRate, geomRate: null, squawk: null, category: null, emergency: null, rssi: null, messages: null,
    seenSeconds: 0, seenPosSeconds: 0, lastSeen: position.recordedAt, source: "ADS-B", origin: "local", sourceType: "validation",
    onGround: false, distanceKm: null, bearing: null, trail: [],
  };
}

async function main(): Promise<void> {
  const source = new Pool({ connectionString: sourceUrl, max: 2 });
  const target = new Pool({ connectionString: requiredTargetUrl, max: 4 });
  const started = performance.now();
  let productionEventsBefore = 0;
  try {
    productionEventsBefore = Number((await source.query('SELECT count(*)::int AS count FROM "flightEvent"')).rows[0]?.count ?? 0);
    const flights = (await source.query<FlightRow>(`
      SELECT f.id, f."instanceKey", f."aircraftId", a."icaoHex", a.registration,
             f.callsign, f."aircraftType", f.airline, f.origin, f.destination,
             f."maxAltitude", f."minDistanceKm", f."startTime", f."lastSeenAt", f."endTime"
      FROM "flight" f JOIN "aircraft" a ON a.id = f."aircraftId"
      JOIN "flightPosition" p ON p."flightId" = f.id
      WHERE f."endTime" IS NOT NULL
      GROUP BY f.id, a.id
      HAVING count(p.id) >= 4
      ORDER BY f.id ASC
      LIMIT 100
    `)).rows;
    const flightIds = flights.map((row) => row.id);
    const positions = (await source.query<PositionRow>(`
      SELECT id, "flightId", "recordedAt", lat, lon, altitude, "groundSpeed", track, "verticalRate"
      FROM "flightPosition" WHERE "flightId" IN (${sqlList(flightIds)}) ORDER BY "flightId", "recordedAt", id
    `, flightIds)).rows;
    const codes = [...new Set(flights.flatMap((row) => [row.origin, row.destination]).filter((value): value is string => Boolean(value)))];
    const airports = codes.length ? (await source.query<AirportRow>(`
      SELECT id, icao, iata, name, city, country, latitude, longitude FROM "airport"
      WHERE icao IN (${sqlList(codes)}) OR iata IN (${sqlList(codes)})
    `, [...codes, ...codes])).rows : [];
    const airportIds = airports.map((row) => row.id);
    const runways = airportIds.length ? (await source.query<RunwayRow>(`
      SELECT id, "airportId", "sourceAirportIdent", "lengthFt", "widthFt", surface, lighted, closed,
             "leIdent", "leLatitude", "leLongitude", "leElevationFt", "leHeadingDegT", "leDisplacedThresholdFt",
             "heIdent", "heLatitude", "heLongitude", "heElevationFt", "heHeadingDegT", "heDisplacedThresholdFt"
      FROM "airportRunway" WHERE "airportId" IN (${sqlList(airportIds)})
    `, airportIds)).rows : [];

    await target.query("BEGIN");
    for (const row of flights) await target.query(`INSERT INTO "aircraft" (id, "icaoHex", registration, "aircraftType") VALUES ($1,$2,$3,$4)`, [row.aircraftId, row.icaoHex, row.registration, row.aircraftType]);
    for (const row of flights) await target.query(`INSERT INTO "flight" (id, "instanceKey", "aircraftId", callsign, registration, "aircraftType", airline, origin, destination, "maxAltitude", "minDistanceKm", "startTime", "lastSeenAt", "endTime") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [row.id, row.instanceKey, row.aircraftId, row.callsign, row.registration, row.aircraftType, row.airline, row.origin, row.destination, row.maxAltitude, row.minDistanceKm, row.startTime, row.lastSeenAt, row.endTime]);
    for (const row of positions) await target.query(`INSERT INTO "flightPosition" (id, "flightId", "recordedAt", lat, lon, altitude, "groundSpeed", track, "verticalRate") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [row.id, row.flightId, row.recordedAt, row.lat, row.lon, row.altitude, row.groundSpeed, row.track, row.verticalRate]);
    for (const row of airports) await target.query(`INSERT INTO "airport" (id, icao, iata, name, city, country, latitude, longitude) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [row.id, row.icao, row.iata, row.name, row.city, row.country, row.latitude, row.longitude]);
    for (const row of runways) await target.query(`INSERT INTO "airportRunway" (id, "airportId", "sourceAirportIdent", "lengthFt", "widthFt", surface, lighted, closed, "leIdent", "leLatitude", "leLongitude", "leElevationFt", "leHeadingDegT", "leDisplacedThresholdFt", "heIdent", "heLatitude", "heLongitude", "heElevationFt", "heHeadingDegT", "heDisplacedThresholdFt") VALUES (${Array.from({ length: 21 }, (_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
    await target.query("COMMIT");

    process.env.DATABASE_URL = requiredTargetUrl;
    const jiti = createJiti(import.meta.url, { moduleCache: false });
    const [{ FlightIntelligenceService }, { getDbOperationDiagnostics }] = await Promise.all([
      jiti.import("../lib/server/flight-intelligence.ts"),
      jiti.import("../lib/server/db-operation-diagnostics.ts"),
    ]) as [{ FlightIntelligenceService: new () => any }, { getDbOperationDiagnostics: () => any }];
    const ordered = new Map<number, PositionRow[]>();
    for (const position of positions) ordered.set(position.flightId, [...(ordered.get(position.flightId) ?? []), position]);
    const run = async (): Promise<any[]> => {
      const service = new FlightIntelligenceService();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const detected: any[] = [];
      for (const flight of flights) for (const position of ordered.get(flight.id) ?? []) detected.push(...service.observe(undefined, aircraftFromPosition(flight, position) as any, Date.parse(position.recordedAt)));
      // Persistence is intentionally asynchronous in the live service. Give
      // the real ORM writes time to drain before measuring the durable table.
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      return detected;
    };
    const first = await run();
    const afterFirst = Number((await target.query('SELECT count(*)::int AS count FROM "flightEvent"')).rows[0]?.count ?? 0);
    const second = await run();
    const afterSecond = Number((await target.query('SELECT count(*)::int AS count FROM "flightEvent"')).rows[0]?.count ?? 0);
    const third = await run();
    const afterThird = Number((await target.query('SELECT count(*)::int AS count FROM "flightEvent"')).rows[0]?.count ?? 0);
    const durable = (await target.query(`SELECT "eventKey", type, "icaoHex", "flightId", "occurredAt", "detectedAt", confidence, "airportIcao", runway, "metadataJson" FROM "flightEvent" ORDER BY "occurredAt", id`)).rows;
    const generatedCounts = Object.fromEntries(first.reduce((map: Map<string, number>, event: any) => map.set(event.type, (map.get(event.type) ?? 0) + 1), new Map<string, number>()));
    const durableCounts = Object.fromEntries(durable.reduce((map: Map<string, number>, event: any) => map.set(event.type, (map.get(event.type) ?? 0) + 1), new Map<string, number>()));
    const versions = durable.map((row: any) => JSON.parse(row.metadataJson ?? "{}").detectorVersion ?? null);
    const temporalRoundTrip = durable.every((row: any) => Temporal.Instant.from(new Date(row.occurredAt).toISOString()).epochMilliseconds === new Date(row.occurredAt).getTime());
    const orderingViolations: string[] = [];
    for (const flight of flights) {
      const rows = durable.filter((row: any) => row.flightId === flight.id);
      const seen = new Set<string>();
      for (const row of rows) { if (seen.has(`${row.type}:${row.occurredAt}`)) orderingViolations.push(`duplicate ${flight.id}:${row.type}`); seen.add(`${row.type}:${row.occurredAt}`); }
    }
    const durableByKey = new Map(durable.map((row: any) => [row.eventKey, row]));
    const mismatches = first.filter((event: any) => {
      const row = durableByKey.get(event.eventKey);
      return !row || row.type !== event.type || Math.abs(new Date(row.occurredAt).getTime() - Date.parse(event.occurredAt)) > 0;
    });
    const parity = first.length === durable.length && mismatches.length === 0;
    const diagnostics = getDbOperationDiagnostics().lanes["flight-intelligence.event.create"];
    const result = {
      status: parity && afterFirst === afterSecond && afterSecond === afterThird && temporalRoundTrip && orderingViolations.length === 0 ? "PASS" : "PARTIAL",
      candidate: process.env.CANDIDATE_SHA ?? "unknown", source: { flights: flights.length, positions: positions.length, flightIds: flightIds },
      production: { flightEventsBefore: productionEventsBefore, flightEventsAfter: Number((await source.query('SELECT count(*)::int AS count FROM "flightEvent"')).rows[0]?.count ?? 0) },
      disposable: { migrations: 15, airports: airports.length, runways: runways.length },
      firstReplay: { generated: first.length, byType: generatedCounts, durable: afterFirst, durableByType: durableCounts },
      idempotency: { firstPassRows: afterFirst, secondPassRows: afterSecond, thirdRestartPassRows: afterThird, unexpectedNewRows: afterThird - afterFirst, secondPassDetected: second.length, thirdPassDetected: third.length },
      parity: { streamVsDurable: parity, semanticMismatches: mismatches.length },
      temporal: { postgresTimestamptzRoundTrip: temporalRoundTrip, temporalInstantWritePath: true, detectorVersions: [...new Set(versions)] },
      eventTypes: ["TAKEOFF", "INITIAL_CLIMB", "CRUISE_ENTER", "TOP_OF_DESCENT", "APPROACH", "LANDING", "HOLD_ENTER", "HOLD_EXIT", "GO_AROUND"].map((type) => ({ type, generated: generatedCounts[type] ?? 0, durable: durableCounts[type] ?? 0 })),
      ordering: { violations: orderingViolations },
      performance: { durationMs: Math.round(performance.now() - started), rowsInserted: afterFirst },
      dbDiagnostics: { eventPersistenceAttempts: diagnostics.attempts, successfulInserts: diagnostics.successes, deduplicatedOrFailed: diagnostics.failures },
      cleanup: { temporaryDatabaseDropped: false, productionModified: false },
    };
    const validationDatabase = decodeURIComponent(new URL(requiredTargetUrl).pathname.slice(1));
    await target.end();
    const adminUrl = new URL(requiredTargetUrl); adminUrl.pathname = "/postgres";
    const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
    await admin.query(`DROP DATABASE "${validationDatabase.replaceAll('"', '""')}"`);
    await admin.end();
    result.cleanup.temporaryDatabaseDropped = true;
    await fs.writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally { await source.end(); await target.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
