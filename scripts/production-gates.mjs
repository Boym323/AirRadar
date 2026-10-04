import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export const STABLE_PRODUCTION_VERSION = "1.0.0";
export const RELEASE_CANDIDATE_VERSION_PATTERN = /^1\.0\.0-rc\.[1-9]\d*$/;

export function isProductionGateFullSmokeViewport(viewport) {
  return viewport?.width === 375 || viewport?.width === 821;
}

export function isProductionGateMarkerSmokeViewport(viewport) {
  return viewport?.width === 821;
}

function validReleaseVersion(value) {
  return typeof value === "string" && /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-rc\.[1-9]\d*)?$/.test(value);
}

function expectedBuildVersion() {
  try {
    const metadata = JSON.parse(readFileSync("generated/build-version.json", "utf8"));
    return validReleaseVersion(metadata.version) ? metadata.version : STABLE_PRODUCTION_VERSION;
  } catch {
    return STABLE_PRODUCTION_VERSION;
  }
}

export function resolveProductionGateChannel(value = process.env.PRODUCTION_GATE_CHANNEL) {
  const channel = (value || "auto").trim().toLowerCase();
  if (channel !== "auto" && channel !== "stable" && channel !== "rc") {
    throw new Error(`Unsupported production gate channel: ${channel || "(empty)"}; expected auto, stable, or rc`);
  }
  return channel;
}

export function assertProductionReleaseMetadata(payload, requestedChannel = "auto", expectedVersion = STABLE_PRODUCTION_VERSION) {
  const channel = resolveProductionGateChannel(requestedChannel);
  const version = payload && typeof payload.version === "string" ? payload.version : "";
  const reportedChannel = payload && typeof payload.channel === "string" ? payload.channel : "";
  const stable = version === expectedVersion && !version.includes("-rc.") && reportedChannel === "production";
  const releaseCandidate = (expectedVersion === STABLE_PRODUCTION_VERSION
    ? RELEASE_CANDIDATE_VERSION_PATTERN.test(version)
    : version === expectedVersion && version.includes("-rc."))
    && reportedChannel === "release-candidate";
  const valid = channel === "auto" ? stable || releaseCandidate : channel === "stable" ? stable : releaseCandidate;
  if (!valid) {
    const releaseDescription = expectedVersion.includes("-rc.") ? `${expectedVersion}/release-candidate` : `${expectedVersion}/production`;
    const expected = channel === "auto"
      ? releaseDescription
      : channel === "stable" ? `${expectedVersion}/production` : `${expectedVersion}/release-candidate`;
    throw new Error(`Release metadata smoke failed: expected ${expected}, got ${version || "(missing)"}/${reportedChannel || "(missing)"}`);
  }
}

const CONTRACT_HASH = /^[a-f0-9]{64}$/;

