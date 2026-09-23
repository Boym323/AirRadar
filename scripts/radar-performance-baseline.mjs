import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as wait } from "node:timers/promises";
import { chromium } from "playwright";
import { RADAR_PERFORMANCE_SCENARIOS, evaluateRadarPerformanceBaseline } from "./radar-performance-budget.mjs";

const host = "127.0.0.1";
const port = Number(process.env.RADAR_PERF_PORT || 3299);
const baseUrl = `http://${host}:${port}`;
const warmupMs = Number(process.env.RADAR_PERF_WARMUP_MS || 900);
const measureMs = Number(process.env.RADAR_PERF_MEASURE_MS || 1800);
const deltaIntervalMs = Number(process.env.RADAR_PERF_DELTA_MS || 180);
const requestedCounts = (process.env.RADAR_PERF_SCENARIOS || "")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);
const scenarios = requestedCounts.length
  ? RADAR_PERFORMANCE_SCENARIOS.filter((scenario) => requestedCounts.includes(scenario.aircraft))
  : [...RADAR_PERFORMANCE_SCENARIOS];

if (!scenarios.length) throw new Error("No radar performance scenarios selected");
if (!existsSync(".next/BUILD_ID")) throw new Error("Radar performance baseline requires a prepared production build (.next/BUILD_ID missing)");

const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function waitForHealthyServer(child, exitPromise) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Radar performance server exited during startup with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        const earlyExit = await Promise.race([
          exitPromise.then((exit) => exit),
          wait(200).then(() => null),
        ]);
        if (earlyExit) throw new Error(`Radar performance server exited during startup with code ${earlyExit.code ?? "null"} signal ${earlyExit.signal ?? "none"}`);
        return;
      }
    } catch (error) {
      if (child.exitCode !== null) throw error;
      // Next.js is still starting.
    }
    await wait(100);
  }
  throw new Error("Radar performance server did not become healthy within 30 seconds");
}

async function installSyntheticAircraftStream(page, count) {
  await page.addInitScript(({ aircraftCount, intervalMs }) => {
    const NativeEventSource = window.EventSource;
    const receiver = { lat: 50.0755, lon: 14.4378, name: "Performance fixture" };

    function observation(index, tick) {
      const columns = Math.ceil(Math.sqrt(aircraftCount));
      const row = Math.floor(index / columns);
      const column = index % columns;
      const baseLat = 49.72 + row * 0.035;
      const baseLon = 13.95 + column * 0.05;
      const shift = tick * 0.0015;
      const now = new Date(Date.now() + tick * intervalMs).toISOString();
      const hex = (index + 1).toString(16).toUpperCase().padStart(6, "0");
      return {
        icaoHex: hex,
        callsign: `PERF${String(index + 1).padStart(3, "0")}`,
        registration: `OK-P${String(index + 1).padStart(3, "0")}`,
        aircraftType: index % 11 === 0 ? "B738" : "A320",
        aircraftDescription: index % 11 === 0 ? "Boeing 737-800" : "Airbus A320",
        lat: baseLat,
        lon: baseLon + shift,
        altitude: 18000 + (index % 18) * 1000,
        baroAltitude: 18000 + (index % 18) * 1000,
        geomAltitude: 18100 + (index % 18) * 1000,
        groundSpeed: 360 + (index % 9) * 8,
        track: 90,
        verticalRate: 0,
        baroRate: 0,
        geomRate: 0,
        squawk: "2000",
        category: "A3",
        emergency: "none",
        rssi: -15,
        messages: 1000 + tick,
        seenSeconds: 0,
        seenPosSeconds: 0,
        lastSeen: now,
        source: "ADS-B",
        origin: "local",
        provenance: {
          seenLocal: true,
          seenNetwork: false,
          lastLocalSeen: now,
          lastNetworkSeen: null,
          positionOrigin: "local",
          positionSource: "ADS-B",
        },
        sourceType: "adsb_icao",
        onGround: false,
        distanceKm: 15 + index * 0.22,
        bearing: (index * 17) % 360,
      };
    }

    function commonPayload(tick) {
      const now = new Date(Date.now() + tick * intervalMs).toISOString();
      return {
        relevantAtcFrequencies: [],
        receiver,
        fetchedAt: now,
        provider: "performance-fixture",
        sourceOnline: true,
        lastSourceUpdate: now,
        sourceError: null,
        readsbOnline: true,
        lastReadsbUpdate: now,
        lastError: null,
        stats: {
          currentAircraft: aircraftCount,
          aircraftSeenToday: aircraftCount,
          uniqueAircraftToday: aircraftCount,
          maxConcurrentAircraft: aircraftCount,
          maxDistanceKm: 15 + Math.max(0, aircraftCount - 1) * 0.22,
          aircraftTypes: [{ name: "A320", count: aircraftCount }],
          airlines: [],
          messagesPerSecond: aircraftCount * 4,
        },
        sources: {
          local: { online: true },
          adsbLol: {
            enabled: false,
            status: "disabled",
            lastAttemptAt: null,
            lastSuccessAt: null,
            latencyMs: null,
            consecutiveFailures: 0,
            aircraftCount: 0,
            positionedAircraftCount: 0,
            mlatAircraftCount: 0,
            radiusNm: 250,
            pollIntervalMs: 5000,
            retryAfterMs: null,
          },
        },
      };
    }

    class SyntheticEventSource {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      CONNECTING = 0;
      OPEN = 1;
      CLOSED = 2;

      constructor(url, options) {
        if (!String(url).startsWith("/api/stream")) return new NativeEventSource(url, options);
        this.url = String(url);
        this.withCredentials = false;
        this.readyState = SyntheticEventSource.CONNECTING;
        this.listeners = new Map();
        this.sequence = 1;
        this.tick = 0;
        this.timer = null;
        this.startTimer = window.setTimeout(() => {
          if (this.readyState === SyntheticEventSource.CLOSED) return;
          this.readyState = SyntheticEventSource.OPEN;
          this.onopen?.(new Event("open"));
          this.emit("snapshot", {
            protocol: "airradar-sse-v2",
            sequence: String(this.sequence),
            ...commonPayload(this.tick),
            aircraft: Array.from({ length: aircraftCount }, (_, index) => observation(index, this.tick)),
          });
          this.timer = window.setInterval(() => {
            if (this.readyState !== SyntheticEventSource.OPEN) return;
            this.tick += 1;
            this.sequence += 1;
            this.emit("delta", {
              protocol: "airradar-sse-v2",
              sequence: String(this.sequence),
              ...commonPayload(this.tick),
              changed: Array.from({ length: aircraftCount }, (_, index) => observation(index, this.tick)),
              removed: [],
            });
          }, intervalMs);
        }, 50);
      }

      addEventListener(type, listener) {
        const values = this.listeners.get(type) ?? [];
        values.push(listener);
        this.listeners.set(type, values);
      }

      removeEventListener(type, listener) {
        const values = this.listeners.get(type);
        if (!values) return;
        this.listeners.set(type, values.filter((value) => value !== listener));
      }

      emit(type, payload) {
        const event = new MessageEvent(type, { data: JSON.stringify(payload) });
        for (const listener of this.listeners.get(type) ?? []) {
          if (typeof listener === "function") listener.call(this, event);
          else listener?.handleEvent?.(event);
        }
        if (type === "message") this.onmessage?.(event);
      }

      close() {
        this.readyState = SyntheticEventSource.CLOSED;
        window.clearTimeout(this.startTimer);
        if (this.timer !== null) window.clearInterval(this.timer);
      }
    }

    window.EventSource = SyntheticEventSource;
  }, { aircraftCount: count, intervalMs: deltaIntervalMs });
}

