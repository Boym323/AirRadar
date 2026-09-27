#!/usr/bin/env node
import "dotenv/config";
import "temporal-polyfill/full/global";
import { closePrisma, getPrisma } from "../lib/server/db";

type Position = {
  id: number;
  flightId: number;
  recordedAt: Date | Temporal.Instant;
  altitude: number | null;
  verticalRate: number | null;
  flight: {
    callsign: string | null;
    aircraftType: string | null;
    aircraft: { icaoHex: string };
  };
};

type Neighbor = Position | null;

const AFFECTED_FROM = "2026-09-27T11:38:12+02:00";
const AFFECTED_UNTIL = "2026-09-27T12:28:52+02:00";
const HIGH_ALTITUDE_FT = 50_000;
const HIGH_CONFIDENCE_MIN_ALTITUDE_FT = 60_000;
const SURROUNDING_TOLERANCE_FT = 1_500;
const BUG_RATIO_MIN = 1.85;
const BUG_RATIO_MAX = 2.15;
const MAX_NEIGHBOR_GAP_SECONDS = 120;
const PHYSICAL_RATE_FT_PER_MIN = 5_000;

function arg(name: string): string | null {
  const argv = globalThis.process?.argv ?? [];
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

function dateArg(name: string, fallback: string): Date {
  const value = arg(name) ?? fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid ${name}: ${value}`);
  return date;
}

function time(value: Date | Temporal.Instant): number {
  return value instanceof Date ? value.getTime() : value.epochMilliseconds;
}

function iso(value: Date | Temporal.Instant): string {
  return new Date(time(value)).toISOString();
}

function bucket(altitude: number | null): string {
  if (altitude === null) return "NULL";
  if (altitude < 0) return "<0";
  if (altitude >= 90_000) return "90000+";
  const lower = Math.floor(altitude / 10_000) * 10_000;
  return `${lower}-${lower + 9_999}`;
}

function classify(previous: Neighbor, current: Position, next: Neighbor, affectedFrom: number, affectedUntil: number) {
  const currentTime = time(current.recordedAt);
  if (currentTime < affectedFrom || currentTime >= affectedUntil || current.altitude === null) return null;
  const altitude = current.altitude;
  const base = {
    altitude,
    previousAltitude: previous?.altitude ?? null,
    nextAltitude: next?.altitude ?? null,
    secondsPrev: previous ? (currentTime - time(previous.recordedAt)) / 1000 : null,
    secondsNext: next ? (time(next.recordedAt) - currentTime) / 1000 : null,
    impliedRatePrev: previous?.altitude !== null && previous?.altitude !== undefined && previous
      ? (altitude - previous.altitude) / ((currentTime - time(previous.recordedAt)) / 60_000)
      : null,
    impliedRateNext: next?.altitude !== null && next?.altitude !== undefined && next
      ? (next.altitude - altitude) / ((time(next.recordedAt) - currentTime) / 60_000)
      : null,
  };
  if (altitude < HIGH_ALTITUDE_FT) return { classification: "BELOW_HIGH_ALTITUDE", reason: "below 50000 ft", ...base };

  const previousAltitude = previous?.altitude;
  const nextAltitude = next?.altitude;
  const surrounding = previousAltitude !== null && previousAltitude !== undefined && nextAltitude !== null && nextAltitude !== undefined;
  const surroundingMean = surrounding ? (previousAltitude + nextAltitude) / 2 : null;
  const surroundingClose = surrounding && Math.abs(previousAltitude - nextAltitude) <= SURROUNDING_TOLERANCE_FT;
  const ratio = surroundingMean && surroundingMean > 0 ? altitude / surroundingMean : null;
  const shortGaps = base.secondsPrev !== null && base.secondsNext !== null && base.secondsPrev > 0 && base.secondsNext > 0 && base.secondsPrev <= MAX_NEIGHBOR_GAP_SECONDS && base.secondsNext <= MAX_NEIGHBOR_GAP_SECONDS;
  const impossibleRate = Number.isFinite(base.impliedRatePrev) && Number.isFinite(base.impliedRateNext) && Math.abs(base.impliedRatePrev ?? 0) >= PHYSICAL_RATE_FT_PER_MIN && Math.abs(base.impliedRateNext ?? 0) >= PHYSICAL_RATE_FT_PER_MIN;
  const largeJump = surrounding && Math.max(Math.abs(altitude - previousAltitude), Math.abs(nextAltitude - altitude)) >= 10_000;
  const knownDouble = Boolean(surroundingClose && shortGaps && ratio !== null && ratio >= BUG_RATIO_MIN && ratio <= BUG_RATIO_MAX);

  if (altitude >= HIGH_CONFIDENCE_MIN_ALTITUDE_FT && knownDouble && impossibleRate) {
    return { classification: "HIGH_CONFIDENCE_BUG", reason: "~2x surrounding altitude with impossible implied vertical rates", ratio, ...base };
  }
  if (altitude >= HIGH_CONFIDENCE_MIN_ALTITUDE_FT && knownDouble) {
    return { classification: "SUSPICIOUS", reason: "~2x surrounding altitude but rate evidence is incomplete", ratio, ...base };
  }
  if (altitude >= HIGH_ALTITUDE_FT && surroundingClose && shortGaps && largeJump) {
    return { classification: "POSSIBLE", reason: "high altitude with temporally close, stable neighbors", ratio, ...base };
  }
  return { classification: "PLAUSIBLE_HIGH_ALTITUDE", reason: "high altitude without the known temporal ~2x signature", ratio, ...base };
}

const db = getPrisma();
if (!db) throw new Error("DATABASE_URL is required");

const affectedFrom = dateArg("--from", AFFECTED_FROM).getTime();
const affectedUntil = dateArg("--to", AFFECTED_UNTIL).getTime();
const sampleLimit = Math.max(1, Math.min(200, Number.parseInt(arg("--samples") ?? "50", 10) || 50));
if (affectedUntil <= affectedFrom) throw new Error("--to must be later than --from");

const counts = { scanned: 0, nullAltitude: 0, gt50k: 0, gt60k: 0, gt70k: 0, gt80k: 0, gt90k: 0, gt100k: 0 };
const distribution = new Map<string, number>();
const classifications = new Map<string, number>();
const days = new Map<string, { total: number; suspicious: number; highConfidence: number }>();
const affectedFlights = new Set<number>();
const affectedIcao = new Set<string>();
const topFlights = new Map<number, number>();
const topAircraft = new Map<string, number>();
const topExamples: Array<Record<string, unknown>> = [];
let scopedPositions = 0;
let databaseMin: string | null = null;
let databaseMax: string | null = null;
let databaseMinAltitude: number | null = null;
let databaseMaxAltitude: number | null = null;

function bump(map: Map<string, number>, key: string, amount = 1) { map.set(key, (map.get(key) ?? 0) + amount); }
function process(current: Position, previous: Neighbor, next: Neighbor) {
  scopedPositions += 1;
  const altitude = current.altitude;
  if (altitude !== null) bump(distribution, bucket(altitude));
  const recorded = time(current.recordedAt);
  if (recorded >= affectedFrom && recorded < affectedUntil) {
    const day = iso(current.recordedAt).slice(0, 10);
    const row = days.get(day) ?? { total: 0, suspicious: 0, highConfidence: 0 };
    row.total += 1;
    days.set(day, row);
  }
  const result = classify(previous, current, next, affectedFrom, affectedUntil);
  if (!result || result.classification === "BELOW_HIGH_ALTITUDE") return;
  const day = iso(current.recordedAt).slice(0, 10);
  const row = days.get(day) ?? { total: 0, suspicious: 0, highConfidence: 0 };
  if (result.classification === "SUSPICIOUS" || result.classification === "HIGH_CONFIDENCE_BUG" || result.classification === "POSSIBLE") row.suspicious += 1;
  if (result.classification === "HIGH_CONFIDENCE_BUG") row.highConfidence += 1;
  days.set(day, row);
  if (result.classification === "HIGH_CONFIDENCE_BUG" || result.classification === "SUSPICIOUS" || result.classification === "POSSIBLE") {
    affectedFlights.add(current.flightId);
    affectedIcao.add(current.flight.aircraft.icaoHex);
    topFlights.set(current.flightId, (topFlights.get(current.flightId) ?? 0) + 1);
    bump(topAircraft, current.flight.aircraft.icaoHex);
  }
  bump(classifications, result.classification);
  if (topExamples.length < sampleLimit && (result.classification === "HIGH_CONFIDENCE_BUG" || result.classification === "SUSPICIOUS" || result.classification === "POSSIBLE")) {
    topExamples.push({ timestamp: iso(current.recordedAt), flightId: current.flightId, icao: current.flight.aircraft.icaoHex, callsign: current.flight.callsign, aircraftType: current.flight.aircraftType, verticalRate: current.verticalRate, ...result });
  }
}

const allPositions = db.orm.public.FlightPosition;
const allBaseline = await allPositions.aggregate((aggregate) => ({
  total: aggregate.count(),
  minRecordedAt: aggregate.min("recordedAt"),
  maxRecordedAt: aggregate.max("recordedAt"),
  minAltitude: aggregate.min("altitude"),
  maxAltitude: aggregate.max("altitude"),
}));
const count = (collection: typeof allPositions) => collection.aggregate((aggregate) => ({ value: aggregate.count() })).then((row) => Number(row.value));
const [nullAltitude, gt50k, gt60k, gt70k, gt80k, gt90k, gt100k] = await Promise.all([
  count(allPositions.where((position) => position.altitude.isNull())),
  count(allPositions.where((position) => position.altitude.gt(50_000))),
  count(allPositions.where((position) => position.altitude.gt(60_000))),
  count(allPositions.where((position) => position.altitude.gt(70_000))),
  count(allPositions.where((position) => position.altitude.gt(80_000))),
  count(allPositions.where((position) => position.altitude.gt(90_000))),
  count(allPositions.where((position) => position.altitude.gt(100_000))),
]);
counts.scanned = Number(allBaseline.total);
counts.nullAltitude = nullAltitude;
counts.gt50k = gt50k;
counts.gt60k = gt60k;
counts.gt70k = gt70k;
counts.gt80k = gt80k;
counts.gt90k = gt90k;
counts.gt100k = gt100k;
databaseMin = allBaseline.minRecordedAt ? iso(allBaseline.minRecordedAt) : null;
databaseMax = allBaseline.maxRecordedAt ? iso(allBaseline.maxRecordedAt) : null;
databaseMinAltitude = allBaseline.minAltitude;
databaseMaxAltitude = allBaseline.maxAltitude;

let previous: Position | null = null;
let current: Position | null = null;
let currentFlightId: number | null = null;
const batchSize = 5_000;
let offset = 0;
const scanFrom = new Date(affectedFrom - 5 * 60_000);
const scanUntil = new Date(affectedUntil + 5 * 60_000);
for (;;) {
  // Prisma Next's current `.all()` terminal buffers a page. Keep pages small
  // and bounded; the composite order follows @@index([flightId, recordedAt]).
  const page = await db.orm.public.FlightPosition
    .select("id", "flightId", "recordedAt", "altitude", "verticalRate")
    .include("flight", (flight) => flight.select("callsign", "aircraftType").include("aircraft", (aircraft) => aircraft.select("icaoHex")))
    .where((position) => position.recordedAt.gte(Temporal.Instant.fromEpochMilliseconds(scanFrom.getTime())))
    .where((position) => position.recordedAt.lt(Temporal.Instant.fromEpochMilliseconds(scanUntil.getTime())))
    .orderBy([(position) => position.flightId.asc(), (position) => position.recordedAt.asc(), (position) => position.id.asc()])
    .offset(offset)
    .limit(batchSize)
    .all() as Position[];
  if (page.length === 0) break;
  for (const row of page) {
    if (currentFlightId !== row.flightId) {
      if (current) process(current, previous, null);
      previous = null;
      current = row;
      currentFlightId = row.flightId;
      continue;
    }
    if (current) process(current, previous, row);
    previous = current;
    current = row;
  }
  offset += page.length;
  if (page.length < batchSize) break;
}
if (current) process(current, previous, null);

const flightRows = await db.orm.public.Flight
  .select("id", "maxAltitude")
  .where((flight) => flight.maxAltitude.gt(HIGH_ALTITUDE_FT))
  .all();
const maxAltitudeCounts = { gt50k: flightRows.length, gt60k: flightRows.filter((row) => (row.maxAltitude ?? 0) > 60_000).length, gt70k: flightRows.filter((row) => (row.maxAltitude ?? 0) > 70_000).length, gt80k: flightRows.filter((row) => (row.maxAltitude ?? 0) > 80_000).length };

const sortMap = (map: Map<string | number, number>) => Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20));
console.log(JSON.stringify({
  readOnly: true,
  generatedAt: new Date().toISOString(),
  affectedPeriod: { from: new Date(affectedFrom).toISOString(), untilExclusive: new Date(affectedUntil).toISOString() },
  databaseRange: { minRecordedAt: databaseMin, maxRecordedAt: databaseMax, minAltitude: databaseMinAltitude, maxAltitude: databaseMaxAltitude },
  positionsScanned: scopedPositions,
  altitudeBaseline: counts,
  histogram: Object.fromEntries([...distribution.entries()].sort()),
  classification: Object.fromEntries(classifications),
  impactedEntities: { affectedFlightPosition: [...classifications.entries()].filter(([key]) => key !== "PLAUSIBLE_HIGH_ALTITUDE" && key !== "BELOW_HIGH_ALTITUDE").reduce((n, [, value]) => n + value, 0), affectedFlights: affectedFlights.size, affectedIcao: affectedIcao.size, affectedDays: days.size },
  daily: Object.fromEntries([...days.entries()].sort()),
  topFlights: sortMap(topFlights),
  topAircraft: sortMap(topAircraft),
  maxAltitudeFlights: maxAltitudeCounts,
  topExamples,
  provenance: "Historical FlightPosition does not preserve sufficient provenance to identify the source directly.",
  rawReference: { available: false, note: "No raw Beast/readsb history was found in the configured local filesystem; output altitude was not reverse-engineered into a raw frame." },
  repairability: { exactReference: 0, rawRedecode: 0, interpolationOnly: "requires per-point review", notSafelyRepairable: "all candidates until an independent reference is supplied" },
  safety: "No INSERT, UPDATE, DELETE, migration, backfill, or statistics rebuild is performed.",
}, null, 2));

await closePrisma();