/** Validate checked-in migration metadata without importing or executing migration code. */
export function assertMigrationSource(root = process.cwd()) {
  const appDirectory = resolve(root, "migrations/app");
  const snapshotDirectory = resolve(root, "migrations/snapshots");
  const directories = readdirSync(appDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{8}T\d{4}_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (!directories.length) throw new Error("Migration chain is empty");

  let predecessor = null;
  for (const directoryName of directories) {
    const directory = resolve(appDirectory, directoryName);
    const manifestPath = resolve(directory, "migration.json");
    const operationsPath = resolve(directory, "ops.json");
    const sourcePath = resolve(directory, "migration.ts");
    if (!existsSync(manifestPath) || !existsSync(operationsPath) || !existsSync(sourcePath)) {
      throw new Error(`Migration ${directoryName} is missing migration.json, ops.json, or migration.ts`);
    }
    let manifest;
    let operations;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      operations = JSON.parse(readFileSync(operationsPath, "utf8"));
    } catch (error) {
      throw new Error(`Migration ${directoryName} has malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!manifest || typeof manifest !== "object"
      || (manifest.from !== null && !CONTRACT_HASH.test(manifest.from))
      || !CONTRACT_HASH.test(manifest.to)
      || typeof manifest.createdAt !== "string" || !Number.isFinite(Date.parse(manifest.createdAt))
      || !CONTRACT_HASH.test(manifest.migrationHash)) {
      throw new Error(`Migration ${directoryName} has malformed migration metadata`);
    }
    if (manifest.from !== predecessor) {
      throw new Error(`Migration ${directoryName} predecessor ${String(manifest.from)} does not continue ${String(predecessor)}`);
    }
    const snapshot = resolve(snapshotDirectory, manifest.to);
    if (!existsSync(resolve(snapshot, "contract.json")) || !existsSync(resolve(snapshot, "contract.d.ts"))) {
      throw new Error(`Migration ${directoryName} target contract snapshot is missing for ${manifest.to}`);
    }
    if (!Array.isArray(operations) || operations.length === 0 || operations.some((operation) => !operation || typeof operation !== "object"
      || typeof operation.id !== "string" || typeof operation.operationClass !== "string"
      || !Array.isArray(operation.precheck) || !Array.isArray(operation.execute) || !Array.isArray(operation.postcheck))) {
      throw new Error(`Migration ${directoryName} has malformed operations metadata`);
    }
    predecessor = manifest.to;
  }
  return { directories, finalContractHash: predecessor };
}

const host = "127.0.0.1";
const port = Number(process.env.PRODUCTION_GATE_PORT || 3199);
const baseUrl = `http://${host}:${port}`;

function urlHasHostname(value, expectedHostname) {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname === expectedHostname;
  } catch {
    return false;
  }
}

function textReferencesHostname(value, expectedHostname) {
  const candidates = String(value).match(/https?:\/\/[^\s)"']+/g) ?? [];
  return candidates.some((candidate) => urlHasHostname(candidate, expectedHostname));
}
const atBoundaryArtifact = JSON.parse(readFileSync("data/atc/at-state-boundary.json", "utf8"));
const atBoundaryBbox = atBoundaryArtifact.bbox;
const atBoundaryPolygon = [[
  [atBoundaryBbox[0], atBoundaryBbox[1]],
  [atBoundaryBbox[2], atBoundaryBbox[1]],
  [atBoundaryBbox[2], atBoundaryBbox[3]],
  [atBoundaryBbox[0], atBoundaryBbox[3]],
  [atBoundaryBbox[0], atBoundaryBbox[1]],
]];

async function get(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function waitForHealthyServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await get("/api/health");
      if (response.ok) return;
    } catch {
      // The child is still starting.
    }
    await wait(100);
  }
  throw new Error("Built server did not become ready within 30 seconds");
}

async function assertSseLifecycle() {
  const controller = new AbortController();
  const response = await get("/api/stream", { signal: controller.signal });
  if (!response.ok || !response.body) throw new Error(`SSE returned HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = "";
  try {
    while (!received.includes("event: snapshot")) {
      const next = await reader.read();
      if (next.done) break;
      received += decoder.decode(next.value, { stream: true });
      if (received.length > 2_000_000) throw new Error("SSE smoke payload exceeded its bound");
    }
  } finally {
    await reader.cancel();
    controller.abort();
  }
  if (!received.includes("event: snapshot") || !received.includes("data:")) throw new Error("SSE did not deliver a snapshot");
  const firstEvent = received.split("\n\n", 1)[0] + "\n\n";
  return Buffer.byteLength(firstEvent);
}

async function assertSystemSseLifecycle() {
  const controller = new AbortController();
  const response = await get("/api/system/stream", { signal: controller.signal });
  if (!response.ok || !response.body) throw new Error(`System SSE returned HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = "";
  try {
    while (!received.includes("event: snapshot")) {
      const next = await reader.read();
      if (next.done) break;
      received += decoder.decode(next.value, { stream: true });
      if (received.length > 2_000_000) throw new Error("System SSE smoke payload exceeded its bound");
    }
  } finally {
    await reader.cancel();
    controller.abort();
  }
  if (!received.includes("event: snapshot") || !received.includes('"detailLevel"')) throw new Error("System SSE did not deliver a projected snapshot");
  return Buffer.byteLength(received.split("\n\n", 1)[0] + "\n\n");
}

async function assertSseV2Lifecycle() {
  const controller = new AbortController();
  const response = await get("/api/stream?v=2", { signal: controller.signal });
  if (!response.ok || !response.body) throw new Error(`SSE V2 returned HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = "";
  const deadline = Date.now() + 10_000;
  let pendingRead = reader.read();
  try {
    while (Date.now() < deadline && !received.includes("event: delta")) {
      const result = await Promise.race([
        pendingRead,
        wait(1_000).then(() => null),
      ]);
      if (!result) continue;
      if (result.value) received += decoder.decode(result.value, { stream: true });
      if (result.done) break;
      pendingRead = reader.read();
    }
  } finally {
    await reader.cancel();
    controller.abort();
  }
  if (!received.includes("event: snapshot") || !received.includes('"protocol":"airradar-sse-v2"')) throw new Error("SSE V2 did not deliver its initial snapshot");
  if (!received.includes("event: delta")) throw new Error("SSE V2 did not deliver a delta within 10 seconds");
  return Buffer.byteLength(received.split("\n\n", 1)[0] + "\n\n");
}

async function waitForSseCleanup() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const response = await get("/api/system/status");
    if (response.ok && (await response.json()).runtime?.activeSseClients === 0) return;
    await wait(100);
  }
  throw new Error("SSE client cleanup did not complete within 5 seconds");
}

async function assertBrowserSmoke({ enabled = process.env.RUN_BROWSER_GATE === "1" } = {}) {
  if (!enabled) {
    console.log("[production-gates] browser desktop/mobile gate skipped; set RUN_BROWSER_GATE=1 to run it");
    return;
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const configuredViewport = process.env.PRODUCTION_GATE_BROWSER_VIEWPORT;
    const captureVisualSmoke = configuredViewport ? async () => {} : async () => {
      const visualSmokeDirectory = resolve("artifacts/visual-smoke");
      mkdirSync(visualSmokeDirectory, { recursive: true });
      const dailyRecapFixture = {
        source: "postgres",
        range: "daily",
        from: "2026-10-03",
        to: "2026-10-03",
        timezone: "Europe/Prague",
        isCurrentDay: true,
        hasData: true,
        uniqueAircraft: 1284,
        observedFlights: 1640,
        newAircraft: 12,
        rareOrReturning: 18,
        maxDistanceKm: 287,
        coverageKm: 287,
        topAircraftTypes: [{ name: "A320", count: 214 }, { name: "B738", count: 188 }],
        topRoutes: [{ origin: "LOWW", destination: "EDDF", count: 18 }, { origin: "LKPR", destination: "LOWW", count: 14 }],
        interestingAircraft: [{ icaoHex: "49D001", callsign: "CSA123", registration: "OK-TST", reason: "rare" }],
        bestReception: { date: "2026-10-03", distanceKm: 287, icaoHex: "49D001", registration: "OK-TST", recordedAt: "2026-10-03T11:30:00.000Z", bearing: 275 },
        alertCount: 9,
        dailyIntelligence: {
          complete: true,
          busiestHour: { hour: 17, flights: 142 },
          topAirlines: [{ name: "RYANAIR", count: 176 }, { name: "AUSTRIAN", count: 131 }],
          eventCounts: { goArounds: 3, holdings: 4, diversions: 1, emergencies: 1 },
          highlights: [
            { key: "alert:emergency", kind: "emergency", occurredAt: "2026-10-03T17:42:00.000Z", icaoHex: "49D001", callsign: "CSA123", registration: "OK-TST", eventType: null, airportIcao: null, runway: null, confidenceLevel: null, squawk: "7700", distanceKm: null },
            { key: "event:go-around", kind: "flight_event", occurredAt: "2026-10-03T16:20:00.000Z", icaoHex: "4B1801", callsign: null, registration: null, eventType: "GO_AROUND", airportIcao: "LOWW", runway: "29", confidenceLevel: "high", squawk: null, distanceKm: null },
            { key: "alert:record", kind: "reception_record", occurredAt: "2026-10-03T11:30:00.000Z", icaoHex: "49D001", callsign: "CSA123", registration: "OK-TST", eventType: null, airportIcao: null, runway: null, confidenceLevel: null, squawk: null, distanceKm: 287 },
          ],
        },
        comparison: null,
      };
      const airportOperationsFixture = {
        airport: { icao: "LKPR", name: "Václav Havel Airport Prague" },
        generatedAt: "2026-10-04T08:00:00.000Z",
        window: "24h",
        provenance: "INFERRED",
        complete: true,
        truncated: false,
        activity: "BUSY",
        likelyRunway: { designator: "24", confidence: "high", sampleCount: 8 },
        arrivals: [
          { flightId: 7001, icaoHex: "49D001", callsign: "CSA123", registration: "OK-TST", movement: "LANDING", confidence: "high", airport: "LKPR", runway: { designator: "24", status: "probable", confidence: "high" }, observedAt: "2026-10-04T07:42:00.000Z", evidence: ["fixture"] },
          { flightId: 7002, icaoHex: "4B1801", callsign: "SWR88", registration: "HB-TST", movement: "GO_AROUND", confidence: "medium", airport: "LKPR", runway: { designator: "24", status: "probable", confidence: "medium" }, observedAt: "2026-10-04T07:35:00.000Z", evidence: ["fixture"] },
        ],
        departures: [
          { flightId: 7003, icaoHex: "440001", callsign: "AUA456", registration: "OE-TST", movement: "TAKEOFF", confidence: "high", airport: "LKPR", runway: { designator: "24", status: "probable", confidence: "high" }, observedAt: "2026-10-04T07:30:00.000Z", evidence: ["fixture"] },
        ],
        approaches: [],
        recentMovements: [
          { flightId: 7001, icaoHex: "49D001", callsign: "CSA123", registration: "OK-TST", movement: "LANDING", confidence: "high", airport: "LKPR", runway: { designator: "24", status: "probable", confidence: "high" }, observedAt: "2026-10-04T07:42:00.000Z", evidence: ["fixture"] },
          { flightId: 7002, icaoHex: "4B1801", callsign: "SWR88", registration: "HB-TST", movement: "GO_AROUND", confidence: "medium", airport: "LKPR", runway: { designator: "24", status: "probable", confidence: "medium" }, observedAt: "2026-10-04T07:35:00.000Z", evidence: ["fixture"] },
          { flightId: 7003, icaoHex: "440001", callsign: "AUA456", registration: "OE-TST", movement: "TAKEOFF", confidence: "high", airport: "LKPR", runway: { designator: "24", status: "probable", confidence: "high" }, observedAt: "2026-10-04T07:30:00.000Z", evidence: ["fixture"] },
          { flightId: 7004, icaoHex: "3C0001", callsign: "DLH789", registration: "D-TST", movement: "HOLDING", confidence: "medium", airport: "LKPR", runway: null, observedAt: "2026-10-04T07:20:00.000Z", evidence: ["fixture"] },
        ],
        runwayUsage: [
          { designator: "24", arrivals: 6, departures: 2, total: 8 },
          { designator: "06", arrivals: 1, departures: 1, total: 2 },
        ],
        wind: [
          { directionDeg: 240, speedKt: 12, runway: "24", headwindKt: 12, crosswindKt: 0 },
          { directionDeg: 240, speedKt: 12, runway: "06", headwindKt: -12, crosswindKt: 0 },
        ],
        goArounds: [
          { flightId: 7002, icaoHex: "4B1801", callsign: "SWR88", registration: "HB-TST", movement: "GO_AROUND", confidence: "medium", airport: "LKPR", runway: { designator: "24", status: "probable", confidence: "medium" }, observedAt: "2026-10-04T07:35:00.000Z", evidence: ["fixture"] },
        ],
        holding: [
          { flightId: 7004, icaoHex: "3C0001", callsign: "DLH789", registration: "D-TST", movement: "HOLDING", confidence: "medium", airport: "LKPR", runway: null, observedAt: "2026-10-04T07:20:00.000Z", evidence: ["fixture"] },
        ],
        diagnostics: { flightsExamined: 18, positionsExamined: 420, queryDurationMs: 9 },
      };
      const airportWeatherFixture = {
        metar: {
          observedAt: "2026-10-04T07:30:00.000Z",
          observationTime: "2026-10-04T07:30:00.000Z",
          windDirectionDeg: 240,
          windSpeedKt: 12,
          windGustKt: 18,
          windVariable: false,
          windCalm: false,
          flightCategory: "VFR",
          visibilityMeters: 10000,
          visibilityGreaterThan: true,
          visibilityLessThan: false,
          temperatureC: 16,
          dewpointC: 8,
          altimeterHpa: 1018,
          cavok: false,
          clouds: [],
          weather: [],
          rawText: "LKPR 040730Z 24012G18KT 9999 FEW030 16/08 Q1018",
        },
        taf: null,
        fetchedAt: "2026-10-04T07:31:00.000Z",
        stale: false,
        enabled: true,
        available: true,
        source: "browser fixture",
      };
      const commandSearchFlightFixture = {
        query: "CSA123",
        aircraft: [],
        airports: [],
        atsPoints: [],
        actions: [],
        flights: [{
          kind: "flight",
          id: 8123,
          icaoHex: "49D001",
          callsign: "CSA123",
          registration: "OK-TST",
          aircraftType: "A320",
          origin: "LKPR",
          destination: "LOWW",
          startTime: "2026-10-04T07:10:00.000Z",
          href: "/flights/8123",
        }],
      };
      const commandSearchActionFixture = {
        query: "LOWW operations",
        aircraft: [],
        airports: [],
        atsPoints: [],
        flights: [],
        actions: [{
          kind: "action",
          intent: "airport_operations",
          airportIcao: "LOWW",
          href: "/airports/LOWW#airport-intelligence-v3",
        }],
      };
      const predictiveReadinessFixture = {
        source: "postgres",
        generatedAt: "2026-10-04T09:00:00.000Z",
        window: { from: "2026-09-04T09:00:00.000Z", to: "2026-10-04T09:00:00.000Z", days: 30 },
        complete: true,
        limits: { observations: 15000, landingEvents: 2500, outcomeEventsPerType: 2500 },
        configuredPolicy: { ETA: "SHADOW", RUNWAY: "SHADOW", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "SHADOW" },
        effectivePolicy: { ETA: "SHADOW", RUNWAY: "SHADOW", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "SHADOW" },
        thresholds: { version: "predictive-readiness-v1" },
        outcomeTruthVersion: "predictive-outcome-truth-v1",
        collection: { observations: 420, landingEvents: 93, outcomeEvents: 47, matchedLandingTruth: 141, captureStaleObservations: 3 },
        integrity: { crossIcaoLifecycleConflicts: 0, crossFlightLifecycleConflicts: 0 },
        capabilities: {
          ETA: {
            capability: "ETA",
            decision: "PASS",
            reasons: [],
            evidence: { observations: 180, scoreableObservations: 142, independentTruthFlights: 81, medianAbsoluteErrorSeconds: 164, p90AbsoluteErrorSeconds: 438, p95AbsoluteErrorSeconds: 702, captureStaleRate: 0.012 },
          },
          RUNWAY: {
            capability: "RUNWAY",
            decision: "WAIT",
            reasons: ["runway.insufficient_independent_truth"],
            evidence: { observations: 132, scoreableObservations: 28, independentTruthFlights: 22, exactEndAccuracy: 0.86, coverage: 0.21, captureStaleRate: 0.008 },
          },
          RUNWAY_CHANGE: {
            capability: "RUNWAY_CHANGE",
            decision: "WAIT",
            reasons: ["runway_change.independent_change_truth_unavailable"],
            evidence: { observations: 22, scoreableObservations: 9, independentTruthFlights: 8, outcomePrecision: 0.78, falsePositiveRate: 0.22, independentChangeTruthAvailable: false, captureStaleRate: 0.01 },
          },
          TRAJECTORY: {
            capability: "TRAJECTORY",
            decision: "WAIT",
            reasons: ["trajectory.state_capture_unavailable", "trajectory.independent_outcome_truth_unavailable"],
            evidence: { observations: 86, candidateObservations: null, validatedCandidates: 0, precision: null, stateCaptureAvailable: false, independentOutcomeTruthAvailable: false, captureStaleRate: 0.006 },
          },
        },
        calibration: {
          version: "predictive-graduation-calibration-v1",
          thresholdVersion: "predictive-readiness-v1",
          complete: true,
          capabilities: {
            ETA: {
              capability: "ETA",
              decision: "PASS",
              phase: "READY",
              manualReviewEligible: true,
              qualityEvaluated: true,
              evidenceDeficits: [],
              truthRequirements: [],
              qualityMargins: [
                { key: "medianAbsoluteErrorSeconds", current: 164, target: 300, direction: "AT_MOST", margin: 136, unit: "SECONDS", satisfied: true },
                { key: "p90AbsoluteErrorSeconds", current: 438, target: 600, direction: "AT_MOST", margin: 162, unit: "SECONDS", satisfied: true },
                { key: "p95AbsoluteErrorSeconds", current: 702, target: 900, direction: "AT_MOST", margin: 198, unit: "SECONDS", satisfied: true },
                { key: "captureStaleRate", current: 0.012, target: 0.05, direction: "AT_MOST", margin: 0.038, unit: "RATE", satisfied: true },
              ],
              integrityBlockers: [],
              collectionBlockers: [],
              readinessReasons: [],
            },
            RUNWAY: {
              capability: "RUNWAY",
              decision: "WAIT",
              phase: "COLLECTING",
              manualReviewEligible: false,
              qualityEvaluated: false,
              evidenceDeficits: [
                { key: "scoreableObservations", current: 28, target: 50, missing: 22, unit: "COUNT" },
                { key: "independentTruthFlights", current: 22, target: 50, missing: 28, unit: "COUNT" },
              ],
              truthRequirements: [],
              qualityMargins: [
                { key: "exactEndAccuracy", current: 0.86, target: 0.85, direction: "AT_LEAST", margin: 0.01, unit: "RATE", satisfied: true },
                { key: "coverage", current: 0.21, target: 0.6, direction: "AT_LEAST", margin: -0.39, unit: "RATE", satisfied: false },
                { key: "captureStaleRate", current: 0.008, target: 0.05, direction: "AT_MOST", margin: 0.042, unit: "RATE", satisfied: true },
              ],
              integrityBlockers: [],
              collectionBlockers: [],
              readinessReasons: ["runway.insufficient_independent_truth"],
            },
            RUNWAY_CHANGE: {
              capability: "RUNWAY_CHANGE",
              decision: "WAIT",
              phase: "TRUTH_BLOCKED",
              manualReviewEligible: false,
              qualityEvaluated: false,
              evidenceDeficits: [
                { key: "observations", current: 22, target: 30, missing: 8, unit: "COUNT" },
                { key: "scoreableObservations", current: 9, target: 20, missing: 11, unit: "COUNT" },
                { key: "independentTruthFlights", current: 8, target: 20, missing: 12, unit: "COUNT" },
              ],
              truthRequirements: [{ key: "independentChangeTruthAvailable", available: false }],
              qualityMargins: [
                { key: "outcomePrecision", current: 0.78, target: 0.8, direction: "AT_LEAST", margin: -0.02, unit: "RATE", satisfied: false },
                { key: "falsePositiveRate", current: 0.22, target: 0.2, direction: "AT_MOST", margin: -0.02, unit: "RATE", satisfied: false },
                { key: "captureStaleRate", current: 0.01, target: 0.05, direction: "AT_MOST", margin: 0.04, unit: "RATE", satisfied: true },
              ],
              integrityBlockers: [],
              collectionBlockers: [],
              readinessReasons: ["runway_change.independent_change_truth_unavailable"],
            },
            TRAJECTORY: {
              capability: "TRAJECTORY",
              decision: "WAIT",
              phase: "TRUTH_BLOCKED",
              manualReviewEligible: false,
              qualityEvaluated: false,
              evidenceDeficits: [
                { key: "observations", current: 86, target: 100, missing: 14, unit: "COUNT" },
                { key: "validatedCandidates", current: 0, target: 50, missing: 50, unit: "COUNT" },
              ],
              truthRequirements: [
                { key: "stateCaptureAvailable", available: false },
                { key: "independentOutcomeTruthAvailable", available: false },
              ],
              qualityMargins: [
                { key: "precision", current: null, target: 0.8, direction: "AT_LEAST", margin: null, unit: "RATE", satisfied: null },
                { key: "captureStaleRate", current: 0.006, target: 0.05, direction: "AT_MOST", margin: 0.044, unit: "RATE", satisfied: true },
              ],
              integrityBlockers: [],
              collectionBlockers: [],
              readinessReasons: ["trajectory.state_capture_unavailable", "trajectory.independent_outcome_truth_unavailable"],
            },
          },
        },
      };
      const etaAdvisoryPublicFixture = {
        prediction: null,
        etaAdvisory: {
          kind: "ETA",
          state: "available",
          estimatedArrivalAt: "2026-10-04T10:28:00.000Z",
          evaluatedAt: "2026-10-04T09:59:52.000Z",
          ageSeconds: 8,
          horizonMinutes: 28,
          confidence: "MEDIUM",
          uncertaintyMinutes: 4,
          uncertaintyBasis: "readiness_p90",
          modelVersion: "predictive-intelligence-v1",
          provenance: "predicted",
        },
      };
      const etaAdvisoryAdminFixture = {
        prediction: null,
        etaAdvisory: null,
        adminPreview: {
          kind: "ETA",
          mode: "SHADOW",
          readiness: "WAIT",
          readinessReasons: ["eta.insufficient_independent_truth"],
          publicEligible: false,
          state: "available",
          estimatedArrivalAt: "2026-10-04T10:28:00.000Z",
          evaluatedAt: "2026-10-04T09:59:52.000Z",
          ageSeconds: 8,
          horizonMinutes: 28,
          confidence: "MEDIUM",
          uncertaintyMinutes: null,
          uncertaintyBasis: "not_calibrated",
          modelVersion: "predictive-intelligence-v1",
          provenance: "predicted",
        },
      };
      const runwayAdvisoryPublicFixture = {
        prediction: null,
        etaAdvisory: null,
        runwayAdvisory: {
          kind: "RUNWAY",
          state: "available",
          runway: "24",
          alternative: "06",
          evaluatedAt: "2026-10-04T09:59:52.000Z",
          ageSeconds: 8,
          confidence: "MEDIUM",
          modelVersion: "predictive-intelligence-v1",
          provenance: "predicted",
        },
      };
      const runwayAdvisoryAdminFixture = {
        prediction: null,
        etaAdvisory: null,
        runwayAdvisory: null,
        runwayAdminPreview: {
          kind: "RUNWAY",
          mode: "SHADOW",
          readiness: "WAIT",
          readinessReasons: ["runway.insufficient_independent_truth"],
          publicEligible: false,
          state: "available",
          runway: "24",
          alternative: "06",
          evaluatedAt: "2026-10-04T09:59:52.000Z",
          ageSeconds: 8,
          confidence: "MEDIUM",
          exactEndAccuracy: 0.82,
          coverage: 0.58,
          modelVersion: "predictive-intelligence-v1",
          provenance: "predicted",
        },
      };
      const runwayChangeAdvisoryPublicFixture = {
        prediction: null,
        etaAdvisory: null,
        runwayAdvisory: null,
        runwayChangeAdvisory: {
          kind: "RUNWAY_CHANGE",
          state: "available",
          changedFrom: "06",
          runway: "24",
          changedAt: "2026-10-04T09:59:15.000Z",
          evaluatedAt: "2026-10-04T09:59:52.000Z",
          ageSeconds: 8,
          changeAgeSeconds: 45,
          confidence: "MEDIUM",
          modelVersion: "predictive-intelligence-v1",
          provenance: "predicted",
        },
      };
      const runwayChangeAdvisoryAdminFixture = {
        prediction: null,
        etaAdvisory: null,
        runwayAdvisory: null,
        runwayChangeAdvisory: null,
        runwayChangeAdminPreview: {
          kind: "RUNWAY_CHANGE",
          mode: "SHADOW",
          readiness: "WAIT",
          readinessReasons: ["runway_change.independent_change_truth_unavailable"],
          publicEligible: false,
          state: "available",
          changedFrom: "06",
          runway: "24",
          changedAt: "2026-10-04T09:59:15.000Z",
          evaluatedAt: "2026-10-04T09:59:52.000Z",
          ageSeconds: 8,
          changeAgeSeconds: 45,
          confidence: "MEDIUM",
          outcomePrecision: 0.88,
          falsePositiveRate: 0.12,
          independentChangeTruthAvailable: false,
          modelVersion: "predictive-intelligence-v1",
          provenance: "predicted",
        },
      };
      const trajectoryAdvisoryPublicFixture = {
        prediction: null,
        etaAdvisory: null,
        runwayAdvisory: null,
        runwayChangeAdvisory: null,
        trajectoryAdvisory: {
          kind: "TRAJECTORY",
          state: "available",
          trajectoryState: "DEVIATING",
          evaluatedAt: "2026-10-04T09:59:52.000Z",
          ageSeconds: 8,
          confidence: "MEDIUM",
          modelVersion: "predictive-intelligence-v1",
          provenance: "predicted",
        },
      };
      const trajectoryAdvisoryAdminFixture = {
        prediction: null,
        etaAdvisory: null,
        runwayAdvisory: null,
        runwayChangeAdvisory: null,
        trajectoryAdvisory: null,
        trajectoryAdminPreview: {
          kind: "TRAJECTORY",
          mode: "SHADOW",
          readiness: "WAIT",
          readinessReasons: ["trajectory.independent_outcome_truth_unavailable"],
          publicEligible: false,
          state: "available",
          trajectoryState: "POSSIBLE_DEVIATION",
          evaluatedAt: "2026-10-04T09:59:52.000Z",
          ageSeconds: 8,
          confidence: "LOW",
          candidateObservations: 42,
          validatedCandidates: 0,
          precision: null,
          stateCaptureAvailable: true,
          independentOutcomeTruthAvailable: false,
          modelVersion: "predictive-intelligence-v1",
          provenance: "predicted",
        },
      };
      const predictiveOperationsEvaluatedAt = new Date(Date.now() - 8_000).toISOString();
      const predictiveOperationsEtaAt = new Date(Date.now() + 28 * 60_000).toISOString();
      const predictiveOperationsLogbookFixture = {
        source: "postgres",
        generatedAt: new Date().toISOString(),
        liveAircraft: 1,
        uniqueAircraftToday: 1,
        newAircraftToday: 0,
        rareAircraftToday: 1,
        returningAircraftToday: 0,
        watchlistedLiveAircraft: 0,
        interestingAircraft: [{
          icaoHex: "896139",
          labels: ["rare"],
          reasons: ["rare"],
          flightCount: 2,
          returningGapDays: null,
          isLive: true,
          callsign: "UAE123",
          registration: "A6-EOT",
          aircraftType: "A388",
          distanceKm: 48,
        }],
        todayReceptionRecord: null,
        lifetimeReceptionRecord: null,
      };
      const predictiveOperationsPublicFixture = {
        generatedAt: new Date().toISOString(),
        items: [{
          icaoHex: "896139",
          label: "UAE123",
          callsign: "UAE123",
          registration: "A6-EOT",
          destination: "LOWW",
          etaAdvisory: {
            kind: "ETA",
            state: "available",
            estimatedArrivalAt: predictiveOperationsEtaAt,
            evaluatedAt: predictiveOperationsEvaluatedAt,
            ageSeconds: 8,
            horizonMinutes: 28,
            confidence: "MEDIUM",
            uncertaintyMinutes: 4,
            uncertaintyBasis: "readiness_p90",
            modelVersion: "predictive-intelligence-v1",
            provenance: "predicted",
          },
          runwayAdvisory: {
            kind: "RUNWAY",
            state: "available",
            runway: "24",
            alternative: "06",
            evaluatedAt: predictiveOperationsEvaluatedAt,
            ageSeconds: 8,
            confidence: "MEDIUM",
            modelVersion: "predictive-intelligence-v1",
            provenance: "predicted",
          },
          runwayChangeAdvisory: null,
          trajectoryAdvisory: {
            kind: "TRAJECTORY",
            state: "available",
            trajectoryState: "DEVIATING",
            evaluatedAt: predictiveOperationsEvaluatedAt,
            ageSeconds: 8,
            confidence: "MEDIUM",
            modelVersion: "predictive-intelligence-v1",
            provenance: "predicted",
          },
        }],
      };
      const predictiveOperationsAdminFixture = {
        generatedAt: new Date().toISOString(),
        items: [{
          icaoHex: "896139",
          label: "UAE123",
          callsign: "UAE123",
          registration: "A6-EOT",
          destination: "LOWW",
          etaAdvisory: null,
          runwayAdvisory: null,
          runwayChangeAdvisory: null,
          trajectoryAdvisory: null,
          etaAdminPreview: {
            kind: "ETA",
            mode: "SHADOW",
            readiness: "WAIT",
            readinessReasons: ["eta.insufficient_independent_truth"],
            publicEligible: false,
            state: "available",
            estimatedArrivalAt: predictiveOperationsEtaAt,
            evaluatedAt: predictiveOperationsEvaluatedAt,
            ageSeconds: 8,
            horizonMinutes: 28,
            confidence: "MEDIUM",
            uncertaintyMinutes: null,
            uncertaintyBasis: "not_calibrated",
            modelVersion: "predictive-intelligence-v1",
            provenance: "predicted",
          },
          runwayAdminPreview: {
            kind: "RUNWAY",
            mode: "SHADOW",
            readiness: "WAIT",
            readinessReasons: ["runway.insufficient_independent_truth"],
            publicEligible: false,
            state: "available",
            runway: "24",
            alternative: "06",
            evaluatedAt: predictiveOperationsEvaluatedAt,
            ageSeconds: 8,
            confidence: "MEDIUM",
            exactEndAccuracy: 0.82,
            coverage: 0.58,
            modelVersion: "predictive-intelligence-v1",
            provenance: "predicted",
          },
          trajectoryAdminPreview: {
            kind: "TRAJECTORY",
            mode: "SHADOW",
            readiness: "WAIT",
            readinessReasons: ["trajectory.independent_outcome_truth_unavailable"],
            publicEligible: false,
            state: "available",
            trajectoryState: "POSSIBLE_DEVIATION",
            evaluatedAt: predictiveOperationsEvaluatedAt,
            ageSeconds: 8,
            confidence: "LOW",
            candidateObservations: 42,
            validatedCandidates: 0,
            precision: null,
            stateCaptureAvailable: true,
            independentOutcomeTruthAvailable: false,
            modelVersion: "predictive-intelligence-v1",
            provenance: "predicted",
          },
        }],
        adminReadiness: {
          ETA: { decision: "WAIT", reasons: ["eta.insufficient_independent_truth"] },
          RUNWAY: { decision: "WAIT", reasons: ["runway.insufficient_independent_truth"] },
          RUNWAY_CHANGE: { decision: "WAIT", reasons: ["runway_change.independent_change_truth_unavailable"] },
          TRAJECTORY: { decision: "WAIT", reasons: ["trajectory.independent_outcome_truth_unavailable"] },
        },
      };
      const visualTargets = [
        { name: "radar-desktop", path: "/?mapDiagnostics=1", selector: ".radar-content", viewport: { width: 1366, height: 900 }, fullPage: false },
        { name: "operations-center-desktop", path: "/?mapDiagnostics=1", selector: ".radar-content", viewport: { width: 1366, height: 900 }, fullPage: false, openOperationsCenter: true },
        { name: "predictive-operations-public-desktop", path: "/?mapDiagnostics=1", selector: ".radar-content", viewport: { width: 1366, height: 900 }, fullPage: false, openOperationsCenter: true, mockPredictiveOperations: "public" },
        { name: "radar-desktop-selected", path: "/?mapDiagnostics=1", selector: ".radar-content", viewport: { width: 1366, height: 900 }, fullPage: false, selectAircraft: true },
        { name: "radar-tablet-landscape-selected", path: "/?mapDiagnostics=1", selector: ".radar-content", viewport: { width: 1024, height: 768 }, fullPage: false, selectAircraft: true },
        { name: "radar-tablet-portrait-selected", path: "/?mapDiagnostics=1", selector: ".radar-content", viewport: { width: 768, height: 1024 }, fullPage: false, selectAircraft: true },
        { name: "statistics-desktop", path: "/statistics", selector: ".statistics-page", viewport: { width: 1366, height: 900 }, fullPage: true },
        { name: "command-search-desktop", path: "/statistics", selector: ".statistics-page", viewport: { width: 1366, height: 900 }, fullPage: false, openCommandPalette: true, commandQuery: "CSA123", mockCommandSearch: "flight", commandExpected: "Historické lety" },
        { name: "daily-intelligence-desktop", path: "/recap/daily", selector: '[data-testid="daily-intelligence"]', viewport: { width: 1366, height: 900 }, fullPage: true, mockDailyRecap: true },
        { name: "airport-intelligence-v3-desktop", path: "/airports/LKPR", selector: '[data-testid="airport-intelligence-v3"]', viewport: { width: 1366, height: 900 }, fullPage: true, mockAirportV3: true },
        { name: "time-machine-desktop", path: "/time-machine", selector: ".time-machine-page", viewport: { width: 1366, height: 900 }, fullPage: true },
        { name: "system-desktop", path: "/system", selector: ".system-page", viewport: { width: 1366, height: 900 }, fullPage: true },
        { name: "predictive-readiness-desktop", path: "/system", selector: '[data-testid="predictive-readiness"]', viewport: { width: 1366, height: 900 }, fullPage: true, mockPredictiveReadiness: true },
        { name: "radar-mobile", path: "/?mapDiagnostics=1", selector: ".radar-content", viewport: { width: 390, height: 844 }, fullPage: false },
        { name: "operations-center-mobile", path: "/?mapDiagnostics=1", selector: ".radar-content", viewport: { width: 390, height: 844 }, fullPage: false, openOperationsCenter: true },
        { name: "predictive-operations-admin-mobile", path: "/?mapDiagnostics=1", selector: ".radar-content", viewport: { width: 390, height: 844 }, fullPage: false, openOperationsCenter: true, mockPredictiveOperations: "admin" },
        { name: "radar-mobile-selected", path: "/?mapDiagnostics=1", selector: ".radar-content", viewport: { width: 390, height: 844 }, fullPage: false, selectAircraft: true },
        { name: "statistics-mobile", path: "/statistics", selector: ".statistics-page", viewport: { width: 390, height: 844 }, fullPage: true },
        { name: "command-search-mobile", path: "/statistics", selector: ".statistics-page", viewport: { width: 390, height: 844 }, fullPage: false, openCommandPalette: true, commandQuery: "LOWW operations", mockCommandSearch: "action", commandExpected: "LOWW Operations" },
        { name: "daily-intelligence-mobile", path: "/recap/daily", selector: '[data-testid="daily-intelligence"]', viewport: { width: 390, height: 844 }, fullPage: true, mockDailyRecap: true },
        { name: "airport-intelligence-v3-mobile", path: "/airports/LKPR", selector: '[data-testid="airport-intelligence-v3"]', viewport: { width: 390, height: 844 }, fullPage: true, mockAirportV3: true },
        { name: "predictive-readiness-mobile", path: "/system", selector: '[data-testid="predictive-readiness"]', viewport: { width: 390, height: 844 }, fullPage: true, mockPredictiveReadiness: true },
        { name: "aircraft-detail-desktop", path: "/aircraft/896139", selector: ".aircraft-page", viewport: { width: 1366, height: 900 }, fullPage: false },
        { name: "predictive-eta-public-desktop", path: "/aircraft/896139", selector: '[data-testid="predictive-eta-advisory"]', viewport: { width: 1366, height: 900 }, fullPage: false, mockEtaAdvisory: "public" },
        { name: "predictive-runway-public-desktop", path: "/aircraft/896139", selector: '[data-testid="predictive-runway-advisory"]', viewport: { width: 1366, height: 900 }, fullPage: false, mockRunwayAdvisory: "public" },
        { name: "predictive-runway-change-public-desktop", path: "/aircraft/896139", selector: '[data-testid="predictive-runway-change-advisory"]', viewport: { width: 1366, height: 900 }, fullPage: false, mockRunwayChangeAdvisory: "public" },
        { name: "predictive-trajectory-public-desktop", path: "/aircraft/896139", selector: '[data-testid="predictive-trajectory-advisory"]', viewport: { width: 1366, height: 900 }, fullPage: false, mockTrajectoryAdvisory: "public" },
        { name: "aircraft-detail-tablet", path: "/aircraft/896139", selector: ".aircraft-page", viewport: { width: 768, height: 1024 }, fullPage: false },
        { name: "aircraft-detail-mobile", path: "/aircraft/896139", selector: ".aircraft-page", viewport: { width: 390, height: 844 }, fullPage: false },
        { name: "predictive-eta-admin-mobile", path: "/aircraft/896139", selector: '[data-testid="predictive-eta-advisory"]', viewport: { width: 390, height: 844 }, fullPage: false, mockEtaAdvisory: "admin" },
        { name: "predictive-runway-admin-mobile", path: "/aircraft/896139", selector: '[data-testid="predictive-runway-advisory"]', viewport: { width: 390, height: 844 }, fullPage: false, mockRunwayAdvisory: "admin" },
        { name: "predictive-runway-change-admin-mobile", path: "/aircraft/896139", selector: '[data-testid="predictive-runway-change-advisory"]', viewport: { width: 390, height: 844 }, fullPage: false, mockRunwayChangeAdvisory: "admin" },
        { name: "predictive-trajectory-admin-mobile", path: "/aircraft/896139", selector: '[data-testid="predictive-trajectory-advisory"]', viewport: { width: 390, height: 844 }, fullPage: false, mockTrajectoryAdvisory: "admin" },
        { name: "aircraft-detail-telemetry-expanded", path: "/aircraft/896139", selector: ".aircraft-page", viewport: { width: 1366, height: 900 }, fullPage: false, expandTelemetry: true },
        { name: "aircraft-detail-receiver", path: "/aircraft/896139", selector: ".aircraft-page", viewport: { width: 1366, height: 900 }, fullPage: false, expandReceiver: true },
      ];

      for (const target of visualTargets) {
        const visualPage = await browser.newPage({ viewport: target.viewport });
        try {
          if (target.mockPredictiveOperations) {
            await visualPage.route("**/api/logbook/summary", async (route) => {
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(predictiveOperationsLogbookFixture) });
            });
            await visualPage.route("**/api/alerts?*", async (route) => {
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
            });
            await visualPage.route(/\/api\/operations\/predictive(?:\?.*)?$/, async (route) => {
              const body = target.mockPredictiveOperations === "public" ? predictiveOperationsPublicFixture : predictiveOperationsAdminFixture;
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
            });
          }
          if (target.mockDailyRecap) {
            await visualPage.route("**/api/recap?range=daily", async (route) => {
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dailyRecapFixture) });
            });
          }
          if (target.mockAirportV3) {
            await visualPage.route("**/api/airports/LKPR/operations?period=24h", async (route) => {
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(airportOperationsFixture) });
            });
            await visualPage.route("**/api/weather/airport/LKPR", async (route) => {
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(airportWeatherFixture) });
            });
          }
          if (target.mockCommandSearch) {
            await visualPage.route("**/api/search?q=*", async (route) => {
              const body = target.mockCommandSearch === "flight" ? commandSearchFlightFixture : commandSearchActionFixture;
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
            });
          }
          if (target.mockEtaAdvisory) {
            await visualPage.route("**/api/aircraft/896139/prediction", async (route) => {
              const body = target.mockEtaAdvisory === "public" ? etaAdvisoryPublicFixture : etaAdvisoryAdminFixture;
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
            });
          }
          if (target.mockRunwayAdvisory) {
            await visualPage.route("**/api/aircraft/896139/prediction", async (route) => {
              const body = target.mockRunwayAdvisory === "public" ? runwayAdvisoryPublicFixture : runwayAdvisoryAdminFixture;
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
            });
          }
          if (target.mockRunwayChangeAdvisory) {
            await visualPage.route("**/api/aircraft/896139/prediction", async (route) => {
              const body = target.mockRunwayChangeAdvisory === "public" ? runwayChangeAdvisoryPublicFixture : runwayChangeAdvisoryAdminFixture;
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
            });
          }
          if (target.mockTrajectoryAdvisory) {
            await visualPage.route("**/api/aircraft/896139/prediction", async (route) => {
              const body = target.mockTrajectoryAdvisory === "public" ? trajectoryAdvisoryPublicFixture : trajectoryAdvisoryAdminFixture;
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
            });
          }
          if (target.mockPredictiveReadiness) {
            await visualPage.route("**/api/system/status", async (route) => {
              const upstream = await route.fetch();
              const body = await upstream.json();
              await route.fulfill({
                status: upstream.status(),
                headers: { ...upstream.headers(), "content-type": "application/json" },
                body: JSON.stringify({ ...body, detailLevel: "admin" }),
              });
            });
            await visualPage.route("**/api/system/stream", async (route) => { await route.abort(); });
            await visualPage.route("**/api/admin/predictive/readiness", async (route) => {
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(predictiveReadinessFixture) });
            });
          }
          const response = await visualPage.goto(`${baseUrl}${target.path}`, { waitUntil: "domcontentloaded" });
          if (!response?.ok()) throw new Error(`Visual smoke ${target.path} returned HTTP ${response?.status()}`);
          await visualPage.locator(target.selector).waitFor({ state: "visible", timeout: 15_000 });
          if (target.openOperationsCenter) {
            const operationsTrigger = visualPage.locator('[data-testid="operations-center-trigger"]');
            await operationsTrigger.waitFor({ state: "visible", timeout: 15_000 });
            await operationsTrigger.click();
            await visualPage.locator('[data-testid="operations-center-panel"]').waitFor({ state: "visible", timeout: 15_000 });
          }
          if (target.mockPredictiveOperations) {
            await visualPage.locator('[data-testid="predictive-operations-center"]').waitFor({ state: "visible", timeout: 15_000 });
            await visualPage.getByText("UAE123", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
            await visualPage.getByText("24", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
            if (target.mockPredictiveOperations === "admin") {
              await visualPage.locator('[data-testid="predictive-operations-readiness"]').waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText("ETA WAIT", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText("RWY WAIT", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText("TRJ WAIT", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText("Možná odchylka", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
            } else {
              await visualPage.getByText("Odchylka", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
            }
          }
          if (target.mockDailyRecap) {
            await visualPage.locator('[data-testid="daily-intelligence-timeline"]').waitFor({ state: "visible", timeout: 15_000 });
          }
          if (target.mockAirportV3) {
            await visualPage.locator('[data-testid="airport-v3-timeline"]').waitFor({ state: "visible", timeout: 15_000 });
            await visualPage.getByText("CSA123").first().waitFor({ state: "visible", timeout: 15_000 });
          }
          if (target.mockPredictiveReadiness) {
            await visualPage.locator('[data-testid="predictive-readiness"]').waitFor({ state: "visible", timeout: 15_000 });
            await visualPage.getByText("ETA", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
            await visualPage.getByText("PASS", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
            await visualPage.getByText("WAIT", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
          }
          if (target.mockEtaAdvisory) {
            await visualPage.locator('[data-testid="predictive-eta-advisory"]').waitFor({ state: "visible", timeout: 15_000 });
            if (target.mockEtaAdvisory === "public") {
              await visualPage.getByText("Predikovaný přílet").first().waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText(/± 4 min/).first().waitFor({ state: "visible", timeout: 15_000 });
            } else {
              await visualPage.getByText("ADMIN · SHADOW PREVIEW").first().waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText(/WAIT/).first().waitFor({ state: "visible", timeout: 15_000 });
            }
          }
          if (target.mockRunwayAdvisory) {
            await visualPage.locator('[data-testid="predictive-runway-advisory"]').waitFor({ state: "visible", timeout: 15_000 });
            if (target.mockRunwayAdvisory === "public") {
              await visualPage.getByText("Predikovaná dráha").first().waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText("24", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
            } else {
              await visualPage.getByText("ADMIN · SHADOW PREVIEW").first().waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText(/WAIT/).first().waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText(/82 %/).first().waitFor({ state: "visible", timeout: 15_000 });
            }
          }
          if (target.mockRunwayChangeAdvisory) {
            await visualPage.locator('[data-testid="predictive-runway-change-advisory"]').waitFor({ state: "visible", timeout: 15_000 });
            await visualPage.getByText("Predikovaná změna dráhy").first().waitFor({ state: "visible", timeout: 15_000 });
            await visualPage.getByText("06 → 24", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
            if (target.mockRunwayChangeAdvisory === "admin") {
              await visualPage.getByText("ADMIN · SHADOW PREVIEW").first().waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText(/WAIT/).first().waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText(/88 %/).first().waitFor({ state: "visible", timeout: 15_000 });
            }
          }
          if (target.mockTrajectoryAdvisory) {
            await visualPage.locator('[data-testid="predictive-trajectory-advisory"]').waitFor({ state: "visible", timeout: 15_000 });
            await visualPage.getByText("Predikce trajektorie").first().waitFor({ state: "visible", timeout: 15_000 });
            if (target.mockTrajectoryAdvisory === "public") {
              await visualPage.getByText("Odchylka", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
            } else {
              await visualPage.getByText("ADMIN · SHADOW PREVIEW").first().waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText("Možná odchylka", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText(/WAIT/).first().waitFor({ state: "visible", timeout: 15_000 });
              await visualPage.getByText(/42/).first().waitFor({ state: "visible", timeout: 15_000 });
            }
          }
          if (target.openCommandPalette) {
            await visualPage.keyboard.press("Control+K");
            await visualPage.locator('[data-testid="command-palette"]').waitFor({ state: "visible", timeout: 15_000 });
            const commandInput = visualPage.locator("#command-palette-input");
            await commandInput.waitFor({ state: "visible", timeout: 15_000 });
            if (target.commandQuery) {
              await commandInput.fill(target.commandQuery);
              await visualPage.getByText(target.commandExpected).first().waitFor({ state: "visible", timeout: 15_000 });
            }
          }
          if (target.selectAircraft) {
            const trafficTrigger = visualPage.locator('[data-testid="traffic-trigger"]');
            if (await trafficTrigger.isVisible()) await trafficTrigger.click();
            const sidebar = visualPage.locator('[data-testid="radar-sidebar"]');
            const collapse = sidebar.locator(".mobile-collapse");
            if (target.viewport.width <= 820 && await collapse.isVisible()) await collapse.click();
            await sidebar.locator(".aircraft-row").first().waitFor({ state: "visible", timeout: 15_000 });
            await sidebar.locator(".aircraft-row").first().click();
            await visualPage.locator('[data-testid="aircraft-quick-detail"]').waitFor({ state: "visible", timeout: 15_000 });
          }
          if (target.expandTelemetry) {
            const disclosure = visualPage.locator(".aircraft-adsb-telemetry-disclosure");
            await disclosure.waitFor({ state: "visible", timeout: 15_000 });
            await disclosure.click();
          }
          if (target.expandReceiver) {
            const sources = visualPage.locator("#aircraft-receiver details");
            await sources.waitFor({ state: "visible", timeout: 15_000 });
            await sources.locator("summary").click();
          }
          await visualPage.evaluate(async () => {
            if ("fonts" in document) await document.fonts.ready;
          });
          if (target.path.includes("mapDiagnostics=1")) {
            await visualPage.waitForFunction(() => {
              const map = window.__airradarMapForDiagnostics;
              // The visual contract is the rendered AirRadar UI. Map style
              // and tile completion depend on external providers and must
              // not make CI fail when a remote request is delayed.
              return Boolean(map);
            }, undefined, { timeout: 15_000 });
          }
          await visualPage.addStyleTag({
            content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
          });
          await visualPage.screenshot({
            path: resolve(visualSmokeDirectory, `${target.name}.png`),
            fullPage: target.fullPage,
            animations: "disabled",
          });
          console.log(`[production-gates] visual smoke captured ${target.name}`);
        } finally {
          await visualPage.close();
        }
      }
    };
    const responsiveSweepPromise = configuredViewport ? Promise.resolve() : (async () => {
      const sweepPage = await browser.newPage({ viewport: { width: 821, height: 900 } });
      try {
        await sweepPage.goto(`${baseUrl}/?mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
        await sweepPage.locator("h1").first().waitFor({ state: "visible" });
        const sweepFailures = [];
        // Exercise breakpoint boundaries without paying for a full page reload
        // at every width. This runs concurrently with the secondary-route smoke.
        const sweepWidths = [430, 480, 700, 720, 820, 821, 899, 900, 901, 950, 951, 1024, 1100, 1101, 1400, 1401];
        for (const width of sweepWidths) {
          await sweepPage.setViewportSize({ width, height: 900 });
          const metrics = await sweepPage.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
          if (metrics.scrollWidth > metrics.innerWidth + 1) sweepFailures.push({ width, ...metrics });
        }
        if (sweepFailures.length) throw new Error(`Responsive width sweep failed: ${JSON.stringify(sweepFailures.slice(0, 10))}`);
        console.log(`[production-gates] responsive width sweep ${sweepWidths.join(",")} failures=0 pageReloads=1`);
      } finally {
        await sweepPage.close();
      }
    })();
    const routeErrors = [];
    const routeWarnings = [];
    const unavailable = [];
    const configureRouteSmokePage = (page) => {
      page.on("pageerror", (error) => routeErrors.push(`page: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && !textReferencesHostname(message.text(), "tile.openstreetmap.org") && !message.text().includes("503 (Service Unavailable)") && !message.text().includes("InvalidStateError: The source image could not be decoded")) {
          const location = message.location();
          const source = location.url ? ` @ ${location.url}:${location.lineNumber}:${location.columnNumber}` : "";
          routeErrors.push(`console.error: ${message.text()}${source}`);
        }
        if (message.type() === "warning") routeWarnings.push(message.text());
      });
      page.on("response", (response) => { if (response.status() >= 500 && !urlHasHostname(response.url(), "tile.openstreetmap.org")) { if (response.status() === 503 && (/\/api\/(history|time-machine)\//.test(response.url()))) unavailable.push(`${response.status()}: ${response.url()}`); else routeErrors.push(`http ${response.status()}: ${response.url()}`); } });
      return page;
    };
    const routes = [
      ["/history", ".history-page"], ["/statistics", ".statistics-page"], ["/fleet", ".fleet-page"],
      ["/time-machine", ".time-machine-page"], ["/intelligence", ".intelligence-page"], ["/watchlist", ".watchlist-page"],
      ["/alerts", ".alert-history-page"], ["/recap/daily", ".recap-page"], ["/recap/weekly", ".recap-page"],
      ["/system", ".system-page"], ["/receiver/coverage", ".statistics-page"],
    ];
    const routePages = await Promise.all(Array.from({ length: 3 }, async () => configureRouteSmokePage(await browser.newPage({ viewport: { width: 1280, height: 800 } }))));
    await Promise.all(routePages.map(async (page, workerIndex) => {
      for (let routeIndex = workerIndex; routeIndex < routes.length; routeIndex += routePages.length) {
        const [path, rootSelector] = routes[routeIndex];
        let response;
        try {
          response = await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
        } catch (error) {
          throw new Error(`Secondary route ${path} navigation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!response?.ok()) throw new Error(`Secondary route ${path} returned HTTP ${response?.status()}`);
        await page.locator(rootSelector).waitFor({ state: "visible", timeout: 15_000 });
        await page.locator("h1").first().waitFor({ state: "visible", timeout: 15_000 });
      }
    }));
    const routeSmoke = routePages[0];
    await Promise.all(routePages.slice(1).map((page) => page.close()));
    if (routeErrors.length) throw new Error(`Secondary route smoke failed: ${routeErrors.join(" | ")}`);
    if (unavailable.length) console.log(`[production-gates] expected unavailable API responses observed=${unavailable.length}`);
    await routeSmoke.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await routeSmoke.locator('a[href="/history"]:visible').first().click();
    await routeSmoke.waitForURL("**/history");
    await routeSmoke.locator("h1").first().waitFor({ state: "visible" });
    await routeSmoke.setViewportSize({ width: 390, height: 844 });
    await routeSmoke.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await routeSmoke.locator(".mobile-bottom-more > summary").click();
    await routeSmoke.locator(".mobile-bottom-more a").first().click();
    await routeSmoke.waitForURL(/\/(?:alerts|fleet|intelligence|recap|system|watchlist)/);
    if (routeErrors.length) throw new Error(`Navigation smoke failed: ${routeErrors.join(" | ")}`);
    if (routeWarnings.length) console.log(`[production-gates] browser console warnings observed=${routeWarnings.length}`);
    await routeSmoke.close();
    await responsiveSweepPromise;
    await captureVisualSmoke();
    const browserViewports = [
      { width: 320, height: 568 },
      { width: 320, height: 844 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 820, height: 1180 },
      { width: 821, height: 1000 },
      { width: 1024, height: 768 },
      { width: 1024, height: 1366 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1100, height: 900 },
      { width: 1920, height: 1080 },
    ];
    const viewports = configuredViewport
      ? browserViewports.filter((viewport) => `${viewport.width}x${viewport.height}` === configuredViewport)
      : browserViewports;
    if (configuredViewport && viewports.length !== 1) throw new Error(`Unknown PRODUCTION_GATE_BROWSER_VIEWPORT=${configuredViewport}`);
    for (const viewport of viewports) {
      console.log(`[production-gates] browser viewport ${viewport.width}x${viewport.height}`);
      const fullSmoke = isProductionGateFullSmokeViewport(viewport);
      const markerSmoke = isProductionGateMarkerSmokeViewport(viewport);
      const dataLayerSmoke = fullSmoke && viewport.width >= 821;
      const viewportStartedAt = performance.now();
      const logViewportPhase = (phase, startedAt) => {
        if (fullSmoke) console.log(`[production-gates] viewport ${viewport.width}px phase=${phase} durationMs=${Math.round(performance.now() - startedAt)}`);
      };
      const page = await browser.newPage({ viewport });
      const fixtureRequests = { airports: 0, atc: 0, ats: 0, context: 0 };
      const originalWaitForFunction = page.waitForFunction.bind(page);
      page.waitForFunction = async (...args) => {
        try {
          return await originalWaitForFunction(...args);
        } catch (error) {
          const predicate = typeof args[0] === "function" ? args[0].toString().replace(/\s+/g, " ").slice(0, 240) : String(args[0]);
          const diagnostics = await page.evaluate(() => {
            const map = window.__airradarMapForDiagnostics;
            const layerIds = ["atc-sectors-context-highlight", "ats-route-context-highlight"];
            const sourceFeature = (sourceId, property, value) => {
              try { return Boolean(map?.getSource(sourceId) && map.querySourceFeatures(sourceId).some((feature) => feature.properties?.[property] === value)); } catch { return false; }
            };
            const layer = (id) => ({
              exists: Boolean(map?.getLayer(id)),
              filter: map?.getLayer(id) ? map.getFilter(id) : null,
              visibility: map?.getLayer(id) ? map.getLayoutProperty(id, "visibility") : null,
            });
            const containerRect = map?.getContainer()?.getBoundingClientRect?.() ?? null;
            const sourceLoaded = (sourceId) => {
              try { return map ? map.isSourceLoaded(sourceId) : null; } catch { return null; }
            };
            return {
              url: window.location.href,
              query: Object.fromEntries(new URLSearchParams(window.location.search)),
              navigation: performance.getEntriesByType("navigation").map((entry) => ({ type: entry.type, redirectCount: entry.redirectCount })),
              map: {
                exists: Boolean(map),
                // `isStyleLoaded()` also waits for source tile managers. Keep
                // it alongside the style event so a diagnostic can tell a
                // style lifecycle issue from remote raster-tile latency.
                styleEventLoaded: Boolean(window.__airradarMapStyleLoadedForDiagnostics),
                styleLoadCount: window.__airradarMapStyleLoadCountForDiagnostics ?? 0,
                styleLoaded: Boolean(map?.isStyleLoaded()),
                mapLoaded: Boolean(map?.loaded()),
                tilesLoaded: Boolean(map?.areTilesLoaded()),
                container: containerRect ? { width: containerRect.width, height: containerRect.height } : null,
                resizeCount: window.__airradarMapResizeCountForDiagnostics ?? 0,
                sources: { openmaptiles: sourceLoaded("openmaptiles") },
                layers: Object.fromEntries(layerIds.map((id) => [id, layer(id)])),
                fixtureData: {
                  atc: sourceFeature("atc-sectors", "id", "fixture-sector"),
                  ats: sourceFeature("ats-routes", "segmentId", "fixture-segment"),
                },
              },
            };
          }).catch((diagnosticError) => ({ evaluationError: String(diagnosticError) }));
          throw new Error(`browser predicate timed out at ${viewport.width}px: ${predicate}; diagnostics=${JSON.stringify({ ...diagnostics, fixtureRequests })}; ${error instanceof Error ? error.message : String(error)}`);
        }
      };
      const browserErrors = [];
      let expectedRateLimitedTileErrors = 0;
      let expectedRateLimitedApiErrors = 0;
      let airportAttempts = 0;
      let atcAttempts = 0;
      page.on("console", (message) => {
        if (message.type() !== "error" || message.text().includes("503")) return;
        const location = message.location().url || "(unknown location)";
        if (message.text().includes("429") && expectedRateLimitedTileErrors > 0) {
          expectedRateLimitedTileErrors -= 1;
          return;
        }
        if (message.text().includes("429") && expectedRateLimitedApiErrors > 0) {
          expectedRateLimitedApiErrors -= 1;
          return;
        }
        browserErrors.push(`console: ${message.text()} location=${location}`);
      });
      page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
      page.on("worker", (worker) => worker.on("error", (error) => browserErrors.push(`worker: ${error.message}`)));
      page.on("response", (response) => {
        if (response.status() >= 400) {
          if (response.status() === 429 && urlHasHostname(response.url(), "tile.openstreetmap.org")) {
            expectedRateLimitedTileErrors += 1;
            const request = response.request();
            console.log(`[production-gates] expected HTTP 429 ${response.url()} resourceType=${request.resourceType()} initiator=${request.frame()?.url() ?? "(no frame)"}`);
            return;
          }
          if (response.status() === 429 && new URL(response.url()).pathname === "/api/logbook/summary") {
            expectedRateLimitedApiErrors += 1;
            console.log(`[production-gates] expected HTTP 429 ${response.url()} resourceType=${response.request().resourceType()} initiator=${response.request().frame()?.url() ?? "(no frame)"}`);
            return;
          }
          const request = response.request();
          const frameUrl = request.frame()?.url() ?? "(no frame)";
          browserErrors.push(`http ${response.status()}: ${response.url()} resourceType=${request.resourceType()} initiator=${frameUrl}`);
        }
      });
      await page.route("**/api/airports**", async (route) => {
        fixtureRequests.airports += 1;
        airportAttempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 25));
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { icaoCode: "LKFIX", iataCode: "FIX", name: "Browser fixture airport", city: "Fixture", country: "CZ", latitude: 50.0755, longitude: 14.4378, type: "large_airport" },
            { icaoCode: "LKSML", iataCode: null, name: "Browser fixture small field", city: "Fixture", country: "CZ", latitude: 50.15, longitude: 14.55, type: "small_airport" },
          ]),
        });
      });
      await page.route("**/api/atc/sectors**", async (route) => {
        fixtureRequests.atc += 1;
        atcAttempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 25));
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
          sectors: [{
            id: "fixture-sector",
            name: "Browser fixture sector",
            atcCallsign: "FIXTURE",
            service: "ACC",
            polygons: [[[14.25, 49.9], [14.65, 49.9], [14.65, 50.25], [14.25, 50.25], [14.25, 49.9]]],
            lowerAltitudeFt: 0,
            upperAltitudeFt: 66000,
            lowerAltitudeReference: "SFC",
            upperAltitudeReference: "UNL",
            frequencies: [],
            validFrom: "2026-09-03",
            validTo: null,
            country: "CZ",
            source: "browser fixture",
            sourceReference: "https://example.invalid/atc",
            lastVerifiedAt: "2026-09-03T00:00:00.000Z",
          }, {
            id: "fixture-sk-sector",
            name: "Slovakia fixture CTA",
            atcCallsign: "BRATISLAVA RADAR",
            service: "ACC",
            airspaceType: "CTA",
            polygons: [[[17.3, 48.5], [18.5, 48.5], [18.5, 49.4], [17.3, 49.4], [17.3, 48.5]]],
            lowerAltitudeFt: 8000, upperAltitudeFt: 66000,
            lowerAltitudeReference: "AMSL", upperAltitudeReference: "FL",
            frequencies: [], validFrom: "2026-09-03", validTo: null, country: "SK",
            source: "browser fixture", sourceReference: "https://example.invalid/sk-atc", lastVerifiedAt: "2026-09-03T00:00:00.000Z",
          }, {
            id: "fixture-sk-fir",
            name: "BRATISLAVA FIR",
            atcCallsign: null,
            service: "ACC",
            airspaceType: "FIR",
            polygons: [[[16.84, 47.73], [22.57, 47.73], [22.57, 49.62], [16.84, 49.62], [16.84, 47.73]]],
            lowerAltitudeFt: 0, upperAltitudeFt: null,
            lowerAltitudeReference: "SFC", upperAltitudeReference: "UNL",
            frequencies: [], validFrom: "2026-09-03", validTo: null, country: "SK",
            source: "browser fixture", sourceReference: "https://example.invalid/sk-atc-fir", lastVerifiedAt: "2026-09-03T00:00:00.000Z",
          }, {
            id: "fixture-at-fir-wien",
            name: "FIR WIEN",
            atcCallsign: "WIEN RADAR",
            service: "ACC",
            airspaceType: "FIR",
            polygons: atBoundaryPolygon,
            lowerAltitudeFt: 0, upperAltitudeFt: null,
            lowerAltitudeReference: "SFC", upperAltitudeReference: "UNL",
            frequencies: [], validFrom: "2026-09-04", validTo: null, country: "AT",
            source: "BEV Verwaltungsgrenzen (VGD) derived artifact", sourceReference: "https://data.bev.gv.at/geonetwork/srv/metadata/793160c9-426a-43a6-ba6b-9702c5dff89b", lastVerifiedAt: "2026-09-04T00:00:00.000Z",
          }],
          transmitters: [],
          metadata: { status: "configured", source: "browser fixture", sourceReference: "https://example.invalid/atc", effectiveDate: "2026-09-03", lastVerifiedAt: "2026-09-03T00:00:00.000Z", sectorCount: 1, transmitterCount: 0 },
          }),
        });
      });
      await page.route(/\/api\/aircraft\/[^/]+(?:\?.*)?$/, (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          aircraft: { icaoHex: "ABC123", registration: "OK-ABC", registrationCountry: "Czech Republic", registrationCountryCode: "CZ", aircraftType: "A320", manufacturer: "Airbus", model: "A320-214", operator: "Fixture Air" },
          liveEnrichment: {
            metadata: { registration: "OK-ABC", registrationCountry: "Czech Republic", registrationCountryCode: "CZ", aircraftType: "A320", icaoTypeCode: "A320", aircraftDescription: "Airbus A320-214", operator: "Fixture Air", manufacturer: "Airbus", source: "browser fixture", retrievedAt: "2026-09-12T00:00:00.000Z" },
            route: {
              callsign: "FIX123", airline: "Fixture Air", airlineIcao: "FIX", airlineIata: "FX", origin: "LKPR", destination: "LZIB", source: "browser fixture", retrievedAt: "2026-09-12T00:00:00.000Z",
              originAirport: { icaoCode: "LKPR", iataCode: "PRG", name: "Prague fixture airport", city: "Prague", country: "CZ", latitude: 50.1, longitude: 14.3 },
              destinationAirport: { icaoCode: "LZIB", iataCode: "BTS", name: "Bratislava fixture airport", city: "Bratislava", country: "SK", latitude: 48.17, longitude: 17.21 },
            },
          },
        }),
      }));
      await page.route(/\/api\/weather\/airport\?icao=.*/, (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled: true,
          available: true,
          airports: [
            { airport: { icaoCode: "LKPR", iataCode: "PRG", name: "Prague fixture airport", city: "Prague", country: "CZ", latitude: 50.1, longitude: 14.3 }, metar: { flightCategory: "VFR", windDirectionDeg: 240, windSpeedKt: 8, windVariable: false, windCalm: false, windGustKt: null, visibilityMeters: 10_000, visibilityGreaterThan: false, visibilityLessThan: false, temperatureC: 18, dewpointC: 10, altimeterHpa: 1013, clouds: [], cavok: true, weather: [], rawText: null, observedAt: "2026-09-12T00:00:00.000Z", observationTime: "2026-09-12T00:00:00.000Z" }, taf: null, stale: false },
            { airport: { icaoCode: "LZIB", iataCode: "BTS", name: "Bratislava fixture airport", city: "Bratislava", country: "SK", latitude: 48.17, longitude: 17.21 }, metar: { flightCategory: "VFR", windDirectionDeg: 270, windSpeedKt: 5, windVariable: false, windCalm: false, windGustKt: null, visibilityMeters: 10_000, visibilityGreaterThan: false, visibilityLessThan: false, temperatureC: 20, dewpointC: 11, altimeterHpa: 1012, clouds: [], cavok: true, weather: [], rawText: null, observedAt: "2026-09-12T00:00:00.000Z", observationTime: "2026-09-12T00:00:00.000Z" }, taf: null, stale: false },
          ],
        }),
      }));
      await page.route("**/api/aircraft/*/context", (route) => {
        fixtureRequests.context += 1;
        return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "available",
          position: { lat: 50.1, lon: 14.4, altitude: 34000, altitudeSource: "baro" },
          supportedCountry: true,
          fir: { id: "fixture-sector", name: "Browser fixture sector", countryCode: "CZ", airspaceType: "CTA", airspaceClass: "C", verticalMatch: "true", horizontalMatch: "inside", confidence: "high", lowerLimitFt: 0, upperLimitFt: 66000, lowerLimitReference: "SFC", upperLimitReference: "UNL", publishedUnit: "FIXTURE", publishedFrequenciesMhz: [], remarks: null, provenance: { source: "browser fixture", sourceReference: "https://example.invalid/atc", effectiveDate: null, lastVerifiedAt: "2026-09-03T00:00:00.000Z" } },
          currentAirspaces: [],
          primaryAirspace: { id: "fixture-sector", name: "Browser fixture sector", countryCode: "CZ", airspaceType: "CTA", airspaceClass: "C", verticalMatch: "true", horizontalMatch: "inside", confidence: "high", lowerLimitFt: 0, upperLimitFt: 66000, lowerLimitReference: "SFC", upperLimitReference: "UNL", publishedUnit: "FIXTURE", publishedFrequenciesMhz: [], remarks: null, provenance: { source: "browser fixture", sourceReference: "https://example.invalid/atc", effectiveDate: null, lastVerifiedAt: "2026-09-03T00:00:00.000Z" } },
          atsRoute: { routeId: "FIXTURE1", segmentId: "fixture-segment", from: "A", to: "B", distanceNm: 1.2, alignmentDifferenceDeg: 4, confidence: "high", countryCode: "CZ", sourceReference: "https://example.invalid/ats" },
          nearestAtsCandidate: null, nearestPoint: null, nextPoint: null, ahead: null, limitation: null,
          computedAt: "2026-09-12T00:00:00.000Z", dataset: { atcVersion: "fixture", atsVersion: "fixture", atcCount: 1, atsSegmentCount: 1 },
        }),
        });
      });
      await page.route("**/api/aircraft/*/route-weather", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "available",
          routeStatus: "MATCHED",
          routeCoveragePercent: 100,
          routeSource: "browser fixture",
          unresolvedRouteTokens: [],
          stale: false,
          matches: [{
            sigmetId: "fixture-sigmet-route",
            hazard: "Fixture route turbulence",
            firName: "Prague FIR",
            validTo: "2026-09-12T23:59:59.000Z",
            routeDesignator: "FIXTURE1",
            fromName: "A",
            toName: "B",
            segmentId: "fixture-segment",
            segmentConfidence: "HIGH",
            verticalMatch: "matched",
            distanceAlongRouteNm: 12,
          }],
        }),
      }));
      await page.route("**/api/weather/sigmet", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled: true,
          available: true,
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            id: "fixture-sigmet",
            properties: { id: "fixture-sigmet", issuingOffice: "FIXTURE", firId: "LKAA", firName: "Prague FIR", phenomenon: "TS", hazard: "Thunderstorm", qualifier: null, validFrom: "2026-09-12T00:00:00.000Z", validTo: "2026-09-12T23:59:59.000Z", lowerFt: 0, upperFt: 12000, seriesId: "FIXTURE", rawText: null, source: "isigmet", fetchedAt: "2026-09-12T00:00:00.000Z" },
            geometry: { type: "Polygon", coordinates: [[[14.25, 49.9], [14.65, 49.9], [14.65, 50.25], [14.25, 50.25], [14.25, 49.9]]] },
          }],
          fetchedAt: "2026-09-12T00:00:00.000Z",
          stale: false,
        }),
      }));
      // Keep the viewport matrix deterministic. These layers are loaded by
      // the radar shell on every full-smoke page, and letting them reach the
      // process-local public limiter makes later viewports fail with 429s.
      await page.route("**/api/weather/radar/frames", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: false, frames: [], latestFrameId: null }),
      }));
      await page.route("**/api/weather/metar-map", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: false, observations: [], stale: false }),
      }));
      await page.route(/\/api\/weather\/wind(?:\?.*)?$/, (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: false, points: [], stale: false, validAt: null }),
      }));
      await page.route(/\/api\/ats\/routes(?:\?.*)?$/, (route) => {
        fixtureRequests.ats += 1;
        return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          available: true,
          source: { name: "browser fixture", reference: "https://example.invalid/ats", effectiveDate: "2026-09-03", aipAmendment: null, airacAmendment: null },
          counts: { routes: 1, points: 2, segments: 1, cdrSegments: 0, discontinuities: 0 },
          routes: [],
          segments: { type: "FeatureCollection", features: [{ type: "Feature", properties: { countryCode: "CZ", routeDesignator: "FIXTURE1", segmentId: "fixture-segment", fromName: "A", toName: "B", navigationSpecification: "RNAV", distanceNm: 10, lowerLimit: "SFC", upperLimit: "UNL", lowerOverride: null, magTrackForwardDeg: 90, magTrackReverseDeg: 270, cruisingLevelForward: null, cruisingLevelReverse: null, availabilityClass: null, effectiveDate: "2026-09-03", aipAmendment: null, airacAmendment: null, remarks: null }, geometry: { type: "LineString", coordinates: [[14, 50], [14.2, 50.1]] } }, { type: "Feature", properties: { countryCode: "SK", routeDesignator: "A4", segmentId: "sk-segment", fromName: "SKA", toName: "SKB", navigationSpecification: "CONVENTIONAL", distanceNm: 10, lowerLimit: "SFC", upperLimit: "UNL", lowerOverride: null, magTrackForwardDeg: 90, magTrackReverseDeg: 270, cruisingLevelForward: null, cruisingLevelReverse: null, availabilityClass: null, effectiveDate: "2026-09-03", aipAmendment: null, airacAmendment: null, remarks: null }, geometry: { type: "LineString", coordinates: [[17.4, 48.7], [18.1, 49.1]] } }, { type: "Feature", properties: { countryCode: "AT", routeDesignator: "L12", segmentId: "at-segment", fromName: "MOGTI", toName: "SUDUX", navigationSpecification: "RNAV", distanceNm: 29.2, lowerLimit: "15800 FT AMSL", upperLimit: "FL660", lowerOverride: null, magTrackForwardDeg: null, magTrackReverseDeg: null, cruisingLevelForward: null, cruisingLevelReverse: null, availabilityClass: null, effectiveDate: "2026-09-04", aipAmendment: null, airacAmendment: null, remarks: null }, geometry: { type: "LineString", coordinates: [[17.4, 48.7], [18.1, 49.1]] } }] },
          labels: { type: "FeatureCollection", features: [] },
          points: { type: "FeatureCollection", features: [] },
        }),
        });
      });
      await page.goto(`${baseUrl}/?mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
      await page.locator("h1").first().waitFor({ state: "visible" });
      // MapLibre controls and React controls settle asynchronously after the
      // shell heading. Poll for the complete accessible DOM before asserting
      // so the smoke test does not race the first client render.
      await page.waitForFunction(() => {
        const mapReady = Boolean(document.querySelector(".maplibregl-ctrl-zoom-in"));
        const imagesReady = [...document.images].every((image) => image.hasAttribute("alt"));
        const buttonsReady = [...document.querySelectorAll("button")].every((button) => Boolean(button.textContent?.trim() || button.getAttribute("aria-label")));
        return mapReady && imagesReady && buttonsReady;
      });
      // Ordinary aircraft render on the bulk WebGL path at every viewport.
      // The expensive HTML special-marker anchoring and interaction regressions
      // run only at the representative mobile/desktop full-smoke widths below.
      await page.waitForFunction(() => {
        const map = window.__airradarMapForDiagnostics;
        const runtime = window.__airradarWebglAircraftForDiagnostics;
        return Boolean(
          map
          && window.__airradarMapStyleLoadedForDiagnostics === true
          && runtime
          && runtime.size > 0
          && map.getLayer("aircraft-webgl")
          && map.getLayer("aircraft-webgl-label")
          && map.getSource("aircraft-webgl-labels")
          && typeof runtime.pickAircraftAtPoint === "function"
          && document.querySelector(".aircraft-row")
        );
      });
      const webglPresentation = await page.evaluate(() => {
        const map = window.__airradarMapForDiagnostics;
        const runtime = window.__airradarWebglAircraftForDiagnostics;
        return {
          aircraft: runtime?.size ?? 0,
          customLayer: Boolean(map?.getLayer("aircraft-webgl")),
          labelLayer: Boolean(map?.getLayer("aircraft-webgl-label")),
          labelSource: Boolean(map?.getSource("aircraft-webgl-labels")),
          directPicking: typeof runtime?.pickAircraftAtPoint === "function",
        };
      });
      if (webglPresentation.aircraft < 1
        || !webglPresentation.customLayer
        || !webglPresentation.labelLayer
        || !webglPresentation.labelSource
        || !webglPresentation.directPicking) {
        throw new Error(`WebGL aircraft presentation contract failed at ${viewport.width}px: ${JSON.stringify(webglPresentation)}`);
      }
      if (markerSmoke) {
        const markerStartedAt = performance.now();
        await page.evaluate(() => {
        const firstAircraft = document.querySelector(".aircraft-row");
        if (!(firstAircraft instanceof HTMLButtonElement)) throw new Error("aircraft traffic fixture unavailable");
        firstAircraft.click();
      });
      await page.waitForFunction(() => {
        const marker = document.querySelector(".aircraft-marker");
        const rotator = marker?.querySelector(".aircraft-plane-rotator");
        const label = marker?.querySelector(".aircraft-label");
        return Boolean(marker && rotator && label && rotator instanceof HTMLElement && rotator.style.transform.startsWith("rotate("));
      });
      const markerPresentation = await page.evaluate(() => {
        const marker = document.querySelector(".aircraft-marker");
        const rotator = marker?.querySelector(".aircraft-plane-rotator");
        const label = marker?.querySelector(".aircraft-label");
        if (!(marker instanceof HTMLElement) || !(rotator instanceof HTMLElement) || !(label instanceof HTMLElement)) return null;
        const rootRotation = marker.style.transform.match(/rotateZ\((-?[0-9.]+)deg\)/)?.[1] ?? "0";
        const labelTransform = getComputedStyle(label).transform;
        return {
          role: marker.getAttribute("role"),
          tabindex: marker.getAttribute("tabindex"),
          rootRotation: Number(rootRotation),
          rotatorTransform: rotator.style.transform,
          labelTransform,
          labelAriaHidden: label.getAttribute("aria-hidden"),
        };
      });
      if (!markerPresentation
        || markerPresentation.role !== "button"
        || markerPresentation.tabindex !== "0"
        || markerPresentation.rootRotation !== 0
        || !markerPresentation.rotatorTransform.startsWith("rotate(")
        || markerPresentation.labelAriaHidden !== "true"
        || !/^(none|matrix\(1(?:\.0+)?,[ ]*0(?:\.0+)?,[ ]*0(?:\.0+)?,[ ]*1(?:\.0+)?)/.test(markerPresentation.labelTransform)) {
        throw new Error(`Aircraft marker presentation contract failed at ${viewport.width}px: ${JSON.stringify(markerPresentation)}`);
      }
      const anchorRegression = await page.evaluate(async () => {
        const map = window.__airradarMapForDiagnostics;
        const root = document.querySelector(".aircraft-marker");
        const handles = window.__airradarAircraftMarkersForDiagnostics;
        const marker = handles && root instanceof HTMLElement
          ? [...handles.values()].find((handle) => handle.root === root)?.marker
          : null;
        if (!map || !(root instanceof HTMLElement) || !marker) return { error: "aircraft marker diagnostic fixture unavailable" };
        const waitForRender = () => new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        const measure = (step) => {
          const mapRect = map.getContainer().getBoundingClientRect();
          const markerRect = root.getBoundingClientRect();
          const expected = map.project(marker.getLngLat());
          const actual = {
            x: markerRect.left - mapRect.left + markerRect.width / 2,
            y: markerRect.top - mapRect.top + markerRect.height / 2,
          };
          return {
            step,
            zoom: map.getZoom(),
            bearing: map.getBearing(),
            errorX: actual.x - expected.x,
            errorY: actual.y - expected.y,
            width: markerRect.width,
            height: markerRect.height,
            position: getComputedStyle(root).position,
          };
        };
        const measurements = [];
        for (const zoom of [4, 8, 12]) {
          map.setZoom(zoom);
          await waitForRender();
          measurements.push(measure(`zoom-${zoom}`));
        }
        const origin = map.getCenter();
        for (const delta of [[200, 100], [-200, -100]]) {
          map.panBy(delta, { duration: 0 });
          await waitForRender();
          measurements.push(measure(`pan-${delta.join("-")}`));
        }
        for (const bearing of [90, 180]) {
          map.setBearing(bearing);
          await waitForRender();
          measurements.push(measure(`bearing-${bearing}`));
        }
        map.jumpTo({ center: origin, zoom: 5, bearing: 0 });
        await waitForRender();
        for (const zoom of [12, 5]) {
          map.setZoom(zoom);
          await waitForRender();
          measurements.push(measure(`roundtrip-${zoom}`));
        }
        return { measurements };
      });
      const anchorFailures = anchorRegression.error
        ? [anchorRegression.error]
        : anchorRegression.measurements.filter((measurement) => Math.abs(measurement.errorX) > 0.2 || Math.abs(measurement.errorY) > 0.2 || Math.abs(measurement.width - 42) > 0.01 || Math.abs(measurement.height - 42) > 0.01 || measurement.position !== "absolute");
      if (anchorFailures.length) throw new Error(`Aircraft marker anchor regression failed at ${viewport.width}px: ${JSON.stringify(anchorFailures.slice(0, 8))}`);
      const beforeBearing = markerPresentation.rotatorTransform;
      await page.evaluate(() => window.__airradarMapForDiagnostics?.rotateTo(90, { duration: 0 }));
      await page.waitForFunction((previous) => {
        const transform = document.querySelector(".aircraft-plane-rotator")?.getAttribute("style") || "";
        return transform !== previous;
      }, beforeBearing);
      await page.evaluate(() => window.__airradarMapForDiagnostics?.rotateTo(0, { duration: 0 }));
      // Restore the unselected baseline state before responsive/drawer checks.
      // Selection is only introduced above to exercise the HTML special-marker
      // path after validating the ordinary WebGL path.
      await page.evaluate(() => {
        const close = document.querySelector(".drawer-close-button");
        if (!(close instanceof HTMLButtonElement)) throw new Error("aircraft detail close control unavailable");
        close.click();
      });
      await page.waitForFunction(() => {
        const sidebar = document.querySelector('[data-testid="radar-sidebar"]');
        return Boolean(sidebar && !sidebar.classList.contains("has-selection") && !document.querySelector(".aircraft-marker.selected"));
      });
        logViewportPhase("marker", markerStartedAt);
      }
      if (fullSmoke && viewport.width >= 821) {
        const desktopStartedAt = performance.now();
        const trafficTrigger = page.getByTestId("traffic-trigger");
        const sidebar = page.getByTestId("radar-sidebar");
        await trafficTrigger.waitFor({ state: "visible" });
        if (await trafficTrigger.getAttribute("aria-expanded") !== "false" || !await sidebar.evaluate((element) => element.classList.contains("drawer-closed"))) {
          throw new Error(`Desktop radar drawer is not closed initially at ${viewport.width}px`);
        }

        // Keep one keyboard-accessibility path in production smoke.
        await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
        await page.keyboard.press("/");
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-traffic"));
        await page.waitForFunction(() => document.activeElement?.classList.contains("search-input"));
        const trafficCloseLabel = await sidebar.locator(".drawer-close-button").getAttribute("aria-label");
        if (trafficCloseLabel !== "Zavřít panel provozu"
          || await trafficTrigger.getAttribute("aria-expanded") !== "true"
          || !await sidebar.evaluate((element) => element.classList.contains("drawer-traffic"))) {
          throw new Error(`Keyboard Traffic drawer contract failed at ${viewport.width}px: close=${trafficCloseLabel}`);
        }

        // Mobile full-smoke covers pointer opening. Continue directly from the
        // keyboard-opened desktop drawer instead of closing and reopening it.
        await page.locator("details.map-layers").evaluate((element) => { element.open = false; });
        await page.locator("details.map-layers > summary").click();
        const drawerLayerMenuBounds = await page.locator(".map-layers-menu").boundingBox();
        const drawerBounds = await sidebar.boundingBox();
        const trafficBounds = await trafficTrigger.boundingBox();
        const layersBounds = await page.locator("details.map-layers > summary").boundingBox();
        if (!drawerLayerMenuBounds || !drawerBounds || !trafficBounds || !layersBounds
          || drawerLayerMenuBounds.x < 0
          || drawerLayerMenuBounds.x + drawerLayerMenuBounds.width > drawerBounds.x + 1
          || trafficBounds.x + trafficBounds.width > layersBounds.x + 1
          || layersBounds.x + layersBounds.width > drawerBounds.x + 1) {
          throw new Error(`Traffic/Layers geometry failed at ${viewport.width}px`);
        }
        await page.locator("details.map-layers").evaluate((element) => { element.open = false; });

        // Open one aircraft and validate the current four-tab quick-detail contract.
        await sidebar.locator(".aircraft-row").first().click();
        const quickDetail = sidebar.getByTestId("aircraft-quick-detail");
        await quickDetail.waitFor({ state: "visible" });
        const quickContract = await quickDetail.evaluate((element) => ({
          tabs: [...element.querySelectorAll('[role="tab"]')].map((tab) => ({ id: tab.id, selected: tab.getAttribute("aria-selected") })),
          activePanel: element.querySelector('[role="tabpanel"]')?.id ?? null,
          trafficHeroes: element.querySelectorAll('[data-testid="radar-traffic-hero"]').length,
          heroPrimary: Boolean(element.querySelector('[data-testid="radar-traffic-hero-primary"]')?.textContent?.trim()),
          heroSource: Boolean(element.querySelector('[data-testid="radar-traffic-hero-source"]')?.textContent?.trim()),
          heroMetrics: ["altitude", "speed", "track", "vertical-rate"].map((metric) => ({
            metric,
            present: Boolean(element.querySelector(`[data-testid="radar-traffic-hero-metric-${metric}"]`)),
            state: element.querySelector(`[data-testid="radar-traffic-hero-metric-${metric}"]`)?.getAttribute("data-state") ?? null,
            value: element.querySelector(`[data-testid="radar-traffic-hero-metric-${metric}"] strong`)?.textContent?.trim() ?? "",
          })),
          liveMetricContainers: element.querySelectorAll('[data-testid="radar-traffic-hero-metrics"]').length,
          liveMetricSlots: element.querySelector('[data-testid="radar-traffic-hero-metrics"]')?.children.length ?? 0,
          technicalOpen: element.querySelector(".aircraft-quick-advanced")?.hasAttribute("open") ?? false,
          dataDisclosure: Boolean(element.querySelector('[role="tab"]#aircraft-tab-data')),
        }));
        const missingHeroMetrics = quickContract.heroMetrics.filter((metric) => !metric.present || metric.state !== "available" || !metric.value);
        if (quickContract.tabs.length !== 4
          || quickContract.activePanel !== "aircraft-tabpanel-flight"
          || quickContract.trafficHeroes !== 1
          || !quickContract.heroPrimary
          || !quickContract.heroSource
          || missingHeroMetrics.length > 0
          || quickContract.liveMetricContainers !== 1
          || quickContract.liveMetricSlots !== 4
          || quickContract.technicalOpen
          || !quickContract.dataDisclosure) {
          throw new Error(`Aircraft quick-detail contract failed at ${viewport.width}px: ${JSON.stringify(quickContract)}`);
        }
        await quickDetail.getByRole("tab", { name: "Situace", exact: true }).click();
        await quickDetail.locator(".aircraft-quick-atc").waitFor({ state: "visible" });
        await quickDetail.getByTestId("route-weather-match").waitFor({ state: "visible" });
        await quickDetail.locator(".route-weather-summary").first().waitFor({ state: "visible" });
        const situationContract = await quickDetail.evaluate((element) => ({
          activePanel: element.querySelector('[role="tabpanel"]')?.id ?? null,
          atcPrimary: Boolean(element.querySelector(".aircraft-quick-atc-primary")),
          situationSummary: Boolean(element.querySelector('[data-testid="flight-situation-summary"]')),
        }));
        if (situationContract.activePanel !== "aircraft-tabpanel-situation"
          || !situationContract.atcPrimary
          || !situationContract.situationSummary) {
          throw new Error(`Aircraft situation contract failed at ${viewport.width}px: ${JSON.stringify(situationContract)}`);
        }

        await quickDetail.getByRole("tab", { name: "Let", exact: true }).click();
        const fullDetailHref = await quickDetail.locator("a[href^='/aircraft/']").getAttribute("href");
        if (!/^\/aircraft\/[0-9A-Fa-f~]+$/.test(fullDetailHref ?? "")) {
          throw new Error(`Aircraft quick-detail full link missing at ${viewport.width}px`);
        }
        if (!await sidebar.evaluate((element) => element.classList.contains("drawer-aircraft"))
          || await sidebar.locator(".close-button").getAttribute("aria-label") !== "Zavřít detail letadla") {
          throw new Error(`Aircraft detail drawer contract failed at ${viewport.width}px`);
        }
        await page.locator("details.map-layers").evaluate((element) => { element.open = true; });
        const detailLayerMenuBounds = await page.locator(".map-layers-menu").boundingBox();
        const detailDrawerBounds = await sidebar.boundingBox();
        if (!detailLayerMenuBounds || !detailDrawerBounds || detailLayerMenuBounds.x + detailLayerMenuBounds.width > detailDrawerBounds.x + 1) {
          throw new Error(`Map layers menu is not usable beside aircraft detail at ${viewport.width}px`);
        }
        await page.locator("details.map-layers").evaluate((element) => { element.open = false; });
        await sidebar.locator(".drawer-close-button").click();
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-closed"));
        if (await page.evaluate(() => document.activeElement?.getAttribute("data-testid")) !== "traffic-trigger") {
          throw new Error(`Desktop Close did not restore focus to Traffic trigger at ${viewport.width}px`);
        }
        logViewportPhase("desktop-ui", desktopStartedAt);
      }

      // Run the expensive interaction matrix once per responsive family.
      // Every configured viewport still exercises the layout/accessibility
      // contract and the 820/821 breakpoint remains explicit.
      if (!fullSmoke) {
        // drawer-closed intentionally delays visibility:hidden until the
        // 150 ms opacity transition completes. Wait for the rendered state,
        // not only the React class, so the responsive contract cannot sample
        // the close action during that transition window.
        await page.waitForFunction(() => {
          const sidebar = document.querySelector('[data-testid="radar-sidebar"]');
          return !sidebar || !sidebar.classList.contains("drawer-closed") || getComputedStyle(sidebar).visibility === "hidden";
        });
        await page.locator("details.map-layers > summary").click();
        const contract = await page.evaluate(() => {
          const rect = (selector) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const box = element.getBoundingClientRect();
            return { x: box.x, right: box.right, y: box.y, bottom: box.bottom, width: box.width, height: box.height };
          };
          const visible = (selector) => [...document.querySelectorAll(selector)].filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
          }).length;
          return {
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            overflowingElements: [...document.querySelectorAll("body *")].map((element) => {
              const box = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return { tag: element.tagName.toLowerCase(), className: typeof element.className === "string" ? element.className : "", id: element.id, left: box.left, right: box.right, width: box.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, overflowX: style.overflowX };
            }).filter((item) => item.right > window.innerWidth + 1 || item.left < -1 || item.scrollWidth > item.clientWidth + 1).slice(0, 20),
            radarChildren: [...document.querySelector(".radar-content")?.children ?? []].map((element) => ({ tag: element.tagName.toLowerCase(), className: typeof element.className === "string" ? element.className : "", scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, rect: (() => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width }; })() })),
            layerMenu: rect(".map-layers-menu"),
            sidebar: rect('[data-testid="radar-sidebar"]'),
            sidebarVisible: Boolean(document.querySelector('[data-testid="radar-sidebar"]') && !document.querySelector('[data-testid="radar-sidebar"]').classList.contains("drawer-closed")),
            controls: [rect(".maplibregl-ctrl-top-right"), rect(".maplibregl-ctrl-bottom-right")],
            traffic: visible('[data-testid="traffic-trigger"]'),
            close: visible(".drawer-close-button, .close-button"),
            imagesNamed: [...document.images].every((image) => image.hasAttribute("alt")),
            buttonsNamed: [...document.querySelectorAll("button")].every((button) => Boolean(button.textContent?.trim() || button.getAttribute("aria-label"))),
          };
        });
        const outOfViewport = (box) => box && (box.x < -1 || box.right > viewport.width + 1);
        if (contract.overflow || outOfViewport(contract.layerMenu) || (contract.sidebarVisible && outOfViewport(contract.sidebar))
          || contract.controls.some(outOfViewport) || contract.traffic !== 1
          || contract.close !== 0 || !contract.imagesNamed || !contract.buttonsNamed) {
          throw new Error(`Responsive contract failed at ${viewport.width}px: ${JSON.stringify(contract)}`);
        }
        await page.close();
        continue;
      }

      await page.locator("details.map-layers > summary").click();
      const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (hasHorizontalOverflow) throw new Error(`Horizontal overflow at ${viewport.width}px`);

      const layerMenu = page.locator(".map-layers-menu");
      const layerMenuBounds = await layerMenu.boundingBox();
      if (!layerMenuBounds) throw new Error(`Map layers menu is not measurable at ${viewport.width}px`);
      if (layerMenuBounds.x < 0 || layerMenuBounds.x + layerMenuBounds.width > viewport.width) {
        throw new Error(`Map layers menu overflows at ${viewport.width}px: ${JSON.stringify(layerMenuBounds)}`);
      }
      const mapStacking = await page.evaluate(() => {
        const panel = document.querySelector('.map-panel');
        const container = document.querySelector('.map-container');
        const overlay = document.querySelector('.map-overlay');
        const menu = document.querySelector('.map-layers-menu');
        if (!panel || !container || !overlay || !menu) return null;
        return {
          panelIsolation: getComputedStyle(panel).isolation,
          containerZIndex: getComputedStyle(container).zIndex,
          overlayZIndex: getComputedStyle(overlay).zIndex,
          menuZIndex: getComputedStyle(menu).zIndex,
        };
      });
      if (!mapStacking || mapStacking.panelIsolation !== 'isolate' || mapStacking.containerZIndex !== '0' || Number(mapStacking.overlayZIndex) <= Number(mapStacking.containerZIndex)) {
        throw new Error(`Map layers stacking context is not above map content at ${viewport.width}px: ${JSON.stringify(mapStacking)}`);
      }

      if (viewport.width <= 820) {
        const trafficTrigger = page.getByTestId("traffic-trigger");
        if (!await trafficTrigger.isVisible()) throw new Error(`Traffic trigger is not visible in mobile map-only mode at ${viewport.width}px`);
        const sidebar = page.getByTestId("radar-sidebar");
        if (!await sidebar.evaluate((element) => element.classList.contains("drawer-closed"))) {
          throw new Error(`Mobile radar is not initially in map-only mode at ${viewport.width}px`);
        }

        await page.locator("details.map-layers").evaluate((element) => { element.open = false; });
        await trafficTrigger.click();
        await page.locator('[data-testid="radar-sidebar"].drawer-traffic.compact').waitFor({ state: "visible" });
        await sidebar.locator(".drawer-close-button").waitFor({ state: "visible" });

        const atcPanel = page.getByTestId("atc-relevance-panel");
        const sidebarBounds = await sidebar.boundingBox();
        const atcPanelBounds = await atcPanel.boundingBox();
        if (!sidebarBounds || !atcPanelBounds) throw new Error(`Compact sidebar is not measurable at ${viewport.width}px`);
        if (atcPanelBounds.y + atcPanelBounds.height > sidebarBounds.y + sidebarBounds.height + 2) {
          throw new Error(`Compact ATC panel is clipped at ${viewport.width}px: sidebar=${JSON.stringify(sidebarBounds)}, atc=${JSON.stringify(atcPanelBounds)}`);
        }
        const compactSecondaryTools = page.locator('[data-testid="radar-sidebar"].compact .sidebar-secondary-tools');
        const compactSecondaryToolsVisible = await compactSecondaryTools.evaluateAll((elements) => elements.some((element) => {
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
        }));
        if (compactSecondaryToolsVisible) {
          throw new Error(`Secondary tools remain visible in compact sidebar at ${viewport.width}px`);
        }
        await page.locator(".mobile-collapse").click();
        await page.locator('[data-testid="radar-sidebar"]:not(.compact)').waitFor({ state: "visible" });
        const expandedSecondaryTools = page.locator('[data-testid="radar-sidebar"]:not(.compact) .sidebar-secondary-tools');
        const expandedSecondaryToolsVisible = await expandedSecondaryTools.evaluateAll((elements) => elements.some((element) => {
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
        }));
        if (!expandedSecondaryToolsVisible) {
          throw new Error(`Secondary tools are not available after expanding sidebar at ${viewport.width}px`);
        }
        await page.locator(".mobile-collapse").click();
        await sidebar.locator(".drawer-close-button").click();
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-closed"));
        await page.locator("details.map-layers > summary").click();
      }

      if (dataLayerSmoke) {
        const dataLayerStartedAt = performance.now();
        const airportLayer = page.getByTestId("map-layer-airports");
        const atcLayer = page.getByTestId("map-layer-atc");
        const atsLayer = page.getByTestId("map-layer-ats");
        const sigmetLayer = page.getByTestId("map-layer-sigmet");
        await airportLayer.waitFor({ state: "visible" });
        await page.evaluate(() => {
          for (const testId of ["map-layer-airports", "map-layer-atc", "map-layer-ats", "map-layer-sigmet"]) {
            const input = document.querySelector(`[data-testid="${testId}"] input`);
            if (input instanceof HTMLInputElement && !input.checked) input.click();
          }
        });
        await page.waitForFunction(() => {
          const map = window.__airradarMapForDiagnostics;
          if (!map) return false;
          const hasCount = (testId) => /\d/.test(document.querySelector(`[data-testid="${testId}"]`)?.textContent || "");
          const sourceIds = ["route-airports", "atc-sectors", "ats-routes", "aviation-sigmet"];
          const layerIds = ["route-airports-circle", "atc-sectors-fill", "ats-routes-line", "aviation-sigmet-fill"];
          const airports = map.querySourceFeatures("route-airports");
          const atc = map.querySourceFeatures("atc-sectors");
          const ats = map.querySourceFeatures("ats-routes");
          const hasCountry = (features, countryCode) => features.some((feature) => feature.properties?.countryCode === countryCode);
          return hasCount("map-layer-airports")
            && hasCount("map-layer-atc")
            && hasCount("map-layer-ats")
            && sourceIds.every((id) => Boolean(map.getSource(id)))
            && layerIds.every((id) => Boolean(map.getLayer(id)))
            && airports.some((feature) => feature.properties?.icao === "LKFIX")
            && atc.some((feature) => feature.properties?.id === "fixture-sector")
            && ats.some((feature) => feature.properties?.segmentId === "fixture-segment")
            && ["CZ", "SK", "AT"].every((country) => hasCountry(atc, country))
            && ["CZ", "SK", "AT"].every((country) => hasCountry(ats, country))
            && atc.some((feature) => (feature.properties?.countryCode === "SK" || feature.properties?.countryCode === "AT") && feature.properties?.airspaceType === "FIR");
        }, undefined, { timeout: 10_000 });
      if (airportAttempts < 1 || atcAttempts < 1) {
        throw new Error(`Dataset requests did not complete: airports=${airportAttempts}, atc=${atcAttempts}`);
      }
        logViewportPhase("data-layer", dataLayerStartedAt);
      }
      if (browserErrors.length) throw new Error(`Browser errors at ${viewport.width}px: ${browserErrors.join(" | ")}`);
      if (viewport.width <= 820) {
        const mobileSidebar = page.getByTestId("radar-sidebar");
        const mobileTrafficTrigger = page.getByTestId("traffic-trigger");
        await page.locator(".map-container").waitFor({ state: "visible" });
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-closed"));
        if (!await mobileTrafficTrigger.isVisible()) throw new Error("Mobile map-only Traffic trigger is unavailable");

        await mobileTrafficTrigger.click();
        await page.locator('[data-testid="radar-sidebar"].drawer-traffic.compact').waitFor({ state: "visible" });
        await page.locator(".mobile-collapse").click();
        await page.locator('[data-testid="radar-sidebar"]:not(.compact)').waitFor({ state: "visible" });
        await mobileSidebar.locator(".aircraft-row").first().click();
        await mobileSidebar.locator(".detail-back-button").waitFor({ state: "visible" });
        if (!await mobileSidebar.evaluate((element) => element.classList.contains("drawer-aircraft") && element.classList.contains("has-selection"))) {
          throw new Error("Mobile aircraft selection did not open");
        }
        const mobileControlBounds = await page.evaluate(() => {
          const insideViewport = (selector) => [...document.querySelectorAll(selector)].map((element) => {
            const rect = element.getBoundingClientRect();
            return { x: rect.x, width: rect.width, right: rect.right };
          }).filter((rect) => rect.width > 0).every((rect) => rect.x >= -1 && rect.right <= window.innerWidth + 1);
          return {
            topRight: insideViewport(".maplibregl-ctrl-top-right"),
            bottomRight: insideViewport(".maplibregl-ctrl-bottom-right"),
            overflow: document.documentElement.scrollWidth > window.innerWidth,
          };
        });
        if (!mobileControlBounds.topRight || !mobileControlBounds.bottomRight || mobileControlBounds.overflow) {
          throw new Error(`Mobile map controls are outside the viewport at ${viewport.width}px: ${JSON.stringify(mobileControlBounds)}`);
        }
        await page.evaluate(() => {
          const sidebar = document.querySelector('[data-testid="radar-sidebar"]');
          const close = sidebar?.querySelector(".close-button");
          if (!(close instanceof HTMLButtonElement)) throw new Error("Mobile aircraft detail close control unavailable");
          close.click();
        });
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-closed"));
        if (!await mobileTrafficTrigger.isVisible()) throw new Error("Mobile Traffic trigger did not return after closing aircraft detail");
      }
      const accessibility = await page.evaluate(() => ({
        missingImageAlt: [...document.images].filter((image) => !image.hasAttribute("alt")).length,
        unnamedButtons: [...document.querySelectorAll("button")].filter((button) => !button.textContent?.trim() && !button.getAttribute("aria-label")).length,
      }));
      if (accessibility.missingImageAlt || accessibility.unnamedButtons) throw new Error(`Basic accessibility check failed at ${viewport.width}px: ${JSON.stringify(accessibility)}`);

      if (viewport.width === 375) {
        const mobileNav = page.locator(".mobile-bottom-nav");
        await mobileNav.waitFor({ state: "visible" });
        if (await mobileNav.locator(":scope > a, :scope > details").count() !== 5) throw new Error("Mobile bottom navigation must contain exactly five items");
        const navLayout = await mobileNav.evaluate((element) => ({
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          items: [...element.children].map((child) => { const box = child.getBoundingClientRect(); return { x: box.x, right: box.right, y: box.y, bottom: box.bottom }; }),
        }));
        if (navLayout.overflow || navLayout.items.some((item) => item.y < 0 || item.right > viewport.width + 1)) throw new Error(`Mobile bottom navigation geometry failed: ${JSON.stringify(navLayout)}`);
        await mobileNav.locator(".mobile-bottom-more > summary").click();
        const moreBounds = await mobileNav.locator(".mobile-bottom-more > div").boundingBox();
        if (!moreBounds || moreBounds.x < 0 || moreBounds.right > viewport.width + 1 || moreBounds.y < 0) throw new Error(`Mobile More menu is outside the viewport: ${JSON.stringify(moreBounds)}`);
        await mobileNav.locator(".mobile-bottom-more > summary").click();
      }
      logViewportPhase("total", viewportStartedAt);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const mode = args.has("--all") ? "all" : args.has("--browser") ? "browser" : "core";
  if (!["core", "browser", "all"].includes(mode)) throw new Error("Expected --core, --browser, or --all");
  const gateChannel = resolveProductionGateChannel();
  const expectedVersion = expectedBuildVersion();
  assertMigrationSource();
  const runtimeStateDirectory = mkdtempSync(resolve(tmpdir(), "airradar-production-gate-"));
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", host, "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "",
      READSB_BASE_URL: "",
      ATC_SAMPLE_ENABLED: "true",
      ADSBDB_ENABLED: "false",
      AIRCRAFT_PHOTOS_ENABLED: "false",
      OGN_ENABLED: "false",
      FLIGHTAWARE_API_KEY: "",
      WATCHLIST_ADMIN_TOKEN: "production-gate-token",
      AIRRADAR_CHANNEL: gateChannel === "rc" ? "release-candidate" : "production",
      AIRRADAR_RUNTIME_STATE_DIRECTORY: runtimeStateDirectory,
      AVIATION_WEATHER_CACHE_FILE: resolve(runtimeStateDirectory, "weather-cache-v1.json"),
      WEATHER_RADAR_ARCHIVE_DIR: resolve(runtimeStateDirectory, "weather-radar"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await waitForHealthyServer();
    let sseSnapshotBytes = null;
    let systemSseSnapshotBytes = null;
    let sseV2SnapshotBytes = null;
    const staticPayloadBytes = {};
    if (mode !== "browser") {
    const health = await get("/api/health");
    if (!health.ok || (await health.json()).status !== "ok") throw new Error("Health smoke failed");
    const version = await get("/api/version");
    const versionPayload = await version.json();
    assertProductionReleaseMetadata(versionPayload, gateChannel, expectedVersion);
    const homepage = await get("/");
    const html = await homepage.text();
    if (!html.includes("<h1") || !html.includes("AirRadar")) throw new Error("Homepage semantic heading smoke failed");
    const manifest = await get("/manifest.webmanifest");
    const manifestPayload = await manifest.json();
    if (manifestPayload.orientation) throw new Error("Manifest still forces an orientation");
    for (const path of ["/api/airports", "/api/atc/sectors"]) {
      const response = await get(path);
      const body = await response.arrayBuffer();
      staticPayloadBytes[path] = body.byteLength;
      if (!response.ok || !response.headers.get("cache-control")?.includes("max-age=300")) throw new Error(`Static payload cache smoke failed for ${path}`);
    }
    const system = await get("/api/system/status");
    const systemPayload = await system.json();
    if (!Number.isFinite(systemPayload.runtime?.processRssBytes)) throw new Error("Runtime diagnostics smoke failed");
    const ognState = await get("/api/ogn/state");
    const ognStatePayload = await ognState.json();
    if (!ognState.ok || ognStatePayload.enabled !== false || !Array.isArray(ognStatePayload.targets) || ognStatePayload.targets.length !== 0) throw new Error("Disabled OGN state smoke failed");
    const watchlistMutation = await get("/api/watchlist", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (watchlistMutation.status !== 401) throw new Error("Watchlist mutation was not protected");
    sseSnapshotBytes = await assertSseLifecycle();
    systemSseSnapshotBytes = await assertSystemSseLifecycle();
    sseV2SnapshotBytes = await assertSseV2Lifecycle();
    const afterSse = await get("/api/system/status");
    const afterSsePayload = await afterSse.json();
    if (!afterSse.ok) throw new Error("SSE cleanup diagnostics request failed");
    if (afterSsePayload.runtime?.activeSseClients !== 0) await waitForSseCleanup();
    }
    await assertBrowserSmoke({ enabled: mode !== "core" });
    console.log(`[production-gates] measured first SSE event bytes=${sseSnapshotBytes}, system SSE snapshot bytes=${systemSseSnapshotBytes}, V2 snapshot bytes=${sseV2SnapshotBytes}, airports bytes=${staticPayloadBytes["/api/airports"]}, ATC bytes=${staticPayloadBytes["/api/atc/sectors"]}`);
    console.log(`[production-gates] ${mode} production gates passed`);
  } catch (error) {
    const detail = logs.join("").slice(-4_000);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${detail}`);
  } finally {
    stop();
    await new Promise((resolve) => child.once("exit", resolve));
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    rmSync(runtimeStateDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`[production-gates] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