function rounded(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}

async function measureScenario(browser, scenario) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({
      status: 200,
      contentType: "image/png",
      body: transparentPng,
    }));
    await installSyntheticAircraftStream(page, scenario.aircraft);
    await page.goto(`${baseUrl}/?perfDiagnostics=1&mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
    await page.locator("h1").first().waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForFunction((count) => {
      const diagnostics = window.__airradarPerformanceDiagnostics;
      const markers = window.__airradarAircraftMarkersForDiagnostics;
      return Boolean(diagnostics && markers && markers.size === count);
    }, scenario.aircraft, { timeout: 30_000 });

    const trafficTrigger = page.locator('[data-testid="traffic-trigger"]');
    await trafficTrigger.waitFor({ state: "visible", timeout: 10_000 });
    await trafficTrigger.click();
    await page.waitForFunction((count) => {
      const list = document.querySelector("#traffic-list");
      const rows = document.querySelectorAll("#traffic-list .aircraft-row").length;
      return Boolean(list && list.getAttribute("data-total-rows") === String(count) && rows > 0);
    }, scenario.aircraft, { timeout: 10_000 });

    await wait(warmupMs);
    await page.evaluate(() => {
      window.__airradarPerformanceDiagnostics?.reset();
      window.dispatchEvent(new Event("airradar:performance-diagnostics-ready"));
    });
    await wait(measureMs);

    const raw = await page.evaluate(() => {
      const snapshot = window.__airradarPerformanceDiagnostics?.snapshot();
      if (!snapshot) throw new Error("Performance diagnostics unavailable");
      return {
        snapshot,
        dom: {
          aircraftMarkers: document.querySelectorAll(".aircraft-marker").length,
          markerHandles: window.__airradarAircraftMarkersForDiagnostics?.size ?? -1,
          mountedTrafficRows: document.querySelectorAll("#traffic-list .aircraft-row").length,
        },
      };
    });
    const durationSeconds = Math.max(raw.snapshot.sinceMs / 1000, 0.001);
    const result = {
      aircraft: scenario.aircraft,
      measuredMs: raw.snapshot.sinceMs,
      animation: {
        ...raw.snapshot.animation,
        averageMs: rounded(raw.snapshot.animation.averageMs),
        maxMs: rounded(raw.snapshot.animation.maxMs),
        markerWritesPerSecond: rounded(raw.snapshot.animation.markerWrites / durationSeconds),
      },
      labelCollision: {
        ...raw.snapshot.labelCollision,
        averageMs: rounded(raw.snapshot.labelCollision.averageMs),
        maxMs: rounded(raw.snapshot.labelCollision.maxMs),
      },
      trafficList: raw.snapshot.trafficList,
      longTasks: {
        ...raw.snapshot.longTasks,
        totalMs: rounded(raw.snapshot.longTasks.totalMs),
        maxMs: rounded(raw.snapshot.longTasks.maxMs),
      },
      dom: raw.dom,
    };
    const violations = evaluateRadarPerformanceBaseline(result, scenario);
    console.log(
      `[radar-perf] aircraft=${scenario.aircraft} markers=${result.dom.aircraftMarkers} rows=${result.dom.mountedTrafficRows} `
      + `animation=${result.animation.averageMs}ms/${result.animation.maxMs}ms writes=${result.animation.markerWritesPerSecond}/s `
      + `collision=${result.labelCollision.averageMs}ms/${result.labelCollision.maxMs}ms longTasks=${result.longTasks.count} `
      + `status=${violations.length ? "FAIL" : "PASS"}`,
    );
    for (const violation of violations) console.error(`[radar-perf]   budget: ${violation}`);
    return { ...result, budget: scenario.budget, violations };
  } finally {
    await page.close();
  }
}

function markdownReport(report) {
  const lines = [
    "# Radar production performance baseline",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "Timing metrics are observational only. CI pass/fail is based on deterministic structural/instrumentation budgets so hosted-runner load does not create flaky failures.",
    "",
    "| Aircraft | Markers | Mounted rows | Animation avg/max | Writes/s | Collision avg/max | Long tasks | Status |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |",
  ];
  for (const result of report.scenarios) {
    lines.push(
      `| ${result.aircraft} | ${result.dom.aircraftMarkers} | ${result.dom.mountedTrafficRows} | ${result.animation.averageMs} / ${result.animation.maxMs} ms | ${result.animation.markerWritesPerSecond} | ${result.labelCollision.averageMs} / ${result.labelCollision.maxMs} ms | ${result.longTasks.count} | ${result.violations.length ? "FAIL" : "PASS"} |`,
    );
    for (const violation of result.violations) lines.push(`|  |  |  |  |  |  |  | \`${violation}\` |`);
  }
  lines.push(
    "",
    "Deterministic budgets:",
    "- DOM marker and MapLibre handle counts must equal the scenario aircraft count.",
    "- Traffic-list total rows must equal the scenario count and virtualization must stay enabled.",
    "- Mounted traffic rows must stay at or below the checked-in structural budget.",
    "- Animation and collision diagnostics must record live work; active jobs may not exceed aircraft count.",
    "",
  );
  return lines.join("\n");
}

