/**
 * R-02: manual read-only V1/Rust-V2 radar comparison.
 * ONLY GETs the existing public snapshot APIs. No DB access, service start,
 * receiver socket, SSE subscription or production runtime hooks.
 * No identifiers, paths, receiver coordinates or HTTP bodies in its report.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TRACKS = 10000;
const RECENT_S = 30;
const POSITION_S = 15;
const MAX_SNAPSHOT_AGE_MS = 30_000;
const PAIR_DRIFT_S = 15;
const DEG = Math.PI / 180;

function fail(message) { throw new Error(message); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null; }
function normalizeId(id) {
  if (typeof id !== "string") return null;
  if (/^~?[a-f0-9]{6}$/i.test(id)) return id.toUpperCase();
  const match = /^(icao|nonicao):([a-f0-9]{6})$/i.exec(id);
  return match ? (match[1].toLowerCase() === "nonicao" ? "~" : "") + match[2].toUpperCase() : null;
}
function boundedPosition(lat, lon) {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lon === "number" && Number.isFinite(lon) && Math.abs(lon) <= 180
    ? [lat, lon] : null;
}
function haversineKm(a, b) {
  const dLat = (b[0] - a[0]) * DEG, dLon = (b[1] - a[1]) * DEG;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a[0] * DEG) * Math.cos(b[0] * DEG) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function snapshotsForComparison(v1, v2) {
  const left = object(v1);
  const right = object(v2);
  const rust = object(right?.data);
  if (!Array.isArray(left?.aircraft) || !Array.isArray(rust?.aircraft)
    || right.status !== "live" || rust.kind !== "snapshot"
    || left.aircraft.length > MAX_TRACKS || rust.aircraft.length > 5000) {
    fail("Invalid, oversized or unavailable radar snapshot");
  }
  const rustGeneratedAt = Date.parse(rust.generatedAt);
  if (!Number.isFinite(rustGeneratedAt) || Math.abs(Date.now() - rustGeneratedAt) > MAX_SNAPSHOT_AGE_MS) {
    fail("Rust snapshot timestamp missing or stale");
  }
  const current = { v1: new Map(), v2: new Map() };
  const counts = { v1Invalid: 0, v2Invalid: 0, v1Old: 0, v2Old: 0 };
  for (const row of left.aircraft) {
    const id = normalizeId(row?.icaoHex);
    const seen = Date.parse(row?.lastSeen);
    if (!id || !Number.isFinite(seen)) { counts.v1Invalid++; continue; }
    const age = (Date.now() - seen) / 1000;
    if (age > RECENT_S || age < -5) { counts.v1Old++; continue; }
    if (row.origin === "adsblol" || row.origin === "adsbhub") continue;
    if (current.v1.has(id)) fail("Duplicate V1 identifier");
    const positionAge = row.seenPosSeconds;
    const position = typeof positionAge === "number" && Number.isFinite(positionAge)
      && (positionAge < 0 || positionAge > POSITION_S) ? null : boundedPosition(row.lat, row.lon);
    const source = ["ADS-B", "MLAT", "TIS-B", "Mode-S", "UNKNOWN"].includes(row.source)
      ? row.source : "OTHER";
    current.v1.set(id, { seen, position, source });
  }
  for (const row of rust.aircraft) {
    const id = normalizeId(row?.id);
    const seen = Number(row?.lastMessageAt) * 1000;
    if (!id || !Number.isFinite(seen) || typeof row?.stale !== "boolean") { counts.v2Invalid++; continue; }
    const age = (rustGeneratedAt - seen) / 1000;
    if (age > RECENT_S || age < -5 || row.stale) { counts.v2Old++; continue; }
    if (current.v2.has(id)) fail("Duplicate Rust identifier");
    const p = object(row.position);
    const posAt = row.lastPositionAt;
    const posAge = typeof posAt === "number" && Number.isFinite(posAt)
      ? (rustGeneratedAt / 1000 - posAt) : Number.POSITIVE_INFINITY;
    const position = p && posAge >= -2 && posAge <= POSITION_S
      && row.positionOrigin !== "estimated" && row.positionOrigin !== "unknown"
      ? boundedPosition(p.lat, p.lon) : null;
    current.v2.set(id, { seen, position });
  }
  return { current, counts, rustGeneratedAt };
}

export function compareRadarSnapshots(v1, v2) {
  const { current, counts, rustGeneratedAt } = snapshotsForComparison(v1, v2);
  let common = 0, timed = 0, positionPairs = 0, outliers5km = 0, v1Only = 0, v2Only = 0, missingPositions = 0;
  const distances = [];
  const missingFromRust = {
    seenUnder5s: 0, seen5to15s: 0, seen15to30s: 0,
    adsb: 0, mlat: 0, tisb: 0, modeS: 0, unknownOrOther: 0,
  };
  for (const [id, a] of current.v1) {
    const b = current.v2.get(id);
    if (!b) {
      v1Only++;
      const age = (Date.now() - a.seen) / 1000;
      if (age < 5) missingFromRust.seenUnder5s++;
      else if (age < 15) missingFromRust.seen5to15s++;
      else missingFromRust.seen15to30s++;
      if (a.source === "ADS-B") missingFromRust.adsb++;
      else if (a.source === "MLAT") missingFromRust.mlat++;
      else if (a.source === "TIS-B") missingFromRust.tisb++;
      else if (a.source === "Mode-S") missingFromRust.modeS++;
      else missingFromRust.unknownOrOther++;
      continue;
    }
    common++;
    if (Math.abs(a.seen - b.seen) > PAIR_DRIFT_S * 1000) continue;
    timed++;
    if (!a.position || !b.position) { missingPositions++; continue; }
    const distance = haversineKm(a.position, b.position);
    distances.push(distance); positionPairs++;
    if (distance > 5) outliers5km++;
  }
  for (const id of current.v2.keys()) if (!current.v1.has(id)) v2Only++;
  distances.sort((a, b) => a - b);
  const p95 = distances.length ? distances[Math.ceil(distances.length * 0.95) - 1] : null;
  return {
    mode: "READ_ONLY_RUST_SHADOW",
    assessment: common > 0 && timed > 0 && positionPairs > 0 ? "MEASURED_NOT_ACCEPTED" : "INSUFFICIENT_OVERLAP",
    v1Current: current.v1.size, rustCurrent: current.v2.size, common,
    v1Only, rustOnly: v2Only, missingFromRust, comparableTime: timed, positionPairs, missingPositions,
    positionOutliersOver5Km: outliers5km,
    positionP95Km: p95 === null ? null : Number(p95.toFixed(3)),
    rustSnapshotAgeSeconds: Number(((Date.now() - rustGeneratedAt) / 1000).toFixed(1)),
    discarded: counts,
    note: "Independent polling and different decoder coverage may cause discrepancies; no cutover decision.",
  };
}

export function checkedUrl(raw, version) {
  const uri = new URL(raw);
  if (uri.username || uri.password || uri.hash) fail("Credentials and fragments in URLs are prohibited");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname);
  if (uri.protocol !== "https:" && !(uri.protocol === "http:" && local)) fail("HTTPS required except loopback HTTP");
  if (version === "v1") {
    if (uri.pathname !== "/api/aircraft") fail("V1 endpoint must be /api/aircraft");
    if ([...uri.searchParams.keys()].some(k => k !== "coverage")) fail("Unexpected V1 query parameter");
    uri.searchParams.set("coverage", "local");
  } else if (uri.pathname !== "/api/v1/aircraft" || uri.search) {
    fail("Rust V2 endpoint must be /api/v1/aircraft without parameters");
  }
  return uri;
}

export async function boundedGetJson(url, fetcher = fetch) {
  const reply = await fetcher(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(5000), redirect: "error" });
  if (!reply.ok || !reply.body) fail("Radar HTTP response unavailable");
  if (Number(reply.headers.get("content-length") || 0) > MAX_BYTES) fail("Oversized HTTP response");
  const reader = reply.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) fail("Radar snapshot exceeds bound");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function runShadow(v1Url, v2Url, fetcher = fetch) {
  const [v1, v2] = await Promise.all([
    boundedGetJson(checkedUrl(v1Url, "v1"), fetcher),
    boundedGetJson(checkedUrl(v2Url, "v2"), fetcher),
  ]);
  return compareRadarSnapshots(v1, v2);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const v1 = args[0], v2 = args[1];
  if (args.length !== 2 || !v1 || !v2) {
    process.stderr.write("Usage: node scripts/rust-v2-shadow-compare.mjs <V1 /api/aircraft URL> <Rust V2 /api/v1/aircraft URL>\n");
    process.exitCode = 2;
  } else {
    runShadow(v1, v2).then(
      report => process.stdout.write(JSON.stringify(report, null, 2) + "\n"),
      () => { process.stderr.write("Rust V2 shadow comparison failed (response/validation error; no raw data disclosed).\n"); process.exitCode = 1; },
    );
  }
}
