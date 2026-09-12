import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

const host = "127.0.0.1";
const port = Number(process.env.PRODUCTION_GATE_PORT || 3199);
const baseUrl = `http://${host}:${port}`;

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

function assertMigrationSource() {
  const directory = "migrations/app/20260909T0830_recap_query_indexes";
  const manifest = JSON.parse(readFileSync(`${directory}/migration.json`, "utf8"));
  if (manifest.from !== "03aa657ab742b58e9acb95c3556a50f3ab7ec364cd0aeee203514e8688912ee2") throw new Error("Recap migration is not based on the current applied contract");
  const operations = JSON.parse(readFileSync(`${directory}/ops.json`, "utf8"));
  if (operations.length !== 2 || operations.some((operation) => operation.operationClass !== "additive")) throw new Error("Recap migration is not additive-only");
  const airportDirectory = "migrations/app/20260910T0535_airport_data_v2";
  const airportManifest = JSON.parse(readFileSync(`${airportDirectory}/migration.json`, "utf8"));
  if (airportManifest.from !== "e05c22fd90a750642d9e212984e8b9d0797d81c37a9754fb29eebf0e50c82a08") throw new Error("Airport Data v2 migration is not based on the current applied contract");
  const airportOperations = JSON.parse(readFileSync(`${airportDirectory}/ops.json`, "utf8"));
  if (airportOperations.length < 1 || airportOperations.some((operation) => operation.operationClass !== "additive")) throw new Error("Airport Data v2 migration is not additive-only");
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
      { width: 375, height: 844 },
      { width: 390, height: 844 },
      { width: 821, height: 900 },
      { width: 850, height: 900 },
      { width: 900, height: 900 },
      { width: 1024, height: 900 },
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
      page.on("console", (message) => { if (message.type() === "error") browserErrors.push(`console: ${message.text()}`); });
      page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
      page.on("worker", (worker) => worker.on("error", (error) => browserErrors.push(`worker: ${error.message}`)));
      await page.route("**/api/airports", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ icaoCode: "LKFIX", iataCode: "FIX", name: "Browser fixture airport", city: "Fixture", country: "CZ", latitude: 50.0755, longitude: 14.4378, type: "large_airport" }]),
      }));
      await page.route("**/api/atc/sectors", (route) => route.fulfill({
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
          }],
          transmitters: [],
          metadata: { status: "configured", source: "browser fixture", sourceReference: "https://example.invalid/atc", effectiveDate: "2026-09-03", lastVerifiedAt: "2026-09-03T00:00:00.000Z", sectorCount: 1, transmitterCount: 0 },
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
          segments: { type: "FeatureCollection", features: [{ type: "Feature", properties: { countryCode: "CZ", routeDesignator: "FIXTURE1", segmentId: "fixture-segment", fromName: "A", toName: "B", navigationSpecification: "RNAV", distanceNm: 10, lowerLimit: "SFC", upperLimit: "UNL", lowerOverride: null, magTrackForwardDeg: 90, magTrackReverseDeg: 270, cruisingLevelForward: null, cruisingLevelReverse: null, availabilityClass: null, effectiveDate: "2026-09-03", aipAmendment: null, airacAmendment: null, remarks: null }, geometry: { type: "LineString", coordinates: [[14, 50], [14.2, 50.1]] } }, { type: "Feature", properties: { countryCode: "SK", routeDesignator: "A4", segmentId: "sk-segment", fromName: "SKA", toName: "SKB", navigationSpecification: "CONVENTIONAL", distanceNm: 10, lowerLimit: "SFC", upperLimit: "UNL", lowerOverride: null, magTrackForwardDeg: 90, magTrackReverseDeg: 270, cruisingLevelForward: null, cruisingLevelReverse: null, availabilityClass: null, effectiveDate: "2026-09-03", aipAmendment: null, airacAmendment: null, remarks: null }, geometry: { type: "LineString", coordinates: [[17.4, 48.7], [18.1, 49.1]] } }] },
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
      await page.locator("details.map-layers > summary").click();
      const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (hasHorizontalOverflow) throw new Error(`Horizontal overflow at ${viewport.width}px`);

      const layerMenu = page.locator(".map-layers-menu");
      const layerMenuBounds = await layerMenu.boundingBox();
      if (!layerMenuBounds) throw new Error(`Map layers menu is not measurable at ${viewport.width}px`);
      if (layerMenuBounds.x < 0 || layerMenuBounds.x + layerMenuBounds.width > viewport.width) {
        throw new Error(`Map layers menu overflows at ${viewport.width}px: ${JSON.stringify(layerMenuBounds)}`);
      }

      if (viewport.width <= 820) {
        const sidebar = page.locator('[data-testid="radar-sidebar"].compact');
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
      await page.waitForFunction(() => /\d/.test(document.querySelector('[data-testid="map-layer-airports"]')?.textContent || ""));
      const airportCheckbox = airportLayer.locator("input");
      await airportCheckbox.uncheck();
      await airportCheckbox.check();
      await atcLayer.locator("input").check();
      await page.waitForFunction(() => /\d/.test(document.querySelector('[data-testid="map-layer-atc"]')?.textContent || ""));
      await atcLayer.locator("input").uncheck();
      await atcLayer.locator("input").check();
      await atsLayer.locator("input").check();
      await page.waitForFunction(() => /\d/.test(document.querySelector('[data-testid="map-layer-ats"]')?.textContent || ""));
      await atsLayer.locator("input").uncheck();
      await atsLayer.locator("input").check();
      await sigmetLayer.locator("input").check();
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
          && hasCountry("ats-routes", "ats-routes-line", "SK");
      }, undefined, { timeout: 30_000 });
      await page.evaluate(() => window.__airradarMapForDiagnostics?.jumpTo({ center: [19.5, 48.8], zoom: 6 }));
      await page.waitForFunction(() => {
        const map = window.__airradarMapForDiagnostics;
        if (!map?.isStyleLoaded()) return false;
        const hasCountry = (sourceId, layerId, countryCode) => map.queryRenderedFeatures({ layers: [layerId] }).some((feature) => feature.properties?.countryCode === countryCode)
          || map.querySourceFeatures(sourceId).some((feature) => feature.properties?.countryCode === countryCode);
        return hasCountry("atc-sectors", "atc-sectors-fill", "SK")
          && hasCountry("ats-routes", "ats-routes-line", "SK");
      }, undefined, { timeout: 30_000 });
      await page.waitForFunction(() => {
        const map = window.__airradarMapForDiagnostics;
        if (!map?.isStyleLoaded()) return false;
        return map.queryRenderedFeatures({ layers: ["atc-sectors-fill"] }).some((feature) => feature.properties?.countryCode === "SK" && feature.properties?.airspaceType === "FIR")
          || map.querySourceFeatures("atc-sectors").some((feature) => feature.properties?.countryCode === "SK" && feature.properties?.airspaceType === "FIR");
      }, undefined, { timeout: 30_000 });
      if (browserErrors.length) throw new Error(`Browser errors at ${viewport.width}px: ${browserErrors.join(" | ")}`);
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
