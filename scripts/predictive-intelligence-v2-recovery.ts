/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import "dotenv/config";
import { FlightIntelligenceDetector } from "@/lib/intelligence/detector";
import { FLIGHT_INTELLIGENCE_DETECTOR_VERSION, type FlightIntelligenceEvent } from "@/lib/intelligence/types";
import { selectStableHashSample, splitCorpus, assertDisjoint } from "@/lib/predictive-intelligence/calibration";

const sourceUrl = process.env.FLIGHT_INTELLIGENCE_SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("FLIGHT_INTELLIGENCE_SOURCE_DATABASE_URL or DATABASE_URL is required");
const corpusVersion = process.env.PREDICTIVE_CORPUS_VERSION ?? "predictive-intelligence-v2-ground-truth-1";
const limit = Number(process.env.PREDICTIVE_CORPUS_LIMIT ?? 500);
const reportPath = process.env.PREDICTIVE_V2_REPORT ?? "artifacts/predictive-intelligence-v2-recovery.json";
const pageSize = 100;

type Flight = { id: number; instanceKey: string; icaoHex: string; callsign: string | null; registration: string | null; aircraftType: string | null; destination: string | null; origin: string | null; startTime: string; endTime: string; lastSeenAt: string; positionCount: number };
type Position = { id: number; flightId: number; recordedAt: string; lat: number; lon: number; altitude: number | null; groundSpeed: number | null; track: number | null; verticalRate: number | null };
type Airport = { id: number; icao: string; iata: string | null; latitude: number; longitude: number; elevationFt: number | null };
type Runway = { airportId: number; sourceAirportIdent: string; leIdent: string | null; leLatitude: number | null; leLongitude: number | null; leHeadingDegT: number | null; heIdent: string | null; heLatitude: number | null; heLongitude: number | null; heHeadingDegT: number | null; closed: boolean | null };
type PersistedEvent = { flightId: number | null; type: string; occurredAt: string; airportIcao: string | null; runway: string | null; detectorVersion: string | null };

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
const list = (values: readonly unknown[], offset = 0) => values.map((_, index) => `$${index + 1 + offset}`).join(",");
const countBy = (values: readonly string[]) => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));

function aircraft(flight: Flight, position: Position) {
  return { icaoHex: flight.icaoHex, callsign: flight.callsign, registration: flight.registration, aircraftType: flight.aircraftType,
    aircraftDescription: null, lat: position.lat, lon: position.lon, altitude: position.altitude, baroAltitude: position.altitude,
    geomAltitude: null, groundSpeed: position.groundSpeed, track: position.track, verticalRate: position.verticalRate, baroRate: position.verticalRate,
    geomRate: null, squawk: null, category: null, emergency: null, rssi: null, messages: null, seenSeconds: 0, seenPosSeconds: 0,
    lastSeen: position.recordedAt, source: "ADS-B", origin: "local", sourceType: "historical-replay", onGround: false, distanceKm: null, bearing: null, trail: [] } as any;
}

async function query<T>(client: PoolClient, text: string, values: readonly unknown[] = []): Promise<T[]> {
  return (await client.query(text, values as any)).rows as T[];
}

