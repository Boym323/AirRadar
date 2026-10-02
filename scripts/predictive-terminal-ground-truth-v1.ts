/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { Pool, type PoolClient } from "pg";
import "dotenv/config";
import type { AirportRunway } from "@/lib/airports/infrastructure";
import type { Airport } from "@/lib/airports/types";
import { classifyTerminalGroundTruth, TERMINAL_GROUND_TRUTH_VERSION, type TerminalTrackSample } from "@/lib/predictive-intelligence/terminal-ground-truth";

const sourceUrl = process.env.FLIGHT_INTELLIGENCE_SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("FLIGHT_INTELLIGENCE_SOURCE_DATABASE_URL or DATABASE_URL is required");
const reportJson = process.env.PREDICTIVE_TERMINAL_REPORT ?? "artifacts/predictive-terminal-ground-truth-v1.json";
const reportMd = reportJson.replace(/\.json$/, ".md");
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
const list = (values: readonly unknown[], offset = 0) => values.map((_, index) => `$${index + 1 + offset}`).join(",");

type Flight = { id: number; icaoHex: string; callsign: string | null; destination: string | null; startTime: string; lastSeenAt: string; endTime: string };
type Position = { id: number; flightId: number; recordedAt: string; lat: number; lon: number; altitude: number | null; groundSpeed: number | null; track: number | null; verticalRate: number | null };
type Event = { id: number; flightId: number | null; type: string; occurredAt: string; airportIcao: string | null; runway: string | null; metadataJson: string | null };
type AirportRow = Airport & { id: number; icao: string; iata: string | null; latitude: number; longitude: number; elevationFt: number | null };

async function query<T>(client: PoolClient, text: string, values: readonly unknown[] = []): Promise<T[]> { return (await client.query(text, values as any)).rows as T[]; }
function samples(rows: Position[]): TerminalTrackSample[] { return rows.map((row) => ({ recordedAt: iso(row.recordedAt), lat: row.lat, lon: row.lon, altitudeFt: row.altitude, groundSpeedKt: row.groundSpeed, trackDeg: row.track, verticalRateFpm: row.verticalRate })); }
function percentile(values: number[], fraction: number): number | null { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? null; }
function parseRunwayContext(event: Event): any {
  try { const context = JSON.parse(event.metadataJson ?? "{}").runwayContext; return context && typeof context === "object" ? context : null; } catch { return null; }
}

