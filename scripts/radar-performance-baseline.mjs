import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as wait } from "node:timers/promises";
import { chromium } from "playwright";
import { RADAR_PERFORMANCE_SCENARIOS, evaluateRadarPerformanceBaseline } from "./radar-performance-budget.mjs";

const host = "127.0.0.1";
const port = Number(process.env.RADAR_PERF_PORT || 3299);
const baseUrl = `http://${host}:${port}`;
const soakMode = process.env.RADAR_PERF_SOAK === "1";
const warmupMs = Number(process.env.RADAR_PERF_WARMUP_MS || (soakMode ? 2_000 : 900));
const measureMs = Number(process.env.RADAR_PERF_MEASURE_MS || (soakMode ? 90_000 : 1800));
const deltaIntervalMs = Number(process.env.RADAR_PERF_DELTA_MS || 180);
const soakSseClients = Number(process.env.RADAR_PERF_SOAK_SSE_CLIENTS || 20);
const soakSseRounds = Number(process.env.RADAR_PERF_SOAK_SSE_ROUNDS || 4);
const soakAdminToken = process.env.RADAR_PERF_SOAK_ADMIN_TOKEN || "radar-soak-admin";
const soakHeapGrowthLimitBytes = Number(process.env.RADAR_PERF_SOAK_MAX_HEAP_GROWTH_MB || 96) * 1024 * 1024;
const soakServerRssGrowthLimitBytes = Number(process.env.RADAR_PERF_SOAK_MAX_RSS_GROWTH_MB || 192) * 1024 * 1024;
const soakNodeGrowthLimit = Number(process.env.RADAR_PERF_SOAK_MAX_NODE_GROWTH || 500);
const soakListenerGrowthLimit = Number(process.env.RADAR_PERF_SOAK_MAX_LISTENER_GROWTH || 250);
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
  const timeoutError = () => new Error("Radar performance server did not become healthy within 30 seconds");
  const exitError = (exit) => new Error(
    `Radar performance server exited during startup with code ${exit?.code ?? child.exitCode ?? "null"} signal ${exit?.signal ?? child.signalCode ?? "none"}`,
  );

  while (true) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw timeoutError();
    if (child.exitCode !== null || child.signalCode !== null) throw exitError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingMs);
    try {
      const outcome = await Promise.race([
        fetch(`${baseUrl}/api/health`, { signal: controller.signal }).then(
          (response) => ({ type: "response", response }),
          (error) => ({ type: "request-error", error }),
        ),
        exitPromise.then((exit) => ({ type: "exit", exit })),
      ]);

      if (outcome.type === "exit") {
        controller.abort();
        throw exitError(outcome.exit);
      }
      if (outcome.type === "request-error") {
        if (controller.signal.aborted || Date.now() >= deadline) throw timeoutError();
        // Next.js is still starting.
      } else if (outcome.response.ok) {
        const stabilityWindowMs = Math.min(200, Math.max(0, deadline - Date.now()));
        if (stabilityWindowMs <= 0) throw timeoutError();
        const earlyExit = await Promise.race([
          exitPromise.then((exit) => exit),
          wait(stabilityWindowMs).then(() => null),
        ]);
        if (earlyExit) throw exitError(earlyExit);
        return;
      }
    } finally {
      clearTimeout(timeout);
    }

    const retryDelayMs = Math.min(100, Math.max(0, deadline - Date.now()));
    if (retryDelayMs <= 0) throw timeoutError();
    await wait(retryDelayMs);
  }
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
        emergency: null,
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

function readProcessRssBytes(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    return match ? Number(match[1]) * 1024 : null;
  } catch {
    return null;
  }
}

async function browserFootprint(page) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("HeapProfiler.enable");
    await session.send("HeapProfiler.collectGarbage");
    await wait(100);
    await session.send("Performance.enable");
    const result = await session.send("Performance.getMetrics");
    const metrics = new Map(result.metrics.map((metric) => [metric.name, metric.value]));
    const value = (name) => {
      const metric = metrics.get(name);
      return typeof metric === "number" && Number.isFinite(metric) ? metric : null;
    };
    return {
      jsHeapUsedBytes: value("JSHeapUsedSize"),
      nodes: value("Nodes"),
      documents: value("Documents"),
      jsEventListeners: value("JSEventListeners"),
    };
  } finally {
    await session.detach();
  }
}

function numericGrowth(before, after) {
  return typeof before === "number" && typeof after === "number" ? after - before : null;
}