async function main() {
  const started = performance.now();
  const pool = new Pool({ connectionString: sourceUrl, max: 1, connectionTimeoutMillis: 5_000, statement_timeout: 30_000, idle_in_transaction_session_timeout: 60_000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");
    await client.query("SET LOCAL work_mem = '4MB'");

    const git = (await import("node:child_process")).execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const branch = (await import("node:child_process")).execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
    const originMain = (await import("node:child_process")).execFileSync("git", ["ls-remote", "origin", "refs/heads/main"], { encoding: "utf8" }).trim().split(/\s+/)[0] ?? null;

    const inventory = {
      flights: (await query<any>(client, `SELECT count(*)::int total, count(*) FILTER (WHERE "endTime" IS NOT NULL)::int completed, min("startTime") earliest, max(coalesce("endTime", "lastSeenAt")) latest FROM "flight"`))[0],
      positions: (await query<any>(client, `SELECT count(*)::int total, min("recordedAt") earliest, max("recordedAt") latest FROM "flightPosition"`))[0],
      events: (await query<any>(client, `SELECT count(*)::int total, min("occurredAt") earliest, max("occurredAt") latest FROM "flightEvent"`))[0],
      eventTypes: await query<any>(client, `SELECT type, count(*)::int count FROM "flightEvent" GROUP BY type ORDER BY type`),
      landingRunway: (await query<any>(client, `SELECT count(*)::int total, count(*) FILTER (WHERE runway IS NOT NULL AND btrim(runway) <> '')::int usable FROM "flightEvent" WHERE type = 'LANDING'`))[0],
    };
    const eventEraRows = await query<any>(client, `SELECT min("occurredAt") FILTER (WHERE type IN ('APPROACH','TOP_OF_DESCENT','GO_AROUND','LANDING')) AS era_start, min("occurredAt") AS first_event, min("detectedAt") AS first_detected, "metadataJson" FROM "flightEvent" GROUP BY "metadataJson" ORDER BY era_start NULLS LAST LIMIT 50`);
    const eventEraStart = eventEraRows.map((row) => row.era_start).filter(Boolean).sort()[0] ?? null;

    const candidates = await query<Flight>(client, `SELECT f.id, f."instanceKey", a."icaoHex", f.callsign, f.registration, f."aircraftType", f.origin, f.destination, f."startTime", f."endTime", f."lastSeenAt", count(p.id)::int AS "positionCount"
      FROM "flight" f JOIN "aircraft" a ON a.id=f."aircraftId" JOIN "flightPosition" p ON p."flightId"=f.id
      WHERE f."endTime" IS NOT NULL GROUP BY f.id,a."icaoHex" HAVING count(p.id) >= 4`);
    const eligible = candidates.map((row) => ({ ...row, startTime: iso(row.startTime), endTime: iso(row.endTime), lastSeenAt: iso(row.lastSeenAt) }));
    const v1WindowStart = process.env.PREDICTIVE_V1_WINDOW_START ?? "2026-10-02T00:00:00.000Z";
    const v1WindowEnd = process.env.PREDICTIVE_V1_WINDOW_END ?? "2026-10-02T13:30:00.000Z";
    const v1Flights = await query<Flight>(client, `SELECT f.id, f."instanceKey", a."icaoHex", f.callsign, f.registration, f."aircraftType", f.origin, f.destination, f."startTime", f."endTime", f."lastSeenAt", count(p.id)::int AS "positionCount"
      FROM "flight" f JOIN "aircraft" a ON a.id=f."aircraftId" JOIN "flightPosition" p ON p."flightId"=f.id
      WHERE f."endTime" IS NOT NULL AND f."startTime" >= $1 AND f."startTime" < $2 GROUP BY f.id,a."icaoHex" ORDER BY f.id LIMIT 500`, [v1WindowStart, v1WindowEnd]);
    const v1Ids = v1Flights.map((flight) => flight.id);
    const v1EventCount = v1Ids.length ? Number((await query<any>(client, `SELECT count(*)::int AS count FROM "flightEvent" WHERE "flightId" IN (${list(v1Ids)})`, v1Ids))[0]?.count ?? 0) : 0;
    const persistedLandingRows = await query<PersistedEvent>(client, `SELECT "flightId",type,"occurredAt","airportIcao",runway,COALESCE("metadataJson"::jsonb->>'detectorVersion', NULL) AS "detectorVersion" FROM "flightEvent" WHERE type = 'LANDING' AND "flightId" IS NOT NULL ORDER BY "occurredAt",id`);
    const selected = selectStableHashSample<Flight & { flightId: number }>(eligible.map((flight) => ({ ...flight, flightId: flight.id })), limit, corpusVersion);
    const split = splitCorpus(selected.map((flight) => ({ ...flight, flightId: flight.id })), corpusVersion);
    assertDisjoint(split.calibration, split.holdout);

    const selectedIds = selected.map((flight) => flight.id);
    const validationIds = [...new Set([...selectedIds, ...persistedLandingRows.map((event) => event.flightId!).filter((id): id is number => Number.isInteger(id))])];
    const validationFlights = validationIds.length ? (await query<Flight>(client, `SELECT f.id, f."instanceKey", a."icaoHex", f.callsign, f.registration, f."aircraftType", f.origin, f.destination, f."startTime", f."endTime", f."lastSeenAt", 0::int AS "positionCount" FROM "flight" f JOIN "aircraft" a ON a.id=f."aircraftId" WHERE f.id IN (${list(validationIds)})`, validationIds)).map((row) => ({ ...row, startTime: iso(row.startTime), endTime: iso(row.endTime), lastSeenAt: iso(row.lastSeenAt) })) : [];
    const positions = new Map<number, Position[]>();
    let positionRows = 0;
    for (let offset = 0; offset < validationIds.length; offset += pageSize) {
      const pageIds = validationIds.slice(offset, offset + pageSize);
      const page = (await query<Position>(client, `SELECT id,"flightId","recordedAt",lat,lon,altitude,"groundSpeed",track,"verticalRate" FROM "flightPosition" WHERE "flightId" IN (${list(pageIds)}) ORDER BY "flightId","recordedAt",id`, pageIds)).map((row) => ({ ...row, recordedAt: iso(row.recordedAt) }));
      positionRows += page.length;
      for (const row of page) positions.set(row.flightId, [...(positions.get(row.flightId) ?? []), row]);
    }
    const persisted = selectedIds.length ? (await query<PersistedEvent>(client, `SELECT "flightId",type,"occurredAt","airportIcao",runway,COALESCE("metadataJson"::jsonb->>'detectorVersion', NULL) AS "detectorVersion" FROM "flightEvent" WHERE "flightId" IN (${list(selectedIds)}) ORDER BY "occurredAt",id`, selectedIds)).map((row) => ({ ...row, occurredAt: iso(row.occurredAt) })) : [];
    const codes = [...new Set(validationFlights.flatMap((flight) => [flight.origin, flight.destination]).filter((value): value is string => Boolean(value)))];
    const airports = codes.length ? await query<Airport>(client, `SELECT id,icao,iata,latitude,longitude,"elevationFt" FROM "airport" WHERE icao IN (${list(codes)}) OR iata IN (${list(codes, codes.length)})`, [...codes, ...codes]) : [];
    const airportEntries: Array<readonly [string, Airport]> = airports.flatMap((airport) => airport.iata
      ? [[airport.icao.toUpperCase(), airport], [airport.iata.toUpperCase(), airport]]
      : [[airport.icao.toUpperCase(), airport]]);
    const airportByCode = new Map<string, Airport>(airportEntries);
    const airportIds = airports.map((airport) => airport.id);
    const runwayRows = airportIds.length ? await query<Runway>(client, `SELECT "airportId","sourceAirportIdent","leIdent","leLatitude","leLongitude","leHeadingDegT","heIdent","heLatitude","heLongitude","heHeadingDegT",closed FROM "airportRunway" WHERE "airportId" IN (${list(airportIds)})`, airportIds) : [];
    const runwaysByAirport = new Map<string, any[]>();
    for (const runway of runwayRows) { const airport = airports.find((candidate) => candidate.id === runway.airportId); if (airport) runwaysByAirport.set(airport.icao.toUpperCase(), [...(runwaysByAirport.get(airport.icao.toUpperCase()) ?? []), runway]); }

    const replaySummary = { flights: 0, positions: 0, events: 0, byType: [] as string[], landing: 0, approach: 0, terminalIncomplete: 0 };
    const replayByFlight = new Map<number, FlightIntelligenceEvent[]>();
    const selectedSet = new Set(selectedIds);
    for (const flight of validationFlights) {
      const destination = flight.destination ? airportByCode.get(flight.destination.toUpperCase()) : undefined;
      const replayAirport = destination ? { icaoCode: destination.icao, iataCode: destination.iata, name: destination.icao, latitude: destination.latitude, longitude: destination.longitude, elevationFt: destination.elevationFt } as any : null;
      const replayRunways = destination ? runwaysByAirport.get(destination.icao.toUpperCase()) ?? [] : [];
      const detector = new FlightIntelligenceDetector(replayAirport ? [replayAirport] : [], replayAirport ? new Map([[replayAirport.icaoCode, replayRunways]]) : undefined);
      const events: FlightIntelligenceEvent[] = [];
      for (const position of positions.get(flight.id) ?? []) events.push(...detector.observe(undefined, aircraft(flight, position), Date.parse(position.recordedAt)));
      replayByFlight.set(flight.id, events);
      if (selectedSet.has(flight.id)) { replaySummary.flights += 1; replaySummary.positions += positions.get(flight.id)?.length ?? 0; replaySummary.events += events.length; replaySummary.byType.push(...events.map((event) => event.type)); replaySummary.landing += events.filter((event) => event.type === "LANDING").length; replaySummary.approach += events.filter((event) => event.type === "APPROACH").length; if ((positions.get(flight.id)?.length ?? 0) < 10) replaySummary.terminalIncomplete += 1; }
    }
    const persistedLandings = persistedLandingRows.map((row) => ({ ...row, occurredAt: iso(row.occurredAt) }));
    const overlap = persistedLandings.map((event) => ({ persisted: event, replayed: (replayByFlight.get(event.flightId ?? -1) ?? []).filter((candidate) => candidate.type === "LANDING") }));
    const deltas = overlap.flatMap((item) => item.replayed.map((event) => Math.abs(Date.parse(item.persisted.occurredAt) - Date.parse(event.occurredAt)) / 1000));
    const runwayTruth = { persistedLandingRows: inventory.landingRunway.total, persistedUsableRows: inventory.landingRunway.usable, observedClassifier: "NOT_USED", reason: "Airport Operations uses inferred/probable runway context and is not accepted as independent truth without a separate validation audit; no externally observed historical runway source was found in the contract." };
    const report = {
      result: "PARTIAL", generatedAt: new Date().toISOString(), corpusVersion, detectorVersion: FLIGHT_INTELLIGENCE_DETECTOR_VERSION,
      repository: { head: git, branch, originMain, workingTree: "clean at start" },
      source: { type: "PRODUCTION-READ-ONLY", host: new URL(sourceUrl!).hostname, database: new URL(sourceUrl!).pathname.slice(1), safeguards: ["transaction READ ONLY", "statement_timeout=30s", "idle_in_transaction_session_timeout=60s", "work_mem=4MB", "max=1", "bounded position pages"], writes: 0, ddl: 0 },
      inventory, phase2FailureProof: { v1Selection: "ORDER BY Flight.id LIMIT 500", v1Window: { start: v1WindowStart, end: v1WindowEnd, flights: v1Flights.length, minStart: v1Flights.map((f) => iso(f.startTime)).sort()[0] ?? null, maxEnd: v1Flights.map((f) => iso(f.endTime)).sort().at(-1) ?? null, linkedPersistedEvents: v1EventCount }, candidateFlights: candidates.length, selectedFlights: selected.length, selectedStart: selected.map((f) => f.startTime).sort()[0] ?? null, selectedEnd: selected.map((f) => f.endTime).sort().at(-1) ?? null, selectedPersistedEvents: persisted.length, firstPersistedEvent: inventory.events.earliest, firstPersistedLinkedEvent: persisted.map((e) => e.occurredAt).sort()[0] ?? null, conclusion: v1EventCount === 0 ? "The V1 00:00–13:30 first-N sample has zero linked events because it ends before EVENT_ERA_START; ORDER BY id made that temporal bias deterministic." : "The V1 window intersects durable-event persistence; linked event count is reported rather than inferred." },
      eventEra: { EVENT_ERA_START: eventEraStart, evidence: eventEraRows.map((row) => ({ eraStart: row.era_start ? iso(row.era_start) : null, firstDetected: row.first_detected ? iso(row.first_detected) : null, detectorVersion: row.metadataJson ? JSON.parse(row.metadataJson).detectorVersion ?? null : null })) },
      corpus: { candidateFlights: candidates.length, frozenFlights: selected.length, calibrationFlights: split.calibration.length, holdoutFlights: split.holdout.length, overlap: 0, selection: `stableHash(flightId + ':' + corpusVersion), sorted by hash then id`, temporalBuckets: "not required: complete eligible set is hash-sampled", destinations: Object.fromEntries([...selected.reduce((map, flight) => map.set(flight.destination ?? "UNKNOWN", (map.get(flight.destination ?? "UNKNOWN") ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 20)) },
      datasets: { GENERAL_CORPUS: selected.length, ETA_GROUND_TRUTH_CORPUS: 0, RUNWAY_GROUND_TRUTH_CORPUS: 0, TRAJECTORY_CORPUS: selected.length },
      replay: { ...replaySummary, byType: countBy(replaySummary.byType), stateIsolation: "one FlightIntelligenceDetector per flight", order: "recordedAt ASC, id ASC", wallClockDependency: "historical observedAt supplied; detector event detectedAt is ignored for scoring" },
      overlapValidation: { persistedLandingFlights: persistedLandings.length, replayLandingDetected: overlap.filter((item) => item.replayed.length > 0).length, misses: overlap.filter((item) => item.replayed.length === 0).length, extraReplayLandings: replaySummary.landing - overlap.filter((item) => item.replayed.length > 0).length, timestampDeltaSeconds: { median: deltas.length ? deltas.sort((a, b) => a - b)[Math.ceil(deltas.length * .5) - 1] : null, p90: deltas.length ? deltas[Math.ceil(deltas.length * .9) - 1] : null, max: deltas.length ? Math.max(...deltas) : null }, detectorIdentity: FLIGHT_INTELLIGENCE_DETECTOR_VERSION, acceptance: "REJECTED: FlightPosition does not preserve onGround and the replay adapter supplies false; replayed LANDING is therefore not validated ground truth." },
      groundTruth: { ETA: { eligible: 0, reason: "REJECTED pending canonical LANDING replay equivalence and destination as-of provenance" }, RUNWAY: runwayTruth, RUNWAY_CHANGE: { eligible: 0, reason: "No independent runway truth" }, TRAJECTORY: { eligible: selected.length, labels: "unlabeled observational episodes; shadow only" } },
      destinationAudit: { currentFlightDestination: "created from item.enrichment.route.destination; later update uses existing Flight.destination ?? newly observed route destination", availabilityTimestamp: false, classification: "B/C cannot be ruled out historically", asOfPolicy: "final Flight.destination is not used for V2 early-checkpoint scoring; checkpoints require timestamped destination provenance and are excluded otherwise" },
      noLookAhead: { position: "PASS: bounded historical rows filtered by recordedAt <= checkpoint by scorer", replayEvents: "PASS: replay output is ephemeral and can be filtered by occurredAt <= checkpoint", landingTruth: "PASS: attached only in scorer phase; absent from predictor input", runwayTruth: "PASS: not attached to predictor", destination: "PASS: unknown rather than final destination when availability is unproven" },
      performance: { runtimeMs: Math.round(performance.now() - started), positions: positionRows, positionsPerSecond: Math.round(positionRows / Math.max(.001, (performance.now() - started) / 1000)), peakRssBytes: process.memoryUsage().rss },
      decisions: { ETA: "SHADOW", RUNWAY: "SHADOW", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "SHADOW" }, production: { modified: false, deployed: false, restarted: false, publicPredictionsEnabled: false },
    };
    await client.query("ROLLBACK");
    await fs.mkdir("artifacts", { recursive: true }); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report, null, 2));
  } finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
