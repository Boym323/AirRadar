#!/usr/bin/env node
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { Client } from "pg";

type Row = {
  id: number; flightId: number; recordedAt: Date; altitude: number | null; verticalRate: number | null;
  groundSpeed: number | null; lat: number; lon: number;
  icao: string; callsign: string | null; aircraftType: string | null; registration: string | null;
  flightMaxAltitude: number | null; previousAltitude: number | null; nextAltitude: number | null;
  previousRecordedAt: Date | null; nextRecordedAt: Date | null;
};
type Profile = Record<string, unknown>;

const KNOWN_FROM = Date.parse("2026-09-27T11:38:12+02:00");
const KNOWN_UNTIL = Date.parse("2026-09-27T12:28:52+02:00");
const MIN_DEFAULT = 50_000;
const OUT = "artifacts";

function arg(name: string, fallback: string | null = null): string | null {
  const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
}
function iso(value: Date | null): string | null { return value ? value.toISOString() : null; }
function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
function csv(rows: Record<string, unknown>[]): string {
  const keys = Object.keys(rows[0] ?? { empty: null });
  return [keys.join(","), ...rows.map((r) => keys.map((k) => csvValue(r[k])).join(",")), ""].join("\n");
}
function bucket(value: number): string {
  if (value > 100_000) return "100k+";
  const lower = Math.floor(value / 10_000) * 10_000;
  return `${lower}-${lower + 9_999}`;
}
function rate(a: number | null, b: number | null, seconds: number | null): number | null {
  return a !== null && b !== null && seconds !== null && seconds > 0 ? (b - a) / (seconds / 60) : null;
}
function median(values: number[]): number | null {
  if (!values.length) return null; const x = [...values].sort((a, b) => a - b); return x[Math.floor(x.length / 2)] ?? null;
}
function classify(rows: Row[], outsideKnown: Row[]): Profile {
  const extreme = outsideKnown.filter((r) => (r.altitude ?? 0) > 80_000);
  const values = outsideKnown.flatMap((r) => r.altitude === null ? [] : [r.altitude]);
  const highValues = extreme.flatMap((r) => r.altitude === null ? [] : [r.altitude]);
  const rates: number[] = [];
  let impossible = false; let doublePattern = false; let unitPattern = false;
  for (const r of extreme) {
    const prevSeconds = r.previousRecordedAt ? (r.recordedAt.getTime() - r.previousRecordedAt.getTime()) / 1000 : null;
    const nextSeconds = r.nextRecordedAt ? (r.nextRecordedAt.getTime() - r.recordedAt.getTime()) / 1000 : null;
    const prevRate = rate(r.previousAltitude, r.altitude, prevSeconds);
    const nextRate = rate(r.altitude, r.nextAltitude, nextSeconds);
    if (prevRate !== null) rates.push(Math.abs(prevRate)); if (nextRate !== null) rates.push(Math.abs(nextRate));
    if (prevRate !== null && nextRate !== null && Math.max(Math.abs(prevRate), Math.abs(nextRate)) > 10_000) impossible = true;
    const neighbors = [r.previousAltitude, r.nextAltitude].filter((x): x is number => x !== null && x > 0);
    if (neighbors.length === 2) {
      const mean = (neighbors[0] + neighbors[1]) / 2; const ratio = r.altitude! / mean;
      if (Math.abs(neighbors[0] - neighbors[1]) <= 1_500 && ratio >= 1.85 && ratio <= 2.15) doublePattern = true;
      if ((Math.abs(r.altitude! - mean * 3.28084) / r.altitude! < .02) || (Math.abs(r.altitude! - mean / 3.28084) / r.altitude! < .02)) unitPattern = true;
    }
  }
  const first = extreme[0]; const last = extreme.at(-1);
  const durationSeconds = first && last ? (last.recordedAt.getTime() - first.recordedAt.getTime()) / 1000 : 0;
  const aircraft = (rows[0]?.aircraftType ?? "").toUpperCase();
  const special = /BALLOON|GLIDER|UAV|DRONE|MIL|TANKER|RECON|FIGHTER|XB|HIGH/.test(aircraft);
  const sustained = extreme.length >= 4 || durationSeconds >= 300;
  let classification = "UNKNOWN";
  if ((doublePattern && impossible) || (highValues.some((x) => x > 150_000) && extreme.length <= 2)) classification = "CONFIRMED_OR_NEAR_CERTAIN_BUG";
  else if (impossible || unitPattern || extreme.length === 1) classification = "HIGHLY_SUSPICIOUS";
  else if (sustained && special && rates.every((x) => x <= 10_000)) classification = "LIKELY_LEGITIMATE";
  else if (sustained && rates.every((x) => x <= 10_000)) classification = "POSSIBLE";
  const pattern = doublePattern ? "PATTERN_A_DOUBLE_ALTITUDE" : unitPattern ? "PATTERN_D_POSSIBLE_UNIT_ERROR" : extreme.length === 1 ? "PATTERN_B_SINGLE_RANDOM_SPIKE" : sustained ? (classification === "LIKELY_LEGITIMATE" ? "PATTERN_E_LEGITIMATE_HIGH_ALTITUDE" : "PATTERN_C_SUSTAINED_EXTREME") : "UNKNOWN";
  return { flightId: rows[0]?.flightId, icao: rows[0]?.icao, callsign: rows[0]?.callsign, aircraftType: rows[0]?.aircraftType, registration: rows[0]?.registration,
    startTime: iso(rows[0]?.recordedAt ?? null), endTime: iso(rows.at(-1)?.recordedAt ?? null), flightMaxAltitude: rows[0]?.flightMaxAltitude,
    numberOfPositions: rows.length, numberOfAltitudeValues: values.length, normalAltitudeRange: values.length ? `${Math.min(...values)}-${Math.max(...values)}` : null,
    extremeAltitudeCount: extreme.length, firstExtremeTimestamp: iso(first?.recordedAt ?? null), lastExtremeTimestamp: iso(last?.recordedAt ?? null), durationExtremeSeconds: durationSeconds,
    maxExtremeAltitude: highValues.length ? Math.max(...highValues) : null, maxSupport: extreme.length === 1 ? "MAX_FROM_SINGLE_POINT" : extreme.length <= 3 ? "MAX_FROM_SHORT_SEGMENT" : "MAX_FROM_SUSTAINED_SEGMENT",
    classification, pattern, impossibleTemporalJump: impossible, doubleAltitudeSignature: doublePattern, possibleUnitSignature: unitPattern, medianAbsImpliedRate: median(rates) };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL; if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const minAltitude = Number(arg("--min-altitude", String(MIN_DEFAULT))); const limit = Number(arg("--limit", "0"));
  const from = arg("--from") ? new Date(arg("--from")!) : null; const to = arg("--to") ? new Date(arg("--to")!) : null;
  if (!Number.isFinite(minAltitude) || (from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime()))) throw new Error("Invalid arguments");
  const client = new Client({ connectionString: databaseUrl }); await client.connect();
  try {
    const baseline = await client.query(`SELECT COUNT(*)::int AS positions, COUNT(*) FILTER (WHERE altitude IS NULL)::int AS null_altitude,
      COUNT(*) FILTER (WHERE altitude > 50000)::int AS gt50k, COUNT(*) FILTER (WHERE altitude > 60000)::int AS gt60k,
      COUNT(*) FILTER (WHERE altitude > 70000)::int AS gt70k, COUNT(*) FILTER (WHERE altitude > 80000)::int AS gt80k,
      COUNT(*) FILTER (WHERE altitude > 90000)::int AS gt90k, COUNT(*) FILTER (WHERE altitude > 100000)::int AS gt100k,
      MIN("recordedAt") AS first_recorded_at, MAX("recordedAt") AS last_recorded_at, MIN(altitude) AS min_altitude, MAX(altitude) AS max_altitude FROM "flightPosition"`);
    const flightBaseline = await client.query(`SELECT COUNT(*) FILTER (WHERE "maxAltitude" > 50000)::int AS gt50k, COUNT(*) FILTER (WHERE "maxAltitude" > 60000)::int AS gt60k,
      COUNT(*) FILTER (WHERE "maxAltitude" > 70000)::int AS gt70k, COUNT(*) FILTER (WHERE "maxAltitude" > 80000)::int AS gt80k,
      COUNT(*) FILTER (WHERE "maxAltitude" > 90000)::int AS gt90k, COUNT(*) FILTER (WHERE "maxAltitude" > 100000)::int AS gt100k FROM "flight"`);
    const params: unknown[] = [minAltitude]; const filters = [`o.altitude > $1`];
    if (from) { params.push(from); filters.push(`o.recorded_at >= $${params.length}`); } if (to) { params.push(to); filters.push(`o.recorded_at < $${params.length}`); }
    const sql = `WITH ordered AS (SELECT p.id, p."flightId", p."recordedAt" AS recorded_at, p.altitude, p."verticalRate" AS vertical_rate, p."groundSpeed" AS ground_speed, p.lat, p.lon,
      LAG(p.altitude) OVER w AS previous_altitude, LEAD(p.altitude) OVER w AS next_altitude, LAG(p."recordedAt") OVER w AS previous_recorded_at, LEAD(p."recordedAt") OVER w AS next_recorded_at
      FROM "flightPosition" p WINDOW w AS (PARTITION BY p."flightId" ORDER BY p."recordedAt", p.id))
      SELECT o.*, f.callsign, f."aircraftType" AS aircraft_type, f.registration AS flight_registration, f."maxAltitude" AS flight_max_altitude,
        a."icaoHex" AS icao, a.registration AS aircraft_registration FROM ordered o JOIN "flight" f ON f.id=o."flightId" JOIN "aircraft" a ON a.id=f."aircraftId"
      WHERE ${[`(o.altitude > $1 OR f."maxAltitude" > 80000)`, ...filters.slice(1)].join(" AND ")} ORDER BY o."flightId", o.recorded_at, o.id${limit > 0 ? ` LIMIT ${Math.floor(limit)}` : ""}`;
    const result = await client.query(sql, params);
    const rows: Row[] = result.rows.map((r) => ({ id: r.id, flightId: r.flightId, recordedAt: new Date(r.recorded_at), altitude: r.altitude, verticalRate: r.vertical_rate, groundSpeed: r.ground_speed, lat: r.lat, lon: r.lon, icao: r.icao, callsign: r.callsign, aircraftType: r.aircraft_type, registration: r.flight_registration ?? r.aircraft_registration, flightMaxAltitude: r.flight_max_altitude, previousAltitude: r.previous_altitude, nextAltitude: r.next_altitude, previousRecordedAt: r.previous_recorded_at ? new Date(r.previous_recorded_at) : null, nextRecordedAt: r.next_recorded_at ? new Date(r.next_recorded_at) : null }));
    const groups = new Map<number, Row[]>(); for (const row of rows) (groups.get(row.flightId) ?? (groups.set(row.flightId, []), groups.get(row.flightId)!)).push(row);
    const profiles: Profile[] = []; const points: Record<string, unknown>[] = []; const patterns = new Map<string, number>(); const classes = new Map<string, number>();
    for (const group of groups.values()) {
      const outside = group.filter((r) => r.recordedAt.getTime() < KNOWN_FROM || r.recordedAt.getTime() >= KNOWN_UNTIL); const profile = classify(group, outside); profiles.push(profile);
      if (Number(profile.flightMaxAltitude) > 80000 || (profile.extremeAltitudeCount as number) > 0) { patterns.set(String(profile.pattern), (patterns.get(String(profile.pattern)) ?? 0) + 1); classes.set(String(profile.classification), (classes.get(String(profile.classification)) ?? 0) + 1); }
      for (const r of group.filter((x) => (x.altitude ?? 0) >= minAltitude && (x.recordedAt.getTime() < KNOWN_FROM || x.recordedAt.getTime() >= KNOWN_UNTIL))) {
        const sp = r.previousRecordedAt ? (r.recordedAt.getTime() - r.previousRecordedAt.getTime()) / 1000 : null; const sn = r.nextRecordedAt ? (r.nextRecordedAt.getTime() - r.recordedAt.getTime()) / 1000 : null;
        points.push({ flightPositionId: r.id, flightId: r.flightId, timestamp: r.recordedAt.toISOString(), icao: r.icao, callsign: r.callsign, type: r.aircraftType, registration: r.registration, altitude: r.altitude, prevAltitude: r.previousAltitude, nextAltitude: r.nextAltitude, secondsPrev: sp, secondsNext: sn, impliedVerticalRatePrev: rate(r.previousAltitude, r.altitude, sp), impliedVerticalRateNext: rate(r.altitude, r.nextAltitude, sn), verticalRate: r.verticalRate, groundSpeed: r.groundSpeed, lat: r.lat, lon: r.lon });
      }
    }
    const extremeProfiles = profiles.filter((p) => Number(p.flightMaxAltitude) > 80000 || Number(p.extremeAltitudeCount) > 0).sort((a, b) => Number(b.maxExtremeAltitude ?? 0) - Number(a.maxExtremeAltitude ?? 0));
    const top = [...points].sort((a, b) => Number(b.altitude) - Number(a.altitude)).slice(0, 100);
    const dates = new Map<string, { count: number; maxAltitude: number }>(); for (const p of points) { const d = String(p.timestamp).slice(0, 10); const x = dates.get(d) ?? { count: 0, maxAltitude: 0 }; x.count++; x.maxAltitude = Math.max(x.maxAltitude, Number(p.altitude)); dates.set(d, x); }
    await mkdir(OUT, { recursive: true });
    await writeFile(`${OUT}/extreme-altitude-flights.csv`, csv(extremeProfiles)); await writeFile(`${OUT}/extreme-altitude-points.csv`, csv(points)); await writeFile(`${OUT}/extreme-altitude-top100.csv`, csv(top));
    await writeFile(`${OUT}/extreme-altitude-patterns.json`, JSON.stringify({ generatedAt: new Date().toISOString(), readOnly: true, knownRepairedWindow: { from: new Date(KNOWN_FROM).toISOString(), untilExclusive: new Date(KNOWN_UNTIL).toISOString() }, classes: Object.fromEntries(classes), patterns: Object.fromEntries(patterns), daily: Object.fromEntries(dates), primaryPopulation: extremeProfiles.length, profiles: extremeProfiles }, null, 2));
    let git = "unknown"; try { git = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* report only */ }
    await writeFile(`${OUT}/extreme-altitude-release-correlation.json`, JSON.stringify({ generatedAt: new Date().toISOString(), currentCommit: git, historicalDecoderChanges: [{ commit: "b2866ed7", date: "2026-09-27T10:00:19+02:00", change: "DF17 Q-bit altitude fix" }, { commit: "016d36d0", date: "2026-09-27T11:38:12+02:00", change: "AC12/AC13 and altitude decoder changes" }, { commit: "6bc7201e", date: "2026-09-27T12:36:11+02:00", change: "DF17/18 AC12 and GNSS/barometric altitude decoder changes" }], interpretation: "Historical FlightPosition has no release/provider provenance; correlation is temporal hypothesis only." }, null, 2));
    console.log(JSON.stringify({ readOnly: true, baseline: { positions: baseline.rows[0], flights: flightBaseline.rows[0] }, query: { minAltitude, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, rows: rows.length }, primaryPopulationFlights: extremeProfiles.length, classes: Object.fromEntries(classes), patterns: Object.fromEntries(patterns), over100k: { flights: extremeProfiles.filter((p) => Number(p.maxExtremeAltitude) > 100000).length, points: points.filter((p) => Number(p.altitude) > 100000).length }, artifacts: [`${OUT}/extreme-altitude-flights.csv`, `${OUT}/extreme-altitude-points.csv`, `${OUT}/extreme-altitude-top100.csv`, `${OUT}/extreme-altitude-patterns.json`, `${OUT}/extreme-altitude-release-correlation.json`], provenance: "Historical FlightPosition has no field-level provider/source provenance; LOCAL/NETWORK cannot be determined reliably from retained rows.", safety: "SELECT-only audit. No INSERT, UPDATE, DELETE, migration, backfill, or restart." }, null, 2));
  } finally { await client.end(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
