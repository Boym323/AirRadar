import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export const STABLE_PRODUCTION_VERSION = "1.0.0";
export const RELEASE_CANDIDATE_VERSION_PATTERN = /^1\.0\.0-rc\.[1-9]\d*$/;

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

async function assertBrowserSmoke() {
  if (process.env.RUN_BROWSER_GATE !== "1") {
    console.log("[production-gates] browser desktop/mobile gate skipped; set RUN_BROWSER_GATE=1 to run it");
    return;
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 820, height: 900 },
      { width: 821, height: 900 },
      { width: 850, height: 900 },
      { width: 900, height: 900 },
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
    ]) {
      const page = await browser.newPage({ viewport });
      const originalWaitForFunction = page.waitForFunction.bind(page);
      page.waitForFunction = async (...args) => {
        try {
          return await originalWaitForFunction(...args);
        } catch (error) {
          const predicate = typeof args[0] === "function" ? args[0].toString().replace(/\s+/g, " ").slice(0, 240) : String(args[0]);
          throw new Error(`browser predicate timed out at ${viewport.width}px: ${predicate}; ${error instanceof Error ? error.message : String(error)}`);
        }
      };
      const browserErrors = [];
      let expectedTransientFailures = 0;
      let airportAttempts = 0;
      let atcAttempts = 0;
      page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("503")) browserErrors.push(`console: ${message.text()}`); });
      page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
      page.on("worker", (worker) => worker.on("error", (error) => browserErrors.push(`worker: ${error.message}`)));
      page.on("response", (response) => {
        if (response.status() >= 500) {
          if (expectedTransientFailures > 0) expectedTransientFailures -= 1;
          else browserErrors.push(`http ${response.status()}: ${response.url()}`);
        }
      });
      await page.route("**/api/airports", async (route) => {
        airportAttempts += 1;
        if (airportAttempts === 1) {
          expectedTransientFailures += 1;
          return route.fulfill({ status: 503, headers: { "retry-after": "1" }, body: "temporary fixture failure" });
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { icaoCode: "LKFIX", iataCode: "FIX", name: "Browser fixture airport", city: "Fixture", country: "CZ", latitude: 50.0755, longitude: 14.4378, type: "large_airport" },
            { icaoCode: "LKSML", iataCode: null, name: "Browser fixture small field", city: "Fixture", country: "CZ", latitude: 50.15, longitude: 14.55, type: "small_airport" },
          ]),
        });
      });
      await page.route("**/api/atc/sectors", async (route) => {
        atcAttempts += 1;
        if (atcAttempts === 1) {
          expectedTransientFailures += 1;
          return route.fulfill({ status: 503, headers: { "retry-after": "1" }, body: "temporary fixture failure" });
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
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
      await page.route("**/api/aircraft/*/context", (route) => route.fulfill({
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
      await page.route("**/api/ats/routes", (route) => route.fulfill({
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
      }));
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
      if (viewport.width >= 821) {
        const trafficTrigger = page.getByTestId("traffic-trigger");
        const sidebar = page.getByTestId("radar-sidebar");
        await trafficTrigger.waitFor({ state: "visible" });
        if (await trafficTrigger.getAttribute("aria-expanded") !== "false" || !await sidebar.evaluate((element) => element.classList.contains("drawer-closed"))) {
          throw new Error(`Desktop radar drawer is not closed initially at ${viewport.width}px`);
        }
        await page.evaluate(() => document.body.focus());
        await page.keyboard.press("/");
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-traffic"));
        await page.waitForFunction(() => document.activeElement?.classList.contains("search-input"));
        if (!await page.locator(".search-input").isVisible()) {
          throw new Error(`Slash shortcut did not open and focus Traffic search at ${viewport.width}px`);
        }
        const trafficCloseLabel = await sidebar.locator(".drawer-close-button").getAttribute("aria-label");
        if (trafficCloseLabel !== "Zavřít panel provozu" || trafficCloseLabel === "Zavřít detail letadla") {
          throw new Error(`Traffic drawer Close has the wrong accessible name at ${viewport.width}px: ${trafficCloseLabel}`);
        }
        await sidebar.locator(".drawer-close-button").click();
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-closed"));
        await page.keyboard.press("f");
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-traffic"));
        await page.waitForFunction(() => document.querySelector(".filter-button")?.getAttribute("aria-expanded") === "true");
        if (!await page.locator(".filter-button").getAttribute("aria-expanded").then((value) => value === "true")) {
          throw new Error(`F shortcut did not open Traffic and filters at ${viewport.width}px`);
        }
        await page.keyboard.press("f");
        if (await page.locator(".filter-button").getAttribute("aria-expanded").then((value) => value !== "false")) {
          throw new Error(`Second F shortcut did not toggle filters closed at ${viewport.width}px`);
        }
        await sidebar.locator(".drawer-close-button").click();
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-closed"));
        await page.locator("details.map-layers").evaluate((element) => { element.open = false; });
        await trafficTrigger.click({ force: true });
        await sidebar.locator(".drawer-close-button").waitFor({ state: "visible" });
        if (await trafficTrigger.getAttribute("aria-expanded") !== "true"
          || !await sidebar.evaluate((element) => element.classList.contains("drawer-traffic"))
          || (await trafficTrigger.textContent())?.includes("×")) {
          throw new Error(`Traffic drawer did not open at ${viewport.width}px`);
        }
        await page.locator("details.map-layers > summary").click();
        const drawerLayerMenuBounds = await page.locator(".map-layers-menu").boundingBox();
        const drawerBounds = await sidebar.boundingBox();
        if (!drawerLayerMenuBounds || !drawerBounds) throw new Error(`Drawer/layers geometry is not measurable at ${viewport.width}px`);
        if (drawerLayerMenuBounds.x < 0 || drawerLayerMenuBounds.x + drawerLayerMenuBounds.width > drawerBounds.x + 1) {
          throw new Error(`Map layers menu is not fully in the visible map area at ${viewport.width}px: menu=${JSON.stringify(drawerLayerMenuBounds)}, drawer=${JSON.stringify(drawerBounds)}`);
        }
        const trafficBounds = await trafficTrigger.boundingBox();
        const layersBounds = await page.locator("details.map-layers > summary").boundingBox();
        if (!trafficBounds || !layersBounds || trafficBounds.x + trafficBounds.width > layersBounds.x + 1 || layersBounds.x + layersBounds.width > drawerBounds.x + 1) {
          throw new Error(`Traffic/Layers controls overlap or are hidden by the drawer at ${viewport.width}px: traffic=${JSON.stringify(trafficBounds)}, layers=${JSON.stringify(layersBounds)}, drawer=${JSON.stringify(drawerBounds)}`);
        }
        await page.locator("details.map-layers").evaluate((element) => { element.open = false; });
        await sidebar.locator(".aircraft-row").first().waitFor({ state: "visible" });
        await sidebar.locator(".aircraft-row").first().evaluate((element) => element.click());
        await sidebar.locator(".detail-back-button").waitFor({ state: "visible" });
        await sidebar.locator(".drawer-close-button").waitFor({ state: "visible" });
        const quickDetail = sidebar.getByTestId("aircraft-quick-detail");
        await quickDetail.waitFor({ state: "visible" });
        await quickDetail.locator(".aircraft-quick-atc").waitFor({ state: "visible" });
        await quickDetail.locator(".route-weather-summary").waitFor({ state: "visible" });
        const quickContract = await quickDetail.evaluate((element) => ({
          order: [...element.children].map((child) => child.className),
          liveMetricGrids: element.querySelectorAll(".aircraft-quick-metrics").length,
          technicalOpen: element.querySelector(".aircraft-quick-advanced")?.hasAttribute("open") ?? false,
          fullDetailHref: element.querySelector("a[href^='/aircraft/']")?.getAttribute("href") ?? null,
          atcPrimary: Boolean(element.querySelector(".aircraft-quick-atc-primary")),
        }));
        const expectedQuickOrder = [
          "aircraft-quick-header",
          "aircraft-quick-section aircraft-quick-route",
          "aircraft-quick-section aircraft-quick-metrics-section",
          "aircraft-quick-actions",
          "aircraft-quick-section aircraft-quick-tracking",
          "aircraft-quick-section aircraft-quick-atc",
          "aircraft-quick-section aircraft-quick-aircraft",
          "aircraft-quick-section aircraft-quick-route-intelligence",
          "route-weather-card route-weather-card-compact",
          "aircraft-quick-advanced",
        ];
        if (JSON.stringify(quickContract.order) !== JSON.stringify(expectedQuickOrder)
          || quickContract.liveMetricGrids !== 1
          || quickContract.technicalOpen
          || !/^\/aircraft\/[0-9A-Fa-f~]+$/.test(quickContract.fullDetailHref ?? "")
          || !quickContract.atcPrimary) {
          throw new Error(`Aircraft quick-detail contract failed at ${viewport.width}px: ${JSON.stringify(quickContract)}`);
        }
        if (await sidebar.locator(".drawer-close-button:visible, .detail-panel .close-button:visible").count() !== 1) {
          throw new Error(`Desktop detail has more than one visible Close action at ${viewport.width}px`);
        }
        if (!await sidebar.evaluate((element) => element.classList.contains("drawer-aircraft"))) {
          throw new Error(`Aircraft detail did not open at ${viewport.width}px`);
        }
        if (await sidebar.locator(".close-button").getAttribute("aria-label") !== "Zavřít detail letadla") {
          throw new Error(`Aircraft detail Close has the wrong accessible name at ${viewport.width}px`);
        }
        await page.keyboard.press("f");
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-traffic"));
        await page.waitForFunction(() => document.querySelector(".filter-button")?.getAttribute("aria-expanded") === "true");
        if (await sidebar.locator(".filter-button").getAttribute("aria-expanded") !== "true") {
          throw new Error(`F shortcut did not return from aircraft detail with filters open at ${viewport.width}px`);
        }
        await page.keyboard.press("f");
        await page.evaluate(() => document.body.focus());
        await sidebar.locator(".aircraft-row").first().evaluate((element) => element.click());
        await sidebar.locator(".detail-back-button").waitFor({ state: "visible" });
        await page.keyboard.press("/");
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-traffic"));
        await page.waitForFunction(() => document.activeElement?.classList.contains("search-input"));
        if (!await page.locator(".search-input").isVisible()) {
          throw new Error(`Slash shortcut did not return from aircraft detail at ${viewport.width}px`);
        }
        await sidebar.locator(".drawer-close-button").click();
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-closed"));
        await page.locator("details.map-layers").evaluate((element) => { element.open = false; });
        await trafficTrigger.click({ force: true });
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-traffic"));
        await sidebar.locator(".aircraft-row").first().click();
        await sidebar.locator(".detail-back-button").waitFor({ state: "visible" });
        await sidebar.locator(".detail-back-button").click();
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-traffic"));
        await sidebar.locator(".drawer-close-button").click();
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-closed"));
        if (await page.evaluate(() => document.activeElement?.getAttribute("data-testid")) !== "traffic-trigger") {
          throw new Error(`Desktop Close did not restore focus to Traffic trigger at ${viewport.width}px`);
        }
        await page.locator("details.map-layers").evaluate((element) => { element.open = false; });
        await trafficTrigger.click({ force: true });
        await sidebar.locator(".aircraft-row").first().click();
        await sidebar.locator(".detail-back-button").waitFor({ state: "visible" });
        await sidebar.locator(".drawer-close-button").click();
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-closed"));
        await trafficTrigger.focus();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-traffic"));
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("drawer-closed"));
        if (await page.evaluate(() => document.activeElement?.getAttribute("data-testid")) !== "traffic-trigger") {
          throw new Error(`Desktop Escape did not restore focus to Traffic trigger at ${viewport.width}px`);
        }
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
        if (await trafficTrigger.isVisible()) throw new Error(`Traffic trigger is visible on mobile at ${viewport.width}px`);
        const sidebar = page.getByTestId("radar-sidebar");
        const atcPanel = page.getByTestId("atc-relevance-panel");
        const sidebarBounds = await sidebar.boundingBox();
        const atcPanelBounds = await atcPanel.boundingBox();
        if (!sidebarBounds || !atcPanelBounds) throw new Error(`Compact sidebar is not measurable at ${viewport.width}px`);
        if (atcPanelBounds.y + atcPanelBounds.height > sidebarBounds.y + sidebarBounds.height + 2) {
          throw new Error(`Compact ATC panel is clipped at ${viewport.width}px: sidebar=${JSON.stringify(sidebarBounds)}, atc=${JSON.stringify(atcPanelBounds)}`);
        }
        if (await page.locator('[data-testid="radar-sidebar"].compact .sidebar-secondary-tools').isVisible()) {
          throw new Error(`Secondary tools remain visible in compact sidebar at ${viewport.width}px`);
        }
        await page.locator(".mobile-collapse").click();
        await page.locator('[data-testid="radar-sidebar"]:not(.compact)').waitFor({ state: "visible" });
        if (!await page.locator('[data-testid="radar-sidebar"]:not(.compact) .sidebar-secondary-tools').isVisible()) {
          throw new Error(`Secondary tools are not available after expanding sidebar at ${viewport.width}px`);
        }
        await page.locator(".mobile-collapse").click();
      }

      const airportLayer = page.getByTestId("map-layer-airports");
      const atcLayer = page.getByTestId("map-layer-atc");
      const atsLayer = page.getByTestId("map-layer-ats");
      const sigmetLayer = page.getByTestId("map-layer-sigmet");
      await airportLayer.waitFor({ state: "visible" });
      if (viewport.width === 375) {
        try {
          await page.waitForFunction(() => {
            const text = (document.querySelector('[data-testid="map-layer-airports"]')?.textContent || "").toLowerCase();
            return text.includes("reconnecting") || text.includes("obnovuje se spojení");
          }, undefined, { timeout: 5_000 });
        } catch (error) {
          // A fast retry can complete before the transient state is painted;
          // the later attempt-count assertion still verifies recovery.
          if (airportAttempts < 2) throw error;
        }
      }
      await page.waitForFunction(() => /\d/.test(document.querySelector('[data-testid="map-layer-airports"]')?.textContent || ""));
      const airportCheckbox = airportLayer.locator("input");
      await airportCheckbox.uncheck();
      await airportCheckbox.check();
      await atcLayer.locator("input").check();
      await page.waitForFunction(() => /\d/.test(document.querySelector('[data-testid="map-layer-atc"]')?.textContent || ""));
      await atcLayer.locator("input").uncheck();
      await atcLayer.locator("input").check();
      await page.waitForFunction(() => {
        const map = window.__airradarMapForDiagnostics;
        return Boolean(map?.getSource("route-airports") && map.querySourceFeatures("route-airports").some((feature) => feature.properties?.icao === "LKFIX"));
      }, undefined, { timeout: 10_000 });
      await page.waitForFunction(() => {
        const map = window.__airradarMapForDiagnostics;
        return Boolean(map?.getSource("atc-sectors") && map.querySourceFeatures("atc-sectors").some((feature) => feature.properties?.id === "fixture-sector"));
      }, undefined, { timeout: 10_000 });
      await atsLayer.locator("input").check();
      await page.waitForFunction(() => /\d/.test(document.querySelector('[data-testid="map-layer-ats"]')?.textContent || ""));
      await page.waitForFunction(() => {
        const map = window.__airradarMapForDiagnostics;
        return Boolean(map?.getSource("ats-routes") && map.querySourceFeatures("ats-routes").some((feature) => feature.properties?.segmentId === "fixture-segment"));
      }, undefined, { timeout: 10_000 });
      await page.locator(".aircraft-row").first().evaluate((element) => element.click());
      if (viewport.width >= 821) {
        await page.locator("details.map-layers").evaluate((element) => { element.open = true; });
        const detailLayerMenuBounds = await page.locator(".map-layers-menu").boundingBox();
        const detailDrawerBounds = await page.getByTestId("radar-sidebar").boundingBox();
        if (!detailLayerMenuBounds || !detailDrawerBounds || detailLayerMenuBounds.x + detailLayerMenuBounds.width > detailDrawerBounds.x + 1) {
          throw new Error(`Map layers menu is not usable beside aircraft detail at ${viewport.width}px`);
        }
        await page.locator("details.map-layers").evaluate((element) => { element.open = false; });
      }
      await page.waitForFunction(() => {
        const map = window.__airradarMapForDiagnostics;
        if (!map?.isStyleLoaded()) return false;
        return JSON.stringify(map.getFilter("atc-sectors-context-highlight"))?.includes("fixture-sector")
          && JSON.stringify(map.getFilter("ats-route-context-highlight"))?.includes("fixture-segment");
      }, undefined, { timeout: 10_000 });
      await page.locator(viewport.width >= 821 ? ".drawer-close-button" : ".close-button").click();
      await page.waitForFunction(() => {
        const map = window.__airradarMapForDiagnostics;
        if (!map?.isStyleLoaded()) return false;
        return !JSON.stringify(map.getFilter("atc-sectors-context-highlight"))?.includes("fixture-sector")
          && !JSON.stringify(map.getFilter("ats-route-context-highlight"))?.includes("fixture-segment");
      }, undefined, { timeout: 10_000 });
      await atsLayer.locator("input").evaluate((element) => element.click());
      await atsLayer.locator("input").evaluate((element) => element.click());
      await sigmetLayer.locator("input").evaluate((element) => element.click());
      await page.evaluate(() => window.__airradarMapForDiagnostics?.jumpTo({ center: [17.9, 49.0], zoom: 8 }));
      await page.waitForFunction(() => {
        const map = window.__airradarMapForDiagnostics;
        if (!map || !map.isStyleLoaded()) return false;
        const sourceIds = ["route-airports", "atc-sectors", "ats-routes", "aviation-sigmet"];
        const layerIds = ["route-airports-circle", "atc-sectors-fill", "ats-routes-line", "aviation-sigmet-fill"];
        const hasCountry = (sourceId, layerId, countryCode) => map.queryRenderedFeatures({ layers: [layerId] }).some((feature) => feature.properties?.countryCode === countryCode)
          || map.querySourceFeatures(sourceId).some((feature) => feature.properties?.countryCode === countryCode);
        return sourceIds.every((id) => Boolean(map.getSource(id)))
          && layerIds.every((id) => Boolean(map.getLayer(id)))
          && hasCountry("atc-sectors", "atc-sectors-fill", "SK")
          && hasCountry("atc-sectors", "atc-sectors-fill", "AT")
          && hasCountry("ats-routes", "ats-routes-line", "SK")
          && hasCountry("ats-routes", "ats-routes-line", "AT");
      }, undefined, { timeout: 30_000 });
      await page.evaluate(() => window.__airradarMapForDiagnostics?.jumpTo({ center: [19.5, 48.8], zoom: 6 }));
      await page.waitForFunction(() => {
        const map = window.__airradarMapForDiagnostics;
        if (!map?.isStyleLoaded()) return false;
        const hasCountry = (sourceId, layerId, countryCode) => map.queryRenderedFeatures({ layers: [layerId] }).some((feature) => feature.properties?.countryCode === countryCode)
          || map.querySourceFeatures(sourceId).some((feature) => feature.properties?.countryCode === countryCode);
        return hasCountry("atc-sectors", "atc-sectors-fill", "SK")
          && hasCountry("atc-sectors", "atc-sectors-fill", "AT")
          && hasCountry("ats-routes", "ats-routes-line", "SK")
          && hasCountry("ats-routes", "ats-routes-line", "AT");
      }, undefined, { timeout: 30_000 });
      await page.waitForFunction(() => {
        const map = window.__airradarMapForDiagnostics;
        if (!map?.isStyleLoaded()) return false;
        return map.queryRenderedFeatures({ layers: ["atc-sectors-fill"] }).some((feature) => feature.properties?.countryCode === "SK" && feature.properties?.airspaceType === "FIR")
          || map.querySourceFeatures("atc-sectors").some((feature) => feature.properties?.countryCode === "SK" && feature.properties?.airspaceType === "FIR")
          || map.queryRenderedFeatures({ layers: ["atc-sectors-fill"] }).some((feature) => feature.properties?.countryCode === "AT" && feature.properties?.airspaceType === "FIR")
          || map.querySourceFeatures("atc-sectors").some((feature) => feature.properties?.countryCode === "AT" && feature.properties?.airspaceType === "FIR");
      }, undefined, { timeout: 30_000 });
      if (browserErrors.length) throw new Error(`Browser errors at ${viewport.width}px: ${browserErrors.join(" | ")}`);
      if (viewport.width === 375 && (airportAttempts < 2 || atcAttempts < 2)) throw new Error(`Transient dataset recovery did not retry without reload: airports=${airportAttempts}, atc=${atcAttempts}`);
      if (viewport.width <= 820) {
        const mobileSidebar = page.getByTestId("radar-sidebar");
        await page.locator(".map-container").waitFor({ state: "visible" });
        if (!await mobileSidebar.evaluate((element) => element.classList.contains("compact"))) {
          throw new Error("Mobile traffic sheet is not compact initially");
        }
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
        await mobileSidebar.locator(".close-button").click();
        await page.waitForFunction(() => document.querySelector('[data-testid="radar-sidebar"]')?.classList.contains("compact"));
      }
      await page.evaluate(() => window.__airradarMapForDiagnostics?.jumpTo({ center: [14.2, 50.1], zoom: 8 }));
      await page.waitForFunction(() => {
        const map = window.__airradarMapForDiagnostics;
        if (!map || !map.isStyleLoaded()) return false;
        return map.queryRenderedFeatures({ layers: ["atc-sectors-fill"] }).some((feature) => feature.properties?.countryCode === "CZ")
          && map.queryRenderedFeatures({ layers: ["ats-routes-line"] }).some((feature) => feature.properties?.countryCode === "CZ");
      }, undefined, { timeout: 30_000 });
      const accessibility = await page.evaluate(() => ({
        missingImageAlt: [...document.images].filter((image) => !image.hasAttribute("alt")).length,
        unnamedButtons: [...document.querySelectorAll("button")].filter((button) => !button.textContent?.trim() && !button.getAttribute("aria-label")).length,
      }));
      if (accessibility.missingImageAlt || accessibility.unnamedButtons) throw new Error(`Basic accessibility check failed at ${viewport.width}px: ${JSON.stringify(accessibility)}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
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
    const staticPayloadBytes = {};
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
    const sseSnapshotBytes = await assertSseLifecycle();
    const sseV2SnapshotBytes = await assertSseV2Lifecycle();
    const afterSse = await get("/api/system/status");
    const afterSsePayload = await afterSse.json();
    if (!afterSse.ok) throw new Error("SSE cleanup diagnostics request failed");
    if (afterSsePayload.runtime?.activeSseClients !== 0) await waitForSseCleanup();
    await assertBrowserSmoke();
    console.log(`[production-gates] measured first SSE event bytes=${sseSnapshotBytes}, V2 snapshot bytes=${sseV2SnapshotBytes}, airports bytes=${staticPayloadBytes["/api/airports"]}, ATC bytes=${staticPayloadBytes["/api/atc/sectors"]}`);
    console.log("[production-gates] built server, SSE, caching, auth, PWA, migration, and diagnostics checks passed");
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
