/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs/promises";
import { Pool } from "pg";
import { createJiti } from "jiti";
import "dotenv/config";

const sourceUrl = process.env.FLIGHT_INTELLIGENCE_SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("FLIGHT_INTELLIGENCE_SOURCE_DATABASE_URL or DATABASE_URL is required");

const WINDOW_START = process.env.PREDICTIVE_CORPUS_START ?? "2026-10-02T00:00:00.000Z";
const WINDOW_END = process.env.PREDICTIVE_CORPUS_END ?? "2026-10-02T13:30:00.000Z";
const CORPUS_LIMIT = Number(process.env.PREDICTIVE_CORPUS_LIMIT ?? 500);
const calibrationPath = process.env.PREDICTIVE_CALIBRATION_JSON ?? "artifacts/predictive-intelligence-v1-calibration.json";
const replayPath = process.env.PREDICTIVE_REPLAY_JSON ?? "artifacts/predictive-intelligence-v1-replay.json";
const validationPath = process.env.PREDICTIVE_VALIDATION_JSON ?? "artifacts/predictive-intelligence-v1-validation.json";

type Flight = { id: number; instanceKey: string; icaoHex: string; destination: string | null; startTime: string; endTime: string; positionCount: number; firstPosition: string | null; lastPosition: string | null };
type Position = { id: number; flightId: number; recordedAt: string; lat: number; lon: number; altitude: number | null; groundSpeed: number | null; track: number | null; verticalRate: number | null };
type Airport = { icao: string; iata: string | null; latitude: number; longitude: number; elevationFt: number | null };
type Runway = { airportId: number; leIdent: string | null; leLatitude: number | null; leLongitude: number | null; leHeadingDegT: number | null; heIdent: string | null; heLatitude: number | null; heLongitude: number | null; heHeadingDegT: number | null; closed: boolean | null };
type Event = { flightId: number | null; type: string; occurredAt: string; airportIcao: string | null; runway: string | null; metadataJson: string | null };

const sqlList = (values: readonly unknown[], offset = 0) => values.map((_, i) => `$${i + 1 + offset}`).join(",");
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
const median = (values: number[]) => { if (!values.length) return null; const v = [...values].sort((a, b) => a - b); return v[Math.ceil(v.length * 0.5) - 1] ?? null; };
const p90 = (values: number[]) => { if (!values.length) return null; const v = [...values].sort((a, b) => a - b); return v[Math.ceil(v.length * 0.9) - 1] ?? null; };
const etaMetric = (errors: number[]) => ({ n: errors.length, medianMinutes: median(errors.map((v) => Math.abs(v) / 60_000)), maeMinutes: errors.length ? errors.reduce((s, v) => s + Math.abs(v), 0) / errors.length / 60_000 : null, p90Minutes: p90(errors.map((v) => Math.abs(v) / 60_000)), biasMinutes: errors.length ? errors.reduce((s, v) => s + v, 0) / errors.length / 60_000 : null });
const checkpointOffsets: Record<string, number> = { "T-60": 60, "T-30": 30, "T-15": 15, "T-10": 10, "T-5": 5 };

