import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

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
      const accessibility = await page.evaluate(() => ({
        missingImageAlt: [...document.images].filter((image) => !image.alt).length,
        unnamedButtons: [...document.querySelectorAll("button")].filter((button) => !button.textContent?.trim() && !button.getAttribute("aria-label")).length,
      }));
      if (accessibility.missingImageAlt || accessibility.unnamedButtons) throw new Error(`Basic accessibility check failed at ${viewport.width}px`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
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
      AIRRADAR_CHANNEL: "production",
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
    if (versionPayload.version !== "1.0.0" || versionPayload.channel !== "production") throw new Error("Release metadata smoke failed");
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

main().catch((error) => {
  console.error(`[production-gates] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