async function main() {
  const runtimeStateDirectory = mkdtempSync(resolve(tmpdir(), "airradar-radar-perf-"));
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", host, "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "",
      READSB_BASE_URL: "",
      ATC_SAMPLE_ENABLED: "true",
      ADSBDB_ENABLED: "false",
      ADSBLOL_ENABLED: "false",
      ADSBHUB_ENABLED: "false",
      AIRCRAFT_PHOTOS_ENABLED: "false",
      OGN_ENABLED: "false",
      FLIGHTAWARE_API_KEY: "",
      AIRRADAR_CHANNEL: "production",
      AIRRADAR_RUNTIME_STATE_DIRECTORY: runtimeStateDirectory,
      WEATHER_RADAR_ARCHIVE_DIR: resolve(runtimeStateDirectory, "weather-radar"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverLogs = [];
  const exitPromise = new Promise((resolveExit) => child.once("exit", (code, signal) => resolveExit({ code, signal })));
  child.stdout.on("data", (chunk) => serverLogs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => serverLogs.push(chunk.toString()));
  const stop = () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  let browser;
  try {
    await waitForHealthyServer(child, exitPromise);
    browser = await chromium.launch({ headless: true });
    const results = [];
    for (const scenario of scenarios) results.push(await measureScenario(browser, scenario));
    const failed = results.filter((result) => result.violations.length > 0);
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        warmupMs,
        measureMs,
        deltaIntervalMs,
      },
      scenarios: results,
      passed: failed.length === 0,
    };
    mkdirSync("artifacts", { recursive: true });
    writeFileSync("artifacts/radar-performance-baseline.json", JSON.stringify(report, null, 2) + "\n");
    writeFileSync("artifacts/radar-performance-baseline.md", markdownReport(report) + "\n");
    console.log("[radar-perf] report=artifacts/radar-performance-baseline.json");
    console.log("[radar-perf] summary=artifacts/radar-performance-baseline.md");
    if (failed.length) {
      throw new Error(`Radar performance baseline failed in ${failed.length}/${results.length} scenarios`);
    }
  } catch (error) {
    const detail = serverLogs.join("").slice(-4_000);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${detail}`);
  } finally {
    await browser?.close();
    stop();
    await exitPromise;
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    rmSync(runtimeStateDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[radar-perf] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