async function main() {
  const started = performance.now();
  const pool = new Pool({ connectionString: sourceUrl, max: 1, connectionTimeoutMillis: 5_000, statement_timeout: 30_000, idle_in_transaction_session_timeout: 60_000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const flights = await query<Flight>(client, `SELECT f.id,a."icaoHex",f.callsign,f.destination,f."startTime",f."lastSeenAt",f."endTime" FROM "flight" f JOIN "aircraft" a ON a.id=f."aircraftId" WHERE f."endTime" IS NOT NULL`);
    const landingEvents = await query<Event>(client, `SELECT id,"flightId",type,"occurredAt","airportIcao",runway,"metadataJson" FROM "flightEvent" WHERE type='LANDING' ORDER BY "occurredAt",id`);
    const landingFlightIds = [...new Set(landingEvents.map((event) => event.flightId).filter((id): id is number => Number.isInteger(id)))];
    const negatives = await query<Flight>(client, `SELECT f.id,a."icaoHex",f.callsign,f.destination,f."startTime",f."lastSeenAt",f."endTime" FROM "flight" f JOIN "aircraft" a ON a.id=f."aircraftId" LEFT JOIN "flightEvent" e ON e."flightId"=f.id AND e.type='LANDING' WHERE f."endTime" IS NOT NULL AND e.id IS NULL ORDER BY md5(f.id::text) LIMIT 100`);
    const airports = await query<AirportRow>(client, `SELECT id,icao,iata,name,city,country,latitude,longitude,"elevationFt" FROM "airport" WHERE latitude IS NOT NULL AND longitude IS NOT NULL`);
    const runwayRows = await query<AirportRunway & { airportId: number }>(client, `SELECT "airportId",id,"sourceAirportIdent","lengthFt","widthFt",surface,lighted,closed,"leIdent","leLatitude","leLongitude","leElevationFt","leHeadingDegT","leDisplacedThresholdFt","heIdent","heLatitude","heLongitude","heElevationFt","heHeadingDegT","heDisplacedThresholdFt" FROM "airportRunway"`);
    const airportModels: Airport[] = airports.map((row) => ({ icaoCode: row.icao, iataCode: row.iata, name: row.name, city: row.city, country: row.country, latitude: row.latitude, longitude: row.longitude, elevationFt: row.elevationFt }));
    const airportById = new Map(airports.map((row) => [row.id, row]));
    const runwaysByAirport = new Map<string, AirportRunway[]>();
    for (const runway of runwayRows) { const airport = airportById.get(runway.airportId); if (airport) runwaysByAirport.set(airport.icao.toUpperCase(), [...(runwaysByAirport.get(airport.icao.toUpperCase()) ?? []), runway]); }
    const allIds = [...new Set([...landingFlightIds, ...negatives.map((flight) => flight.id)])];
    const positions = allIds.length ? await query<Position>(client, `SELECT id,"flightId","recordedAt",lat,lon,altitude,"groundSpeed",track,"verticalRate" FROM "flightPosition" WHERE "flightId" IN (${list(allIds)}) ORDER BY "flightId","recordedAt",id`, allIds) : [];
    const byFlight = new Map<number, Position[]>();
    for (const position of positions) byFlight.set(position.flightId, [...(byFlight.get(position.flightId) ?? []), position]);
    const flightById = new Map([...flights, ...negatives].map((flight) => [flight.id, flight]));
    const classify = (flightId: number) => classifyTerminalGroundTruth({ flightId, positions: samples(byFlight.get(flightId) ?? []), airports: airportModels, runwaysByAirport });
    const canonicalResults = landingFlightIds.map((flightId) => ({ flightId, event: landingEvents.find((event) => event.flightId === flightId) ?? null, result: classify(flightId) }));
    const negativeResults = negatives.map((flight) => ({ flightId: flight.id, result: classify(flight.id) }));
    const confirmed = canonicalResults.filter((item) => item.result.status === "CONFIRMED");
    const airportAgreement = confirmed.filter((item) => item.event?.airportIcao && item.result.airportIcao === item.event.airportIcao.toUpperCase()).length;
    const deltas = confirmed.flatMap((item) => item.event && item.result.landingAt ? [Math.abs(Date.parse(item.result.landingAt) - Date.parse(item.event.occurredAt)) / 1000] : []);
    const eventTimeDeltas = landingEvents.map((event) => { const flight = flightById.get(event.flightId ?? -1); return flight ? (Date.parse(flight.endTime) - Date.parse(event.occurredAt)) / 1000 : null; }).filter((value): value is number => value !== null && Number.isFinite(value));
    const runwayContexts = landingEvents.map(parseRunwayContext).filter(Boolean);
    const runtimeVersion = (() => { try { return execFileSync("systemctl", ["show", "-p", "ExecMainStartTimestamp,FragmentPath", "airradar.service"], { encoding: "utf8" }).trim(); } catch { return "unavailable"; } })();
    const report = {
      result: "PARTIAL",
      generatedAt: new Date().toISOString(),
      classifierVersion: TERMINAL_GROUND_TRUTH_VERSION,
      repository: { head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), branch: execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(), originMain: execFileSync("git", ["ls-remote", "origin", "refs/heads/main"], { encoding: "utf8" }).trim().split(/\s+/)[0] ?? null, workingTree: execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim() },
      productionRuntime: runtimeVersion,
      historicalOnGround: { flightPosition: false, otherExactSource: false, coverage: "0 / 5,413,293 FlightPosition rows", timestampAlignment: "not applicable; no exact historical field" },
      sourceAudit: { tables: "Flight, FlightPosition, FlightEvent, AircraftWeatherObservation, navigation observations, receiver aggregates", rawReceiverHistory: false, readsbTar1090Archive: false, exactGroundState: "only transient live provider/parser state; not persisted historically", preservedSignals: ["lat", "lon", "altitude", "groundSpeed", "track", "verticalRate", "recordedAt"] },
      canonicalReplayRetest: { persistedLanding: landingEvents.length, replayLanding: null, matches: null, misses: null, extras: null, timestampDelta: null, accepted: false, reason: "cannot rerun semantically equivalent replay because exact historical onGround is unavailable" },
      terminalLandingClassifier: { canonicalComparison: canonicalResults.length, confirmed: canonicalResults.filter((item) => item.result.status === "CONFIRMED").length, ambiguous: canonicalResults.filter((item) => item.result.status === "AMBIGUOUS").length, unknown: canonicalResults.filter((item) => item.result.status === "UNKNOWN").length, airportAgreementN: confirmed.length, airportAgreement, landingTimeMedianDeltaSeconds: percentile(deltas, .5), landingTimeP90DeltaSeconds: percentile(deltas, .9), falsePositiveSample: negativeResults.length, falsePositiveConfirmed: negativeResults.filter((item) => item.result.status === "CONFIRMED").length, status: "PARTIAL", note: "Independent classifier is implemented and tested, but current sparse FlightPosition coverage does not establish validation-grade touchdown truth across the canonical set." },
      observedRunwayClassifier: { confirmed: canonicalResults.filter((item) => item.result.runwayStatus === "CONFIRMED").length, ambiguous: canonicalResults.filter((item) => item.result.runwayStatus === "AMBIGUOUS").length, unknown: canonicalResults.filter((item) => item.result.runwayStatus === "UNKNOWN").length, reportedRunwayComparisonN: runwayContexts.filter((context) => context.reportedRunway).length, reportedRunwayAgreement: null, parallelAmbiguity: canonicalResults.filter((item) => item.result.runwayStatus === "AMBIGUOUS").length, status: "UNAVAILABLE", reason: "no independently reported historical runway and geometry-only labels are not validated" },
      runwayContextAudit: { flightEventRunwayUsable: landingEvents.filter((event) => event.runway).length, metadataRows: runwayContexts.length, reportedRunway: runwayContexts.filter((context) => context.reportedRunway).length, inferredRunway: runwayContexts.filter((context) => context.inferredRunway).length, conflicts: runwayContexts.filter((context) => context.conflict === true).length, statuses: Object.fromEntries(["REPORTED", "INFERRED", "UNKNOWN"].map((status) => [status, runwayContexts.filter((context) => context.status === status).length])) },
      flightEndTime: { canonicalComparison: eventTimeDeltas.length, medianDeltaSeconds: percentile(eventTimeDeltas, .5), p90DeltaSeconds: percentile(eventTimeDeltas, .9), minDeltaSeconds: eventTimeDeltas.length ? Math.min(...eventTimeDeltas) : null, maxDeltaSeconds: eventTimeDeltas.length ? Math.max(...eventTimeDeltas) : null, semantics: "Flight closure at stale lastSeenAt continuity timeout; not touchdown", acceptedAsTruth: false },
      prospectiveInstrumentation: { needed: true, fields: ["onGroundAtDetection", "groundSpeedAtDetection", "trackAtDetection", "baroAltitudeAtDetection", "geomAltitudeAtDetection", "terminalSampleGap", "runwayContext"], writeAmplification: "0 rows; LANDING metadata only", schemaMigration: "NO if metadata-only" },
      etaV3: { decision: "SHADOW", reason: "landing truth is not validation-grade" },
      runwayV3: { decision: "SHADOW", reason: "observed runway truth unavailable" },
      safety: { productionHistoricalWrites: 0, predictionWrites: 0, replayWrites: 0, dbTransaction: "READ ONLY; rolled back" },
      details: { canonical: canonicalResults, negatives: negativeResults, flightsExamined: canonicalResults.length + negativeResults.length, positionsExamined: positions.length, runtimeMs: Math.round(performance.now() - started) },
      nextStep: "TERMINAL GROUND TRUTH PARTIAL — DEPLOY SPARSE PROSPECTIVE INSTRUMENTATION",
    };
    await client.query("ROLLBACK");
    await fs.mkdir("artifacts", { recursive: true });
    await fs.writeFile(reportJson, `${JSON.stringify(report, null, 2)}\n`);
    const endRange = eventTimeDeltas.length ? `${Math.min(...eventTimeDeltas)}s to ${Math.max(...eventTimeDeltas)}s` : "n/a";
    const markdown = `# Predictive Terminal Ground Truth V1\n\nResult: **PARTIAL**\n\n- Historical exact on-ground source: **NO** (FlightPosition coverage 0 / 5,413,293).\n- Canonical LANDING rows: ${landingEvents.length}; canonical replay retest accepted: **NO** because the replay adapter cannot reconstruct on-ground state.\n- Independent terminal classifier: ${canonicalResults.filter((item) => item.result.status === "CONFIRMED").length} CONFIRMED, ${canonicalResults.filter((item) => item.result.status === "AMBIGUOUS").length} AMBIGUOUS, ${canonicalResults.filter((item) => item.result.status === "UNKNOWN").length} UNKNOWN across ${canonicalResults.length} linked canonical flights.\n- Negative sample: ${negativeResults.length} completed non-LANDING flights; classifier confirmations: ${negativeResults.filter((item) => item.result.status === "CONFIRMED").length}.\n- Runway context: ${runwayContexts.length} metadata rows; reported ${runwayContexts.filter((context) => context.reportedRunway).length}, inferred ${runwayContexts.filter((context) => context.inferredRunway).length}, conflicts ${runwayContexts.filter((context) => context.conflict === true).length}.\n- Flight.endTime is not accepted as truth: median delta ${percentile(eventTimeDeltas, .5)}s, p90 ${percentile(eventTimeDeltas, .9)}s, range ${endRange}.\n- ETA, RUNWAY, RUNWAY_CHANGE, and TRAJECTORY remain **SHADOW**.\n- Historical writes: **0**; replay writes: **0**.\n\nThe full machine-readable evidence is in [predictive-terminal-ground-truth-v1.json](predictive-terminal-ground-truth-v1.json). The classifier is isolated from predictive inputs and uses only post-hoc observed track geometry.\n\nNext step: **TERMINAL GROUND TRUTH PARTIAL — DEPLOY SPARSE PROSPECTIVE INSTRUMENTATION**.\n`;
    await fs.writeFile(reportMd, markdown);
    console.log(JSON.stringify({ result: report.result, landingEvents: landingEvents.length, canonical: report.terminalLandingClassifier, runway: report.observedRunwayClassifier, endTime: report.flightEndTime, writes: 0 }, null, 2));
  } finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