function evaluateSoakFootprint(before, after) {
  if (!before || !after) return ["soak footprint missing"];
  const violations = [];
  const heapGrowth = numericGrowth(before.browser.jsHeapUsedBytes, after.browser.jsHeapUsedBytes);
  const nodeGrowth = numericGrowth(before.browser.nodes, after.browser.nodes);
  const listenerGrowth = numericGrowth(before.browser.jsEventListeners, after.browser.jsEventListeners);
  const rssGrowth = numericGrowth(before.serverRssBytes, after.serverRssBytes);

  if (heapGrowth !== null && heapGrowth > soakHeapGrowthLimitBytes) {
    violations.push(`browser heap grew by ${Math.round(heapGrowth / 1024 / 1024)} MiB (limit ${Math.round(soakHeapGrowthLimitBytes / 1024 / 1024)} MiB)`);
  }
  if (nodeGrowth !== null && nodeGrowth > soakNodeGrowthLimit) {
    violations.push(`DOM node count grew by ${nodeGrowth} (limit ${soakNodeGrowthLimit})`);
  }
  if (listenerGrowth !== null && listenerGrowth > soakListenerGrowthLimit) {
    violations.push(`JS event listener count grew by ${listenerGrowth} (limit ${soakListenerGrowthLimit})`);
  }
  if (rssGrowth !== null && rssGrowth > soakServerRssGrowthLimitBytes) {
    violations.push(`server RSS grew by ${Math.round(rssGrowth / 1024 / 1024)} MiB (limit ${Math.round(soakServerRssGrowthLimitBytes / 1024 / 1024)} MiB)`);
  }
  return violations;
}

async function createAdminSessionCookie() {
  const response = await fetch(`${baseUrl}/api/watchlist/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: soakAdminToken }),
  });
  if (!response.ok) throw new Error(`Soak admin login failed with HTTP ${response.status}`);
  const setCookie = response.headers.get("set-cookie");
  const cookie = setCookie?.split(";", 1)[0];
  if (!cookie) throw new Error("Soak admin login did not return a session cookie");
  return cookie;
}

async function readAdminSystemStatus(cookie) {
  const response = await fetch(`${baseUrl}/api/system/status`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`System status failed with HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.detailLevel !== "admin") throw new Error("Soak diagnostics did not receive admin detail level");
  return payload;
}

async function waitForSseState(cookie, predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await readAdminSystemStatus(cookie);
    if (predicate(latest.runtime.activeSseClients)) return latest;
    await wait(100);
  }
  throw new Error(`SSE state did not converge; last active client count=${latest?.runtime?.activeSseClients ?? "unknown"}`);
}

