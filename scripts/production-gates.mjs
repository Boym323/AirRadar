import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
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
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
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
      FLIGHTAWARE_API_KEY: "",
      WATCHLIST_ADMIN_TOKEN: "production-gate-token",
      AIRRADAR_CHANNEL: gateChannel === "rc" ? "release-candidate" : "production",
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
    const watchlistMutation = await get("/api/watchlist", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (watchlistMutation.status !== 401) throw new Error("Watchlist mutation was not protected");
    const sseSnapshotBytes = await assertSseLifecycle();
    const afterSse = await get("/api/system/status");
    const afterSsePayload = await afterSse.json();
    if (!afterSse.ok || afterSsePayload.runtime?.activeSseClients !== 0) throw new Error("SSE client cleanup failed");
    await assertBrowserSmoke();
    console.log(`[production-gates] measured first SSE event bytes=${sseSnapshotBytes}, airports bytes=${staticPayloadBytes["/api/airports"]}, ATC bytes=${staticPayloadBytes["/api/atc/sectors"]}`);
    console.log("[production-gates] built server, SSE, caching, auth, PWA, migration, and diagnostics checks passed");
  } catch (error) {
    const detail = logs.join("").slice(-4_000);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${detail}`);
  } finally {
    stop();
    await new Promise((resolve) => child.once("exit", resolve));
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`[production-gates] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
