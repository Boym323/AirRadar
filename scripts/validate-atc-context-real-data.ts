#!/usr/bin/env node
import "dotenv/config";
import "temporal-polyfill/full/global";
import { computeAtcContext, loadAtcContextDataset } from "../lib/atc-context/engine";
import type { AtcContextLookupDiagnostics } from "../lib/atc-context/types";
import { getPrisma, closePrisma } from "../lib/server/db";

if (process.env.ATC_CONTEXT_VALIDATION_READ_ONLY !== "1") {
  throw new Error("Refusing to run without ATC_CONTEXT_VALIDATION_READ_ONLY=1");
}

const db = getPrisma();
if (!db) throw new Error("DATABASE_URL is required");
const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const positions = await db.orm.public.FlightPosition
  .where((p) => p.recordedAt.gte(Temporal.Instant.from(from.toISOString())))
  .include("flight", (f) => f.include("aircraft", (a) => a.select("icaoHex")))
  .orderBy((p) => p.recordedAt.desc())
  .limit(200)
  .all();
const dataset = await loadAtcContextDataset();
if (!dataset) throw new Error("ATC dataset unavailable");
const samples = positions.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).slice(0, 60);
console.error(`loaded positions=${positions.length} samples=${samples.length} sectors=${dataset.sectors.length} routeDocuments=${dataset.routeDocuments.length}`);
const metrics: AtcContextLookupDiagnostics = { atcBboxCandidates: 0, atcExactPolygonTests: 0, atsBboxCandidates: 0, atsGeodesicCalculations: 0, pointBboxCandidates: 0, pointDistanceCalculations: 0, aheadProjectedSteps: 0, aheadAirspaceQueries: 0 };
const started = process.hrtime.bigint();
const results = samples.map((p) => computeAtcContext({
  lat: p.lat, lon: p.lon, altitude: p.altitude, baroAltitude: p.altitude,
  altitudeSource: p.altitude === null ? "none" : "baro", track: p.track,
  groundSpeed: p.groundSpeed, verticalRate: p.verticalRate, timestamp: p.recordedAt.toString(),
  onGround: false,
}, dataset, new Date(p.recordedAt.toString()), metrics));
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
const times: number[] = [];
const lookupCount = Number.parseInt(process.env.ATC_CONTEXT_LOOKUPS ?? "500", 10);
for (let i = 0; i < Math.max(1, lookupCount); i++) {
  const p = samples[i % Math.max(samples.length, 1)];
  if (!p) break;
  const t = process.hrtime.bigint();
  computeAtcContext({ lat: p.lat, lon: p.lon, altitude: p.altitude, baroAltitude: p.altitude, altitudeSource: p.altitude === null ? "none" : "baro", track: p.track, groundSpeed: p.groundSpeed, verticalRate: p.verticalRate, timestamp: p.recordedAt.toString(), onGround: false }, dataset, new Date(p.recordedAt.toString()), metrics);
  times.push(Number(process.hrtime.bigint() - t) / 1e6);
  if ((i + 1) % 50 === 0) console.error(`benchmarked ${i + 1}/${lookupCount}`);
}
times.sort((a,b) => a-b);
const pct = (n: number) => times.length ? times[Math.min(times.length - 1, Math.floor(times.length * n))].toFixed(2) : "n/a";
const perLookup = (value: number) => Number((value / Math.max(1, results.length + times.length)).toFixed(2));
const dist = new Map<string, number>();
for (const r of results) dist.set(r.atsRoute?.confidence ?? "NONE", (dist.get(r.atsRoute?.confidence ?? "NONE") ?? 0) + 1);
console.log(JSON.stringify({ periodFrom: from.toISOString(), positionsInspected: positions.length, samples: samples.length, dataset: { sectors: dataset.sectors.length, atsSegments: dataset.routeDocuments.reduce((n,d) => n + d.routes.reduce((m,r) => m + r.segments.length, 0), 0) }, instrumentation: { atcBboxCandidatesAvg: perLookup(metrics.atcBboxCandidates), atcExactPolygonTestsAvg: perLookup(metrics.atcExactPolygonTests), atsBboxCandidatesAvg: perLookup(metrics.atsBboxCandidates), atsGeodesicCalculationsAvg: perLookup(metrics.atsGeodesicCalculations), pointBboxCandidatesAvg: perLookup(metrics.pointBboxCandidates), pointDistanceCalculationsAvg: perLookup(metrics.pointDistanceCalculations), aheadProjectedStepsAvg: perLookup(metrics.aheadProjectedSteps), aheadAirspaceQueriesAvg: perLookup(metrics.aheadAirspaceQueries) }, fir: Object.fromEntries([...new Set(results.map(r => r.fir?.countryCode ?? "NONE"))].map(c => [c, results.filter(r => (r.fir?.countryCode ?? "NONE") === c).length])), ats: Object.fromEntries(dist), benchmarkMs: { firstBatch: elapsedMs.toFixed(2), median: pct(.5), p90: pct(.9), p95: pct(.95), p99: pct(.99), max: times.at(-1)?.toFixed(2) ?? "n/a" }, examples: results.slice(0, 60).map((r,i) => ({ sample: `REAL-${String(i+1).padStart(2,"0")}`, altitude: r.position.altitude, fir: r.fir?.name ?? null, primary: r.primaryAirspace?.name ?? null, ats: r.atsRoute?.routeId ?? null, confidence: r.atsRoute?.confidence ?? "NONE", distanceNm: r.atsRoute?.distanceNm ?? null, alignment: r.atsRoute?.alignmentDifferenceDeg ?? null, ahead: r.ahead?.airspace.name ?? null })) }, null, 2));
await closePrisma();
