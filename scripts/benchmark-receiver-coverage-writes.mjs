#!/usr/bin/env node
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { Client } from "pg";

const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("DATABASE_URL is required");
const databaseName = new URL(url).pathname.slice(1);
if (!/_pr1129(?:_|$)/i.test(databaseName)) {
  throw new Error(`Refusing benchmark database ${databaseName}; use an isolated *_pr1129 database`);
}

const sizes = [50, 250, 1_000, 5_000];
const repeats = Math.max(5, Number(process.env.RECEIVER_COVERAGE_BENCHMARK_REPEATS ?? 7));
const warmups = Math.max(1, Number(process.env.RECEIVER_COVERAGE_BENCHMARK_WARMUPS ?? 2));
const artifact = process.env.RECEIVER_COVERAGE_BENCHMARK_ARTIFACT ?? "artifacts/performance/receiver-coverage-hourly-ab-20261028.json";
const client = new Client({ connectionString: url });

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function stats(values) {
  // PostgreSQL can run in a separate PID namespace (GitHub Actions service),
  // where backend CPU accounting is unavailable to the Node.js benchmark.
  // Report missing measurements as null, never as a fictitious 0 jiffies.
  const valid = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) return { p50Ms: null, p95Ms: null, p99Ms: null, minMs: null, maxMs: null };
  return {
    p50Ms: Number(percentile(valid, 50).toFixed(3)),
    p95Ms: Number(percentile(valid, 95).toFixed(3)),
    p99Ms: Number(percentile(valid, 99).toFixed(3)),
    minMs: Number(Math.min(...valid).toFixed(3)),
    maxMs: Number(Math.max(...valid).toFixed(3)),
  };
}

function rowsFor(size) {
  const hour = "2026-10-28T10:00:00.000Z";
  return Array.from({ length: size }, (_, index) => ({
    hour,
    dimension: index % 5 === 0 ? "overall" : "azimuth",
    bucketKey: `bench-${size}-${index}`,
    availableCount: 10 + (index % 7),
    capturedCount: 4 + (index % 5),
    referenceProviders: index % 2 ? "adsbhub" : "local",
  }));
}

async function scalar(sql, params = []) {
  return (await client.query(sql, params)).rows[0];
}

function readCpu(pid) {
  try {
    const fields = readFileSync(`/proc/${pid}/stat`, "utf8").trim().split(" ");
    return Number(fields[13]) + Number(fields[14]);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EACCES") return null;
    throw error;
  }
}

async function walPosition() {
  const row = await scalar("SELECT pg_current_wal_lsn()::text AS lsn");
  return row.lsn;
}

async function legacy(rows) {
  let statements = 1;
  await client.query("BEGIN");
  // Match the production fallback: exclusive lock and fresh row reads.
  await client.query("SELECT pg_advisory_xact_lock(784231947)");
  statements += 1;
  for (const row of rows) {
    const existing = await client.query(
      'SELECT "availableCount", "capturedCount", "referenceProviders" FROM "receiverCoverageHourly" WHERE "hour" = $1 AND "bucketKey" = $2',
      [row.hour, row.bucketKey],
    );
    statements += 1;
    if (existing.rowCount) {
      const current = existing.rows[0];
      const providers = [...new Set(`${current.referenceProviders},${row.referenceProviders}`.split(",").filter(Boolean))].sort().join(",");
      await client.query(
        'UPDATE "receiverCoverageHourly" SET "availableCount" = $1, "capturedCount" = $2, "referenceProviders" = $3 WHERE "hour" = $4 AND "bucketKey" = $5',
        [current.availableCount + row.availableCount, current.capturedCount + row.capturedCount, providers, row.hour, row.bucketKey],
      );
    } else {
      await client.query(
        'INSERT INTO "receiverCoverageHourly" ("hour", "dimension", "bucketKey", "availableCount", "capturedCount", "referenceProviders") VALUES ($1,$2,$3,$4,$5,$6)',
        [row.hour, row.dimension, row.bucketKey, row.availableCount, row.capturedCount, row.referenceProviders],
      );
    }
    statements += 1;
  }
  await client.query("COMMIT");
  return statements + 1;
}