async function exerciseSseReconnects() {
  const cookie = await createAdminSessionCookie();
  const violations = [];
  let peakClients = 0;

  for (let round = 0; round < soakSseRounds; round += 1) {
    const controllers = Array.from({ length: soakSseClients }, () => new AbortController());
    const responses = await Promise.all(controllers.map((controller) =>
      fetch(`${baseUrl}/api/stream?v=2&coverage=local`, { signal: controller.signal })
    ));
    if (responses.some((response) => !response.ok)) {
      violations.push(`SSE round ${round + 1} returned a non-2xx response`);
    }

    const active = await waitForSseState(cookie, (count) => count >= Math.min(soakSseClients, 1));
    peakClients = Math.max(peakClients, active.runtime.activeSseClients);

    for (const response of responses) await response.body?.cancel().catch(() => undefined);
    for (const controller of controllers) controller.abort();

    try {
      await waitForSseState(cookie, (count) => count === 0);
    } catch (error) {
      violations.push(`SSE round ${round + 1} did not clean up: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const finalStatus = await readAdminSystemStatus(cookie);
  if (finalStatus.runtime.activeSseClients !== 0) {
    violations.push(`SSE clients leaked after churn: ${finalStatus.runtime.activeSseClients} still active`);
  }
  return {
    rounds: soakSseRounds,
    clientsPerRound: soakSseClients,
    peakClients,
    finalActiveClients: finalStatus.runtime.activeSseClients,
    violations,
  };
}

async function measureScenario(browser, scenario, serverPid) {
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
      const webgl = window.__airradarWebglAircraftForDiagnostics;
      return Boolean(diagnostics && markers && webgl && markers.size === 0 && webgl.size === count);
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
    const soakBefore = soakMode ? {
      browser: await browserFootprint(page),
      serverRssBytes: readProcessRssBytes(serverPid),
    } : null;
    await wait(measureMs);

    // Freeze timing/long-task diagnostics before browserFootprint() forces GC.
    // Footprint collection is intentionally outside the measured performance window.
    const raw = await page.evaluate(() => {
      const snapshot = window.__airradarPerformanceDiagnostics?.snapshot();
      if (!snapshot) throw new Error("Performance diagnostics unavailable");
      return {
        snapshot,
        webgl: {
          aircraft: window.__airradarWebglAircraftForDiagnostics?.size ?? -1,
        },
        dom: {
          aircraftMarkers: document.querySelectorAll(".aircraft-marker").length,
          markerHandles: window.__airradarAircraftMarkersForDiagnostics?.size ?? -1,
          mountedTrafficRows: document.querySelectorAll("#traffic-list .aircraft-row").length,
        },
      };
    });

    const soakAfter = soakMode ? {
      browser: await browserFootprint(page),
      serverRssBytes: readProcessRssBytes(serverPid),
    } : null;
    const footprint = soakAfter ?? {
      browser: await browserFootprint(page),
      serverRssBytes: readProcessRssBytes(serverPid),
    };
    const durationSeconds = Math.max(raw.snapshot.sinceMs / 1000, 0.001);
    const result = {
      aircraft: scenario.aircraft,
      measuredMs: raw.snapshot.sinceMs,
      animation: {
        ...raw.snapshot.animation,
        averageMs: rounded(raw.snapshot.animation.averageMs),
        p95Ms: rounded(raw.snapshot.animation.p95Ms),
        maxMs: rounded(raw.snapshot.animation.maxMs),
        frameIntervalP95Ms: rounded(raw.snapshot.animation.frameIntervalP95Ms),
        markerWritesPerSecond: rounded(raw.snapshot.animation.markerWrites / durationSeconds),
      },
      labelCollision: {
        ...raw.snapshot.labelCollision,
        averageMs: rounded(raw.snapshot.labelCollision.averageMs),
        p95Ms: rounded(raw.snapshot.labelCollision.p95Ms),
        maxMs: rounded(raw.snapshot.labelCollision.maxMs),
      },
      trafficList: raw.snapshot.trafficList,
      longTasks: {
        ...raw.snapshot.longTasks,
        totalMs: rounded(raw.snapshot.longTasks.totalMs),
        p95Ms: rounded(raw.snapshot.longTasks.p95Ms),
        maxMs: rounded(raw.snapshot.longTasks.maxMs),
      },
      webgl: raw.webgl,
      dom: raw.dom,
      footprint,
    };
    const soakViolations = soakMode ? evaluateSoakFootprint(soakBefore, soakAfter) : [];
    const violations = [...evaluateRadarPerformanceBaseline(result, scenario), ...soakViolations];
    console.log(
      `[radar-perf] aircraft=${scenario.aircraft} htmlMarkers=${result.dom.aircraftMarkers} webgl=${result.webgl.aircraft} rows=${result.dom.mountedTrafficRows} `
      + `animation=${result.animation.averageMs}ms p95=${result.animation.p95Ms}ms max=${result.animation.maxMs}ms frameP95=${result.animation.frameIntervalP95Ms}ms writes=${result.animation.markerWritesPerSecond}/s `
      + `collision=${result.labelCollision.averageMs}ms p95=${result.labelCollision.p95Ms}ms max=${result.labelCollision.maxMs}ms longTasks=${result.longTasks.count} `
      + `status=${violations.length ? "FAIL" : "PASS"}`,
    );
    for (const violation of violations) console.error(`[radar-perf]   budget: ${violation}`);
    return {
      ...result,
      budget: scenario.budget,
      soak: soakMode ? {
        before: soakBefore,
        after: soakAfter,
        growth: {
          jsHeapUsedBytes: numericGrowth(soakBefore?.browser.jsHeapUsedBytes, soakAfter?.browser.jsHeapUsedBytes),
          nodes: numericGrowth(soakBefore?.browser.nodes, soakAfter?.browser.nodes),
          documents: numericGrowth(soakBefore?.browser.documents, soakAfter?.browser.documents),
          jsEventListeners: numericGrowth(soakBefore?.browser.jsEventListeners, soakAfter?.browser.jsEventListeners),
          serverRssBytes: numericGrowth(soakBefore?.serverRssBytes, soakAfter?.serverRssBytes),
        },
      } : null,
      violations,
    };
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
    "| Aircraft | HTML markers | WebGL aircraft | Mounted rows | Animation avg/p95/max | Frame p95 | Writes/s | HTML collision avg/p95/max | Long tasks | Heap | DOM nodes | Status |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |",
  ];
  for (const result of report.scenarios) {
    lines.push(
      `| ${result.aircraft} | ${result.dom.aircraftMarkers} | ${result.webgl.aircraft} | ${result.dom.mountedTrafficRows} | ${result.animation.averageMs} / ${result.animation.p95Ms} / ${result.animation.maxMs} ms | ${result.animation.frameIntervalP95Ms} ms | ${result.animation.markerWritesPerSecond} | ${result.labelCollision.averageMs} / ${result.labelCollision.p95Ms} / ${result.labelCollision.maxMs} ms | ${result.longTasks.count} | ${result.footprint?.browser?.jsHeapUsedBytes == null ? "n/a" : `${rounded(result.footprint.browser.jsHeapUsedBytes / 1024 / 1024)} MiB`} | ${result.footprint?.browser?.nodes ?? "n/a"} | ${result.violations.length ? "FAIL" : "PASS"} |`,
    );
    for (const violation of result.violations) lines.push(`|  |  |  |  |  |  |  |  |  |  |  | \`${violation}\` |`);
  }
  lines.push(
    "",
    "Deterministic budgets:",
    "- Bulk synthetic aircraft must render through WebGL with zero HTML aircraft markers/handles.",
    "- Traffic-list total rows must equal the scenario count and virtualization must stay enabled.",
    "- Mounted traffic rows must stay at or below the checked-in structural budget.",
    "- Animation and collision diagnostics must record live work; active jobs may not exceed aircraft count.",
    "",
  );

  if (report.environment.soakMode) {
    lines.push(
      "## Soak footprint",
      "",
      "| Aircraft | Heap growth | DOM nodes | Event listeners | Server RSS growth |",
      "| ---: | ---: | ---: | ---: | ---: |",
    );
    for (const result of report.scenarios) {
      const growth = result.soak?.growth;
      const mib = (value) => value === null || value === undefined ? "n/a" : `${rounded(value / 1024 / 1024)} MiB`;
      const count = (value) => value === null || value === undefined ? "n/a" : String(rounded(value));
      lines.push(`| ${result.aircraft} | ${mib(growth?.jsHeapUsedBytes)} | ${count(growth?.nodes)} | ${count(growth?.jsEventListeners)} | ${mib(growth?.serverRssBytes)} |`);
    }
    if (report.sseReconnects) {
      lines.push(
        "",
        "## SSE reconnect churn",
        "",
        `- Rounds: ${report.sseReconnects.rounds}`,
        `- Clients per round: ${report.sseReconnects.clientsPerRound}`,
        `- Peak active clients: ${report.sseReconnects.peakClients}`,
        `- Final active clients: ${report.sseReconnects.finalActiveClients}`,
        `- Status: ${report.sseReconnects.violations.length ? "FAIL" : "PASS"}`,
        "",
      );
      for (const violation of report.sseReconnects.violations) lines.push(`- \`${violation}\``);
      lines.push("");
    }
  }
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
      WATCHLIST_ADMIN_TOKEN: soakMode ? soakAdminToken : "",
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
    const sseReconnects = soakMode ? await exerciseSseReconnects() : null;
    const results = [];
    for (const scenario of scenarios) results.push(await measureScenario(browser, scenario, child.pid));
    const failed = results.filter((result) => result.violations.length > 0);
    if (sseReconnects?.violations.length) failed.push({ aircraft: 0, violations: sseReconnects.violations });
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
        changedAircraftPerDelta: "all",
        soakMode,
      },
      sseReconnects,
      scenarios: results,
      passed: failed.length === 0,
    };
    mkdirSync("artifacts", { recursive: true });
    const reportStem = soakMode ? "radar-performance-soak" : "radar-performance-baseline";
    writeFileSync(`artifacts/${reportStem}.json`, JSON.stringify(report, null, 2) + "\n");
    writeFileSync(`artifacts/${reportStem}.md`, markdownReport(report) + "\n");
    console.log(`[radar-perf] report=artifacts/${reportStem}.json`);
    console.log(`[radar-perf] summary=artifacts/${reportStem}.md`);
    if (failed.length) {
      throw new Error(`Radar performance ${soakMode ? "soak" : "baseline"} failed with ${failed.length} failing check group(s)`);
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