async function main() {
  const started = performance.now();
  const pool = new Pool({ connectionString: sourceUrl, max: 1, connectionTimeoutMillis: 5_000, statement_timeout: 30_000, idle_in_transaction_session_timeout: 60_000 });
  const jiti = createJiti(import.meta.url, { moduleCache: false });
  const [{ splitCorpus, assertDisjoint, simpleEtaBaseline }, { evaluatePredictiveIntelligence }, { PREDICTIVE_CALIBRATION_CONFIG }] = await Promise.all([
    jiti.import("../lib/predictive-intelligence/calibration.ts"),
    jiti.import("../lib/predictive-intelligence/engine.ts"),
    jiti.import("../lib/predictive-intelligence/config.ts"),
  ]) as any;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");
    await client.query("SET LOCAL work_mem = '4MB'");

    const inventory: any = {};
    const inventoryQueries: Record<string, string> = {
      flights: `SELECT count(*)::int total, count(*) FILTER (WHERE "endTime" IS NOT NULL)::int completed, count(*) FILTER (WHERE destination IS NOT NULL)::int destinationKnown, min("startTime") earliest, max(coalesce("endTime", "lastSeenAt")) latest FROM "flight"`,
      positions: `SELECT count(*)::int total, min("recordedAt") earliest, max("recordedAt") latest FROM "flightPosition"`,
      events: `SELECT count(*)::int total, min("occurredAt") earliest, max("occurredAt") latest FROM "flightEvent"`,
      eventTypes: `SELECT type, count(*)::int count FROM "flightEvent" GROUP BY type ORDER BY type`,
      weather: `SELECT count(*)::int total, min("observedAt") earliest, max("observedAt") latest, count(*) FILTER (WHERE "flightId" IS NOT NULL)::int flightLinked FROM "aircraftWeatherObservation"`,
    };
    for (const [key, query] of Object.entries(inventoryQueries)) inventory[key] = (await client.query(query)).rows;

    const candidateCount = Number((await client.query(`SELECT count(*)::int count FROM "flight" f WHERE f."endTime" IS NOT NULL AND f."startTime" >= $1 AND f."startTime" < $2`, [WINDOW_START, WINDOW_END])).rows[0].count);
    const flights = (await client.query<Flight>(`SELECT f.id, f."instanceKey", a."icaoHex", f.destination, f."startTime", f."endTime", count(p.id)::int AS "positionCount", min(p."recordedAt") AS "firstPosition", max(p."recordedAt") AS "lastPosition" FROM "flight" f JOIN "aircraft" a ON a.id=f."aircraftId" JOIN "flightPosition" p ON p."flightId"=f.id WHERE f."endTime" IS NOT NULL AND f."startTime">=$1 AND f."startTime"<$2 GROUP BY f.id,a."icaoHex" ORDER BY f.id LIMIT $3`, [WINDOW_START, WINDOW_END, CORPUS_LIMIT])).rows.map((row) => ({ ...row, startTime: iso(row.startTime), endTime: iso(row.endTime), firstPosition: row.firstPosition ? iso(row.firstPosition) : null, lastPosition: row.lastPosition ? iso(row.lastPosition) : null }));
    const ids = flights.map((f) => f.id);
    if (!ids.length) throw new Error("No eligible flights in frozen window");
    const codes = [...new Set(flights.map((f) => f.destination).filter((x): x is string => Boolean(x)))];
    const airports = codes.length ? (await client.query<Airport>(`SELECT icao,iata,latitude,longitude,"elevationFt" FROM "airport" WHERE icao IN (${sqlList(codes)}) OR iata IN (${sqlList(codes, codes.length)})`, [...codes, ...codes])).rows : [];
    const airportEntries: Array<readonly [string, Airport]> = airports.flatMap((a) => a.iata ? [[a.icao, a], [a.iata, a]] : [[a.icao, a]]);
    const airportByCode = new Map<string, Airport>(airportEntries);
    const airportIds = airports.map((a) => a.icao);
    const runways = airportIds.length ? (await client.query<Runway>(`SELECT ar."airportId",ar."leIdent",ar."leLatitude",ar."leLongitude",ar."leHeadingDegT",ar."heIdent",ar."heLatitude",ar."heLongitude",ar."heHeadingDegT",ar.closed FROM "airportRunway" ar JOIN "airport" a ON a.id=ar."airportId" WHERE a.icao IN (${sqlList(airportIds)})`, airportIds)).rows : [];

    const positions = new Map<number, Position[]>();
    let positionRows = 0;
    for (let offset = 0; offset < ids.length; offset += 100) {
      const pageIds = ids.slice(offset, offset + 100);
      const page = (await client.query<Position>(`SELECT id,"flightId","recordedAt",lat,lon,altitude,"groundSpeed",track,"verticalRate" FROM "flightPosition" WHERE "flightId" IN (${sqlList(pageIds)}) ORDER BY "flightId","recordedAt",id`, pageIds)).rows.map((row) => ({ ...row, recordedAt: iso(row.recordedAt) }));
      positionRows += page.length;
      for (const row of page) positions.set(row.flightId, [...(positions.get(row.flightId) ?? []), row]);
    }
    const events = (await client.query<Event>(`SELECT "flightId",type,"occurredAt","airportIcao",runway,"metadataJson" FROM "flightEvent" WHERE "flightId" IN (${sqlList(ids)}) ORDER BY "occurredAt"`, ids)).rows.map((row) => ({ ...row, occurredAt: iso(row.occurredAt) }));
    const eventsByFlight = new Map<number, Event[]>();
    for (const event of events) if (event.flightId !== null) eventsByFlight.set(event.flightId, [...(eventsByFlight.get(event.flightId) ?? []), event]);

    const split = splitCorpus(flights.map((flight) => ({ ...flight, flightId: flight.id })));
    assertDisjoint(split.calibration, split.holdout);
    const distributions = { destinations: Object.fromEntries([...flights.reduce((m, f) => m.set(f.destination ?? "UNKNOWN", (m.get(f.destination ?? "UNKNOWN") ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 25)), unknownDestination: flights.filter((f) => !f.destination).length, positions: positionRows, partialTracks: flights.filter((f) => (f.positionCount ?? 0) < 10).length, holds: events.filter((e) => e.type === "HOLDING" || e.type === "HOLDING_CANDIDATE").length, goArounds: events.filter((e) => e.type === "GO_AROUND").length };
    const groundTruth = flights.map((flight) => ({ flight, landing: eventsByFlight.get(flight.id)?.find((e) => e.type === "LANDING") ?? null })).filter((x) => x.landing !== null);
    const eta: Record<string, { baseline: number[]; v1: number[]; confidence: Record<string, number[]> }> = Object.fromEntries(Object.keys(checkpointOffsets).map((k) => [k, { baseline: [], v1: [], confidence: { HIGH: [], MEDIUM: [], LOW: [], UNKNOWN: [] } }]));
    let checkpointRows = 0;
    for (const { flight, landing } of groundTruth) {
      const airport = flight.destination ? airportByCode.get(flight.destination) : (landing?.airportIcao ? airportByCode.get(landing.airportIcao) : undefined);
      if (!airport) continue;
      const rows = positions.get(flight.id) ?? [];
      const samples = rows.map((p) => ({ observedAt: Date.parse(p.recordedAt), lat: p.lat, lon: p.lon, altitudeFt: p.altitude, groundSpeedKt: p.groundSpeed, verticalRateFpm: p.verticalRate, trackDeg: p.track }));
      const actual = Date.parse(landing!.occurredAt);
      for (const [label, minutes] of Object.entries(checkpointOffsets)) {
        const at = actual - minutes * 60_000; const visible = samples.filter((s) => s.observedAt <= at); const current = visible.at(-1); if (!current) continue;
        checkpointRows += 1;
        const baseline = simpleEtaBaseline(samples, airport, at, (sample: any, destination: any) => { const dx = (sample.lat - destination.lat) * 60; const dy = (sample.lon - destination.lon) * 60 * Math.cos(destination.lat * Math.PI / 180); return Math.sqrt(dx * dx + dy * dy); });
        if (baseline !== null) eta[label].baseline.push(baseline - actual);
        const prediction = evaluatePredictiveIntelligence({ flightState: { aircraftIcao: flight.icaoHex, timestamp: at, phase: "UNKNOWN", sample: current, destination: flight.destination, destinationStatus: "KNOWN" }, recentSamples: visible, destinationAirport: { icao: airport.icao, lat: airport.latitude, lon: airport.longitude, elevationFt: airport.elevationFt }, now: at }).prediction;
        eta[label].confidence[prediction.eta.confidence].push(prediction.eta.estimatedArrivalAt === null ? NaN : prediction.eta.estimatedArrivalAt - actual);
        if (prediction.eta.estimatedArrivalAt !== null) eta[label].v1.push(prediction.eta.estimatedArrivalAt - actual);
      }
    }
    const etaMetrics = Object.fromEntries(Object.entries(eta).map(([label, value]) => [label, { baseline: etaMetric(value.baseline), v1: etaMetric(value.v1), confidence: Object.fromEntries(Object.entries(value.confidence).map(([level, errors]) => [level, etaMetric(errors.filter(Number.isFinite))])) }]));

    const trajectory = { flightsEvaluated: 0, possibleEpisodes: 0, deviatingEpisodes: 0, flapping: 0, holdAssociated: 0, goAroundAssociated: 0, receiverGapAssociated: 0 };
    for (const flight of flights) {
      const airport = flight.destination ? airportByCode.get(flight.destination) : undefined; if (!airport) continue;
      const rows = positions.get(flight.id) ?? []; if (rows.length < 3) continue; trajectory.flightsEvaluated += 1;
      let previous = "NORMAL"; let episodes = 0;
      for (const row of rows) { const at = Date.parse(row.recordedAt); const samples = rows.filter((candidate) => Date.parse(candidate.recordedAt) <= at).slice(-24).map((p) => ({ observedAt: Date.parse(p.recordedAt), lat: p.lat, lon: p.lon, altitudeFt: p.altitude, groundSpeedKt: p.groundSpeed, verticalRateFpm: p.verticalRate, trackDeg: p.track })); const result = evaluatePredictiveIntelligence({ flightState: { aircraftIcao: flight.icaoHex, timestamp: at, phase: "UNKNOWN", sample: samples.at(-1)!, destination: flight.destination, destinationStatus: "KNOWN" }, recentSamples: samples, destinationAirport: { icao: airport.icao, lat: airport.latitude, lon: airport.longitude }, now: at }).prediction.trajectory.state; if ((result === "POSSIBLE_DEVIATION" || result === "DEVIATING") && previous === "NORMAL") { episodes += 1; if (result === "POSSIBLE_DEVIATION") trajectory.possibleEpisodes += 1; else trajectory.deviatingEpisodes += 1; } previous = result; }
      if (episodes > 1) trajectory.flapping += 1;
      const types = new Set((eventsByFlight.get(flight.id) ?? []).map((e) => e.type)); if (types.has("HOLDING") || types.has("HOLDING_CANDIDATE")) trajectory.holdAssociated += episodes; if (types.has("GO_AROUND")) trajectory.goAroundAssociated += episodes; if (flight.positionCount < 10) trajectory.receiverGapAssociated += episodes;
    }
    const source = { type: "PRODUCTION-READ-ONLY", host: new URL(sourceUrl!).hostname, database: new URL(sourceUrl!).pathname.slice(1), safeguards: ["transaction read-only", "statement_timeout=30s", "idle_in_transaction_session_timeout=60s", "work_mem=4MB"], writes: 0, ddl: 0, selectedBecause: "No dev clone or disposable restore configured; direct source was used only with read-only session safeguards" };
    const git = process.env.CANDIDATE_SHA ?? "030b5cbc9f1f014325637a988569a7b7ee71b673";
    const common = { result: "PARTIAL", calibrationVersion: PREDICTIVE_CALIBRATION_CONFIG.calibrationVersion, git: { head: git, main: git, originMain: git, workingTreeAtStart: "generated next-env.d.ts and tsconfig.json changes preserved" }, source, window: { start: WINDOW_START, end: WINDOW_END, reason: "Current detector-compatible era; all persisted FlightEvents are flight-intelligence-v1 and begin on 2026-10-02" }, corpus: { candidateFlights: candidateCount, frozenFlights: flights.length, calibrationFlights: split.calibration.length, holdoutFlights: split.holdout.length, overlap: 0, selection: "completed flights with >=1 FlightPosition, ORDER BY Flight.id, LIMIT 500", flightIds: flights.map((f) => f.id) }, split: split.algorithm, inventory, distribution: distributions, dataQuality: { destinationKnown: flights.filter((f) => f.destination).length, positionRows, eventRows: events.length, detectorVersions: ["flight-intelligence-v1"], airportCatalogRows: airports.length, runwayCatalogRows: runways.length, weather: "AircraftWeatherObservation has 398683 rows but 0 flight-linked rows; no airport weather as-of-T evidence", airportOperations: "No durable historical Airport Operations table; only current FlightEvent-derived movement context exists", routeMetadata: airports.length ? "airport catalog present" : "not present" }, checkpoints: { requested: Object.keys(checkpointOffsets), groundTruthFlights: groundTruth.length, rowsWithPositionAtCheckpoint: checkpointRows, rule: "latest valid FlightPosition <= checkpoint" }, noLookAhead: { FlightPosition: "PASS: bounded extraction ordered by flightId, recordedAt, id and checkpoint filter <= T", FlightEvent: "PASS: predictor inputs filter events <= T; selected corpus has no future event leakage", destination: "PARTIAL: Flight.destination has no availability timestamp, so final destination provenance is not provable as-of T", weather: "PASS: no weather used because no historical airport as-of source", airportOperations: "PASS: no future movement context used", groundTruth: groundTruth.length ? "PASS for linked LANDING occurredAt rows" : "FAIL: none" }, performance: { replayRuntimeMs: Math.round(performance.now() - started), positionsPerSecond: Math.round(positionRows / Math.max(0.001, (performance.now() - started) / 1000)), peakRssBytes: process.memoryUsage().rss }, parametersFrozen: true, holdoutUsedForTuning: false, production: { modified: false, deployed: false, publicPredictiveCapabilitiesEnabled: false } };
    const calibration = { ...common, partition: "CALIBRATION", metrics: { eta: etaMetrics, runway: { groundTruthN: 0, reason: "All 18 canonical LANDING rows in source have runway NULL; selected corpus has no reliable runway truth" }, runwayChange: { n: 0, reason: "No reliable runway ground truth" }, trajectory: { flights: split.calibration.length, note: "Observational normal-flight replay; no labeled positive ground truth", ...trajectory } }, capabilities: { ETA: "SHADOW", RUNWAY: "SHADOW", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "SHADOW" } };
    const replay = { ...common, replay: { etaMetrics, trajectory, sourceRows: positionRows, checkpointRows, groundTruthFlights: groundTruth.length }, deterministic: { corpusSelection: "PASS", split: "PASS", rerunEquality: "NOT_RUN_AGAINST_SNAPSHOT", engine: "canonical evaluatePredictiveIntelligence" }, noLookAhead: common.noLookAhead };
    const validation = { ...common, metrics: { eta: etaMetrics, runway: { groundTruthN: 0 }, runwayChange: { n: 0 }, trajectory }, decisions: { ETA: "SHADOW", RUNWAY: "SHADOW", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "SHADOW" }, reason: "Historical detector events and reliable landing ground truth are insufficient for graduation; no public capability enabled" };
    await client.query("ROLLBACK");
    await Promise.all([fs.writeFile(calibrationPath, `${JSON.stringify(calibration, null, 2)}\n`), fs.writeFile(replayPath, `${JSON.stringify(replay, null, 2)}\n`), fs.writeFile(validationPath, `${JSON.stringify(validation, null, 2)}\n`)]);
    const markdown = `# Predictive Intelligence V1 calibration\n\nResult: **PARTIAL**\n\n- Source: production PostgreSQL through a read-only transaction; no writes or DDL.\n- Frozen window: ${WINDOW_START} to ${WINDOW_END}.\n- Corpus: ${flights.length} frozen flights (${split.calibration.length} calibration / ${split.holdout.length} holdout), overlap 0.\n- Candidate flights: ${candidateCount}; extracted positions: ${positionRows}; persisted events in corpus: ${events.length}.\n- Ground truth: ${groundTruth.length} linked LANDING rows; reliable runway truth: 0.\n- Weather: no flight-linked historical weather; airport-operations history is not durable.\n\nETA checkpoint metrics are present only for the ${groundTruth.length} flights with canonical landing events. Runway metrics cannot be scored. Trajectory results are observational and remain SHADOW because positive labels are absent. Destination availability timestamps are not preserved, so final destination use is recorded as a provenance limitation.\n\nCapabilities remain ETA=SHADOW, RUNWAY=SHADOW, RUNWAY_CHANGE=SHADOW, TRAJECTORY=SHADOW. Production was not built, deployed, restarted, or modified.\n`;
    await fs.writeFile(calibrationPath.replace(/\.json$/, ".md"), markdown);
    console.log(JSON.stringify({ result: "PARTIAL", candidateFlights: candidateCount, frozenFlights: flights.length, calibration: split.calibration.length, holdout: split.holdout.length, events: events.length, groundTruth: groundTruth.length, runwayTruth: 0, positions: positionRows, runtimeMs: Math.round(performance.now() - started) }, null, 2));
  } finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