async function atomic(rows) {
  const payload = JSON.stringify(rows);
  await client.query("BEGIN");
  // Match the production atomic path: shared lock excludes ORM fallback
  // while still permitting multiple atomic writers.
  await client.query("SELECT pg_advisory_xact_lock_shared(784231947)");
  await client.query(`
    WITH input AS MATERIALIZED (
      SELECT x."hour", x."dimension", x."bucketKey", x."availableCount", x."capturedCount", x."referenceProviders"
      FROM jsonb_to_recordset($1::jsonb) AS x(
        "hour" timestamptz, "dimension" text, "bucketKey" text,
        "availableCount" integer, "capturedCount" integer, "referenceProviders" text
      )
    ), updated AS (
      UPDATE "receiverCoverageHourly" AS target
      SET "availableCount" = target."availableCount" + input."availableCount",
          "capturedCount" = target."capturedCount" + input."capturedCount",
          "referenceProviders" = (
            SELECT string_agg(DISTINCT provider, ',' ORDER BY provider)
            FROM unnest(string_to_array(concat_ws(',', target."referenceProviders", input."referenceProviders"), ',')) AS providers(provider)
            WHERE provider <> ''
          )
      FROM input
      WHERE target."hour" = input."hour" AND target."bucketKey" = input."bucketKey"
      RETURNING target."hour"::text AS "hour", target."bucketKey", target."availableCount", target."capturedCount", target."referenceProviders", false AS "inserted"
    ), inserted AS (
      INSERT INTO "receiverCoverageHourly"
        ("hour", "dimension", "bucketKey", "availableCount", "capturedCount", "referenceProviders")
      SELECT input."hour", input."dimension", input."bucketKey", input."availableCount", input."capturedCount", input."referenceProviders"
      FROM input
      WHERE NOT EXISTS (SELECT 1 FROM updated WHERE updated."hour" = input."hour"::text AND updated."bucketKey" = input."bucketKey")
      ON CONFLICT ("hour", "bucketKey") DO UPDATE
      SET "availableCount" = "receiverCoverageHourly"."availableCount" + EXCLUDED."availableCount",
          "capturedCount" = "receiverCoverageHourly"."capturedCount" + EXCLUDED."capturedCount",
          "referenceProviders" = (
            SELECT string_agg(DISTINCT provider, ',' ORDER BY provider)
            FROM unnest(string_to_array(concat_ws(',', "receiverCoverageHourly"."referenceProviders", EXCLUDED."referenceProviders"), ',')) AS providers(provider)
            WHERE provider <> ''
          )
      RETURNING "hour"::text AS "hour", "bucketKey", "availableCount", "capturedCount", "referenceProviders", (xmax = 0) AS "inserted"
    ) SELECT * FROM updated UNION ALL SELECT * FROM inserted
  `, [payload]);
  await client.query("COMMIT");
  return 4;
}

async function reset(rows) {
  await client.query('TRUNCATE TABLE "receiverCoverageHourly"');
  await client.query(
    'INSERT INTO "receiverCoverageHourly" ("hour", "dimension", "bucketKey", "availableCount", "capturedCount", "referenceProviders") SELECT x."hour", x."dimension", x."bucketKey", 100, 50, \'seed\' FROM jsonb_to_recordset($1::jsonb) AS x("hour" timestamptz, "dimension" text, "bucketKey" text)',
    [JSON.stringify(rows)],
  );
}

async function digest() {
  const row = await scalar('SELECT count(*)::int AS rows, sum("availableCount")::bigint AS available, sum("capturedCount")::bigint AS captured, string_agg(DISTINCT "referenceProviders", \',\' ORDER BY "referenceProviders") AS providers FROM "receiverCoverageHourly"');
  return { rows: Number(row.rows), available: Number(row.available ?? 0), captured: Number(row.captured ?? 0), providers: row.providers };
}

async function runCase(size, mode) {
  const rows = rowsFor(size);
  await reset(rows);
  const pid = (await scalar("SELECT pg_backend_pid()::int AS pid")).pid;
  const beforeWal = await walPosition();
  const beforeCpu = readCpu(pid);
  const start = process.hrtime.bigint();
  const roundTrips = mode === "legacy" ? await legacy(rows) : await atomic(rows);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const afterCpu = readCpu(pid);
  const afterWal = await walPosition();
  const walBytes = Number((await scalar("SELECT pg_wal_lsn_diff($1, $2)::bigint AS bytes", [afterWal, beforeWal])).bytes);
  return { elapsedMs, roundTrips, walBytes, postgresCpuJiffies: beforeCpu === null || afterCpu === null ? null : afterCpu - beforeCpu, digest: await digest() };
}

await client.connect();
await client.query("SET synchronous_commit = on");
const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), database: databaseName, postgres: (await scalar("SELECT version() AS version")).version, sizes: {}, repeats, warmups };
for (const size of sizes) {
  result.sizes[size] = {};
  for (const mode of ["legacy", "atomic"]) {
    for (let trial = 0; trial < warmups; trial += 1) await runCase(size, mode, trial);
    const samples = [];
    for (let trial = 0; trial < repeats; trial += 1) samples.push(await runCase(size, mode, trial));
    const baseline = samples[0].digest;
    const parity = samples.every((sample) => JSON.stringify(sample.digest) === JSON.stringify(baseline));
    result.sizes[size][mode] = {
      latency: stats(samples.map((sample) => sample.elapsedMs)),
      roundTrips: samples[0].roundTrips,
      walBytes: stats(samples.map((sample) => sample.walBytes)),
      postgresCpuJiffies: stats(samples.map((sample) => sample.postgresCpuJiffies)),
      parity,
      digest: baseline,
      samples,
    };
  }
  result.sizes[size].parityBetweenModes = JSON.stringify(result.sizes[size].legacy.digest) === JSON.stringify(result.sizes[size].atomic.digest);
}
await client.end();
await mkdir(artifact.substring(0, artifact.lastIndexOf("/")), { recursive: true });
await writeFile(artifact, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ artifact, sizes: Object.fromEntries(sizes.map((size) => [size, { legacy: result.sizes[size].legacy.latency, atomic: result.sizes[size].atomic.latency, legacyRoundTrips: result.sizes[size].legacy.roundTrips, atomicRoundTrips: result.sizes[size].atomic.roundTrips, parity: result.sizes[size].legacy.parity && result.sizes[size].atomic.parity }])) }, null, 2));
