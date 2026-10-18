import { readFileSync } from "node:fs";
import { monitorEventLoopDelay, PerformanceObserver, performance } from "node:perf_hooks";
import { validateAtcImportDocument } from "../lib/atc/import-format";
import { computeAtcContext, prepareAtcContextDataset } from "../lib/atc-context/engine";
import type { AtcContextInput, AtcContextDataset } from "../lib/atc-context/types";
import type { AtcSector } from "../lib/atc/types";

const file = process.env.ATC_OFFLINE_DATASET ?? "data/atc/cz-atc.template.json";
const multiplier = Number(process.env.ATC_LOAD_MULTIPLIER ?? "1");
if (![1, 2, 4].includes(multiplier)) throw new Error("ATC_LOAD_MULTIPLIER must be 1, 2, or 4");
type BoundaryFixture = { name?: string; geometry?: { coordinates: AtcSector["polygons"] }; source?: { dataset?: string; sourceUrl?: string; datasetDate?: string } };
const raw = JSON.parse(readFileSync(file, "utf8")) as BoundaryFixture;
const sectors: AtcSector[] = raw.geometry?.coordinates
  ? [{ id: raw.name ?? file, name: raw.name ?? file, atcCallsign: null, polygons: raw.geometry.coordinates, lowerAltitudeFt: 0, upperAltitudeFt: null, lowerAltitudeReference: "SFC", upperAltitudeReference: "UNL", frequencies: [], country: null, validFrom: null, validTo: null, source: raw.source?.dataset ?? "fixture", sourceReference: raw.source?.sourceUrl ?? file, lastVerifiedAt: raw.source?.datasetDate ?? "2026-01-01" }]
  : validateAtcImportDocument(raw).sectors.map((s) => ({ ...s, polygons: s.polygons as AtcSector["polygons"], frequencies: [], source: s.source, sourceReference: s.sourceReference, lastVerifiedAt: s.lastVerifiedAt }));
const dataset: AtcContextDataset = { sectors, routeDocuments: [] };
const prepared = prepareAtcContextDataset(dataset);
const boxes = sectors.flatMap((s) => s.polygons.flat()).reduce((b, [x, y]) => { b.minLon = Math.min(b.minLon, x); b.maxLon = Math.max(b.maxLon, x); b.minLat = Math.min(b.minLat, y); b.maxLat = Math.max(b.maxLat, y); return b; }, { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity });
let seed = 0x5eed1234; const rnd = () => ((seed = Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000;
const count = 256 * multiplier;
const inputs: AtcContextInput[] = Array.from({ length: count }, (_, i) => ({
  lon: boxes.minLon + (boxes.maxLon - boxes.minLon) * rnd(), lat: boxes.minLat + (boxes.maxLat - boxes.minLat) * rnd(), altitude: 10_000, baroAltitude: 10_000, geomAltitude: 10_000, altitudeSource: "baro", track: i % 3 ? 90 : null, groundSpeed: i % 3 ? 240 : null, verticalRate: 0, timestamp: "2026-10-18T12:00:00.000Z", onGround: false,
}));
for (let i = 0; i < 32; i++) computeAtcContext(inputs[i % inputs.length], prepared, new Date("2026-10-18T12:00:00.000Z"));
const durations: number[] = []; const loop = monitorEventLoopDelay({ resolution: 1 }); let gcCount = 0; let gcMs = 0;
const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) { gcCount++; gcMs += entry.duration; } }); observer.observe({ entryTypes: ["gc"] }); loop.enable(); const cpu0 = process.cpuUsage(); const rss0 = process.memoryUsage().rss; const start = performance.now();
for (const input of inputs) { const t = performance.now(); computeAtcContext(input, prepared, new Date("2026-10-18T12:00:00.000Z")); durations.push(performance.now() - t); }
const wallMs = performance.now() - start; await new Promise<void>((resolve) => setImmediate(resolve)); loop.disable(); observer.disconnect(); durations.sort((a, b) => a - b); const pct = (p: number) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * p) - 1)] ?? 0;
console.log(JSON.stringify({ file, sectors: sectors.length, polygons: sectors.reduce((n, s) => n + s.polygons.length, 0), inputs: count, wallMs, cpuMs: (cpu0.user + cpu0.system) / 1000, p95Ms: pct(.95), p99Ms: pct(.99), maxMs: durations.at(-1) ?? 0, eventLoopP95Ms: loop.percentile(95) / 1e6, eventLoopP99Ms: loop.percentile(99) / 1e6, eventLoopMaxMs: loop.max / 1e6, rssBefore: rss0, rssAfter: process.memoryUsage().rss, heapAfter: process.memoryUsage().heapUsed, gcCount, gcMs }, null, 2));
