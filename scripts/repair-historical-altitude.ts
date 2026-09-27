#!/usr/bin/env node
import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";

type RepairRow = { id: number; flightId: number; recordedAt: string; originalAltitude: number };
type FlightRow = { id: number; originalMaxAltitude: number | null };

const ARTIFACT_DIR = "artifacts";
const HIGH_CONFIDENCE = `${ARTIFACT_DIR}/historical-altitude-high-confidence.csv`;
const ROLLBACK = `${ARTIFACT_DIR}/historical-altitude-rollback.csv`;
const DRY_RUN = `${ARTIFACT_DIR}/historical-altitude-maxaltitude-dry-run.json`;
const EXPECTED_ROWS = 491;
const EXPECTED_CHANGED_FLIGHTS = 3;
const EXPECTED_UNCHANGED_FLIGHTS = 166;
const EXPECTED_NO_VALID_ALTITUDE = 0;
const PRODUCTION_VERSION = "1.0.162";
const PRODUCTION_COMMIT = "284bd837";
const POST_FIX_FROM = "2026-09-27T11:06:57.000Z";

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { values.push(value); value = ""; }
    else value += char;
  }
  values.push(value);
  return values;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trimEnd().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift() ?? "");
  return lines.filter(Boolean).map((line) => Object.fromEntries(parseCsvLine(line).map((value, index) => [headers[index]!, value])));
}

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid database timestamp: ${String(value)}`);
  return date.toISOString();
}

function canonical(rows: RepairRow[]): string {
  return [...rows].sort((left, right) => left.id - right.id)
    .map((row) => `${row.id}|${row.flightId}|${row.recordedAt}|${row.originalAltitude}\n`).join("");
}

function checksum(rows: RepairRow[]): string {
  return createHash("sha256").update(canonical(rows), "utf8").digest("hex");
}

function sameRow(actual: RepairRow, expected: RepairRow): boolean {
  return actual.id === expected.id && actual.flightId === expected.flightId
    && actual.recordedAt === expected.recordedAt && actual.originalAltitude === expected.originalAltitude;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const highConfidence = parseCsv(await readFile(HIGH_CONFIDENCE, "utf8"));
  const rollback = parseCsv(await readFile(ROLLBACK, "utf8"));
  const repairRows = highConfidence.map((row) => ({
    id: Number(row.flightPositionId), flightId: Number(row.flightId), recordedAt: new Date(row.recordedAt).toISOString(), originalAltitude: Number(row.currentAltitude),
  } satisfies RepairRow));
  const rollbackRows = rollback.map((row) => ({ id: Number(row.flightPositionId), flightId: Number(row.flightId), originalAltitude: Number(row.originalAltitude) }));
  if (repairRows.length !== EXPECTED_ROWS || rollbackRows.length !== EXPECTED_ROWS) throw new Error(`ABORT: expected ${EXPECTED_ROWS} rows in both immutable exports`);
  if (new Set(repairRows.map((row) => row.id)).size !== EXPECTED_ROWS) throw new Error("ABORT: repair export contains duplicate IDs");
  const rollbackById = new Map(rollbackRows.map((row) => [row.id, row]));
  if (repairRows.some((row) => rollbackById.get(row.id)?.flightId !== row.flightId || rollbackById.get(row.id)?.originalAltitude !== row.originalAltitude)) throw new Error("ABORT: high-confidence and rollback exports differ");
  const repairChecksum = checksum(repairRows);
  const dryRun = JSON.parse(await readFile(DRY_RUN, "utf8")) as { rows: Array<{ flightId: number; currentMaxAltitude: number | null; recalculatedMaxAltitude: number | null; status: string }> };
  const expectedFlightIds = [...new Set(repairRows.map((row) => row.flightId))].sort((a, b) => a - b);
  const dryRunByFlight = new Map(dryRun.rows.map((row) => [row.flightId, row]));
  if (dryRun.rows.filter((row) => expectedFlightIds.includes(row.flightId)).length !== expectedFlightIds.length) throw new Error("ABORT: dry-run Flight scope does not match repair scope");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  let snapshotRows: RepairRow[] = [];
  let snapshotFlights: FlightRow[] = [];
  let committed = false;
  const startedAt = new Date().toISOString();
  try {
    const pre = await client.query<{ id: number; flightId: number; recordedAt: Date; altitude: number | null }>(
      `SELECT "id", "flightId", "recordedAt", "altitude" FROM "flightPosition" WHERE "id" = ANY($1::int[])`, [repairRows.map((row) => row.id)]);
    const actual = pre.rows.map((row) => ({ id: row.id, flightId: row.flightId, recordedAt: iso(row.recordedAt), originalAltitude: row.altitude }));
    if (actual.length !== EXPECTED_ROWS || actual.some((row) => row.originalAltitude === null || !sameRow(row as RepairRow, repairRows.find((candidate) => candidate.id === row.id)!))) throw new Error("ABORT: precondition mismatch (existence, flightId, recordedAt, altitude, or NULL state)");
    const flightResult = await client.query<{ id: number; maxAltitude: number | null }>(`SELECT "id", "maxAltitude" FROM "flight" WHERE "id" = ANY($1::int[])`, [expectedFlightIds]);
    if (flightResult.rows.length !== expectedFlightIds.length) throw new Error("ABORT: one or more affected Flights do not exist");
    snapshotRows = repairRows.map((row) => ({ ...row }));
    snapshotFlights = flightResult.rows.map((row) => ({ id: row.id, originalMaxAltitude: row.maxAltitude })).sort((a, b) => a.id - b.id);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await writeFile(`${ARTIFACT_DIR}/historical-altitude-rollback-final.csv`, ["id,flightId,recordedAt,originalAltitude", ...snapshotRows.sort((a, b) => a.id - b.id).map((row) => `${row.id},${row.flightId},${row.recordedAt},${row.originalAltitude}`), ""].join("\n"));
    await writeFile(`${ARTIFACT_DIR}/historical-altitude-flight-rollback-final.json`, JSON.stringify({ generatedAt: startedAt, rows: snapshotFlights }, null, 2) + "\n");
    if (snapshotRows.length !== EXPECTED_ROWS) throw new Error("ABORT: final rollback snapshot row count mismatch");

    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    const locked = await client.query<{ id: number; flightId: number; recordedAt: Date; altitude: number | null }>(`SELECT "id", "flightId", "recordedAt", "altitude" FROM "flightPosition" WHERE "id" = ANY($1::int[]) FOR UPDATE`, [repairRows.map((row) => row.id)]);
    const lockedRows = locked.rows.map((row) => ({ id: row.id, flightId: row.flightId, recordedAt: iso(row.recordedAt), originalAltitude: row.altitude }));
    if (lockedRows.length !== EXPECTED_ROWS || lockedRows.some((row) => row.originalAltitude === null || !sameRow(row as RepairRow, repairRows.find((candidate) => candidate.id === row.id)!))) throw new Error("ABORT: locked revalidation mismatch; transaction will rollback");
    const lockedFlights = await client.query<{ id: number; maxAltitude: number | null }>(`SELECT "id", "maxAltitude" FROM "flight" WHERE "id" = ANY($1::int[]) FOR UPDATE`, [expectedFlightIds]);
    if (lockedFlights.rows.length !== expectedFlightIds.length) throw new Error("ABORT: locked Flight scope mismatch; transaction will rollback");
    const beforeCount = Number((await client.query(`SELECT COUNT(*)::int AS count FROM "flightPosition"`)).rows[0].count);
    const update = await client.query(`UPDATE "flightPosition" SET "altitude" = NULL WHERE "id" = ANY($1::int[]) RETURNING "id"`, [repairRows.map((row) => row.id)]);
    if (update.rowCount !== EXPECTED_ROWS) throw new Error(`ABORT: updated ${update.rowCount} FlightPosition rows, expected ${EXPECTED_ROWS}`);
    const maxima = await client.query<{ flightId: number; maxAltitude: number | null }>(`SELECT "flightId", MAX("altitude")::int AS "maxAltitude" FROM "flightPosition" WHERE "flightId" = ANY($1::int[]) AND "altitude" IS NOT NULL GROUP BY "flightId"`, [expectedFlightIds]);
    const maxByFlight = new Map(maxima.rows.map((row) => [row.flightId, row.maxAltitude]));
    if (maxByFlight.size !== expectedFlightIds.length || [...maxByFlight.values()].some((value) => value === null)) throw new Error("ABORT: a touched Flight has no remaining valid altitude");
    const changed: number[] = [];
    const unchanged: number[] = [];
    for (const row of lockedFlights.rows) {
      const recalculated = maxByFlight.get(row.id)!;
      if (recalculated === row.maxAltitude) unchanged.push(row.id);
      else { const result = await client.query(`UPDATE "flight" SET "maxAltitude" = $1 WHERE "id" = $2 AND "maxAltitude" IS DISTINCT FROM $1 RETURNING "id"`, [recalculated, row.id]); if (result.rowCount !== 1) throw new Error(`ABORT: failed maxAltitude update for Flight ${row.id}`); changed.push(row.id); }
    }
    if (changed.length !== EXPECTED_CHANGED_FLIGHTS || unchanged.length !== EXPECTED_UNCHANGED_FLIGHTS) throw new Error(`ABORT: maxAltitude counts changed=${changed.length}, unchanged=${unchanged.length}`);
    if (beforeCount !== Number((await client.query(`SELECT COUNT(*)::int AS count FROM "flightPosition"`)).rows[0].count)) throw new Error("ABORT: FlightPosition count changed");
    await client.query("COMMIT");
    committed = true;
    const rollbackSql = ["-- PREPARED ROLLBACK; NOT EXECUTED.", "BEGIN;", "-- Restore exact audited FlightPosition altitudes from the final snapshot.", "UPDATE \"flightPosition\" AS p SET \"altitude\" = v.altitude FROM (VALUES", snapshotRows.sort((a, b) => a.id - b.id).map((row) => `(${row.id}, ${row.originalAltitude})`).join(",\n"), ") AS v(id, altitude) WHERE p.id = v.id;", "-- Restore exact pre-repair Flight.maxAltitude values from the final snapshot.", `UPDATE \"flight\" AS f SET \"maxAltitude\" = v.max_altitude FROM (VALUES ${snapshotFlights.map((row) => `(${row.id}, ${row.originalMaxAltitude === null ? "NULL" : row.originalMaxAltitude})`).join(", ")} ) AS v(id, max_altitude) WHERE f.id = v.id;`, "COMMIT;", ""].join("\n");
    await writeFile(`${ARTIFACT_DIR}/historical-altitude-rollback.sql`, rollbackSql);
    const report = `# Historical altitude repair report\n\n- Repair timestamp: ${startedAt}\n- Running version: ${PRODUCTION_VERSION}\n- Running commit: ${PRODUCTION_COMMIT}\n- Post-fix service start: 2026-09-27 13:06:57 CEST (${POST_FIX_FROM})\n- Repair dataset checksum: ${repairChecksum}\n\n## Transaction results\n\n- Precondition rows: ${EXPECTED_ROWS}\n- Updated FlightPosition rows: ${update.rowCount}\n- Updated Flight rows: ${changed.length}\n- Unchanged affected Flights: ${unchanged.length}\n- Flights without valid remaining altitude: 0\n- FlightPosition count unchanged: yes\n- FlightEvent changes: none\n- POSSIBLE / PLAUSIBLE_HIGH_ALTITUDE rows changed: none\n\n## Artifacts\n\n- Final position rollback snapshot: [historical-altitude-rollback-final.csv](historical-altitude-rollback-final.csv)\n- Final Flight rollback snapshot: [historical-altitude-flight-rollback-final.json](historical-altitude-flight-rollback-final.json)\n- Prepared rollback SQL (not executed): [historical-altitude-rollback.sql](historical-altitude-rollback.sql)\n\nCommit completed atomically after locked revalidation.\n`;
    await writeFile(`${ARTIFACT_DIR}/historical-altitude-repair-report.md`, report);
    console.log(JSON.stringify({ committed, repairChecksum, updatedFlightPositions: update.rowCount, updatedFlights: changed.length, unchangedFlights: unchanged.length, rollbackRows: snapshotRows.length }));
    void dryRunByFlight;
  } finally {
    if (!committed) { try { await client.query("ROLLBACK"); } catch { /* no active transaction */ } }
    await client.end();
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
