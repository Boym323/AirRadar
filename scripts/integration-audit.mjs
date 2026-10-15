import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const DEFAULT_BASE_URL = "https://airradar.pomykal.cz";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;
const PROVIDERS = [
  ["readsb", "Local readsb JSON / Beast receiver"],
  ["adsbhub", "ADSBHub SBS/30003 network coverage"],
  ["adsblol-live", "ADSB.lol live coverage"],
  ["adsblol-routeset", "ADSB.lol routeset"],
  ["ogn-aprs", "OGN APRS-IS"],
  ["ogn-ddb", "OGN DDB"],
  ["ogn-softrf", "SoftRF DDB snapshot"],
  ["adsbdb", "ADSBDB metadata and routes"],
  ["rxw-fpn", "RXW Hub / FPN"],
  ["aviation-weather", "Aviation Weather METAR / TAF / SIGMET / PIREP"],
  ["airport-metadata", "Airport and aircraft reference data"],
  ["atc-datasets", "ATC sectors, routes and points"],
];

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegative(value) {
  const number = finite(value);
  return number !== null && number >= 0 ? number : null;
}

function safeTimestamp(value) {
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function safeText(value, max = 80) {
  return typeof value === "string" && value.length <= max && /^[A-Za-z0-9._:/+() -]+$/.test(value) ? value : null;
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function readPackageVersion(root) {
  try {
    const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    return safeText(packageJson.version, 32) ?? "unknown";
  } catch {
    return "unknown";
  }
}

function gitCommit(root) {
  try {
    return safeText(execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), 64) ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function readResponse(response) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchJson(baseUrl, path, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const status = response.status;
  if (status === 401 || status === 403) return { status, value: null };
  const body = await readResponse(response);
  if (!response.ok) return { status, value: null };
  try {
    return { status, value: JSON.parse(body) };
  } catch {
    return { status, value: null };
  }
}

function providerChecks({ health, integrations, runtime, mode }) {
  const checks = [];
  const healthSource = health?.source;
  const readsbHealthy = healthSource?.status === "ok" || health?.readsb?.status === "ok";
  checks.push({
    id: "readsb",
    area: "provider",
    status: readsbHealthy ? "VERIFIED HEALTHY" : mode === "offline" ? "NOT VERIFIED" : "DEGRADED",
    evidence: readsbHealthy ? "Read-only health endpoint reports a live local source." : "No live local-source health evidence was available.",
  });

  const routeset = integrations?.routeProviders?.routeset;
  const routeStatus = summarizeRouteStatus(routeset);
  checks.push({
    id: "adsblol-routeset",
    area: "provider",
    status: routeStatus.status,
    evidence: routeStatus.evidence,
    metrics: routeStatus.metrics,
  });

  const db = integrations?.routeProviders?.postgres;
  const routeDbErrorCount = safeInteger(integrations?.route?.dbError) ?? 0;
  const routeDbBypassCount = safeInteger(integrations?.route?.dbBypassed) ?? 0;
  const routeDbConcurrencyBypasses = safeInteger(db?.bypassConcurrency) ?? 0;
  const routeDbStatus = !db || typeof db !== "object" ? "NOT VERIFIED"
    : routeDbErrorCount > 0 || routeDbConcurrencyBypasses > 0 ? "DEGRADED"
      : routeDbBypassCount > 0 ? "NOT VERIFIED" : "NOT VERIFIED";
  checks.push({
    id: "route-cache",
    area: "database/cache",
    status: routeDbStatus,
    evidence: !db ? "Route-cache diagnostics were not available."
      : routeDbConcurrencyBypasses > 0 ? `Route-cache diagnostics show ${routeDbConcurrencyBypasses} concurrency bypasses; this is an application-side admission signal, not SQL execution time.`
        : routeDbErrorCount > 0 ? "Route-cache diagnostics show database errors in the observed process window."
          : "Route-cache counters did not provide enough successful foreground samples to claim healthy database latency.",
    metrics: db ? {
      bypassBackoff: safeInteger(db.bypassBackoff),
      bypassConcurrency: safeInteger(db.bypassConcurrency),
      timeouts: safeInteger(db.timeouts),
      queryFailures: safeInteger(db.queryFailures),
      connectionFailures: safeInteger(db.connectionFailures),
    } : undefined,
  });

  checks.push({
    id: "database",
    area: "database",
    status: health?.database?.status === "ok" ? "VERIFIED HEALTHY" : mode === "offline" ? "NOT VERIFIED" : "DEGRADED",
    evidence: health?.database?.status === "ok" ? "Health endpoint reports the database as reachable." : "Database health was not verified by the read-only endpoint.",
  });

  for (const [id, name] of PROVIDERS) {
    if (checks.some((check) => check.id === id)) continue;
    checks.push({ id, area: "provider", status: "NOT VERIFIED", evidence: `${name} was inventoried from repository boundaries; no active probe was run.` });
  }

  checks.push({ id: "sse-browser", area: "sse/browser", status: "NOT VERIFIED", evidence: "No production fan-out or browser load test was run." });
  checks.push({ id: "atc-resolution", area: "atc", status: "NOT VERIFIED", evidence: "Production activation and geometry canary were intentionally not changed or run." });
  const runtimeWindowMaxMs = Array.isArray(runtime?.runtime?.eventLoopLagWindows)
    ? Math.max(...runtime.runtime.eventLoopLagWindows.map((window) => nonNegative(window?.maxMs) ?? 0)) : null;
  checks.push({
    id: "event-loop",
    area: "runtime",
    status: runtimeWindowMaxMs !== null && runtimeWindowMaxMs >= 1_000 ? "DEGRADED" : runtime?.runtime?.status === "enabled" ? "VERIFIED HEALTHY" : "NOT VERIFIED",
    evidence: runtimeWindowMaxMs !== null && runtimeWindowMaxMs >= 1_000
      ? `A bounded runtime window recorded a ${Math.round(runtimeWindowMaxMs)} ms event-loop maximum; causality is not established by this sample.`
      : runtime?.runtime?.status === "enabled" ? "Runtime event-loop diagnostics are enabled; no >1s maximum was present in the returned window." : "Runtime event-loop diagnostics were not available.",
    metrics: runtime ? {
      p50Ms: nonNegative(runtime.runtime?.eventLoopLagP50Ms),
      p95Ms: nonNegative(runtime.runtime?.eventLoopLagP95Ms),
      p99Ms: nonNegative(runtime.runtime?.eventLoopLagP99Ms),
      maxWindowMs: runtimeWindowMaxMs,
    } : undefined,
  });
  checks.push({ id: "memory-retention", area: "runtime", status: "NOT VERIFIED", evidence: "No heap snapshot was collected; retention requires a bounded soak or isolated profile." });
  return checks;
}

function summarizeRouteStatus(routeset) {
  if (!routeset || typeof routeset !== "object") return { status: "NOT VERIFIED", evidence: "Routeset counters were not available." };
  const metrics = {
    enabled: routeset.enabled === true,
    requests: safeInteger(routeset.requests),
    success: safeInteger(routeset.success),
    failed: safeInteger(routeset.failed),
    skippedBlocked: safeInteger(routeset.skippedBlocked),
    lastHttpStatus: safeInteger(routeset.lastHttpStatus),
    blockedUntilAt: safeTimestamp(routeset.blockedUntilAt),
  };
  const blockedUntil = Date.parse(metrics.blockedUntilAt ?? "");
  if (!metrics.enabled) return { status: "DISABLED", evidence: "Routeset is disabled by configuration.", metrics };
  if (Number.isFinite(blockedUntil) && blockedUntil > Date.now()) return { status: "BLOCKED", evidence: "Provider refusal cooldown is active; no new probe was attempted.", metrics };
  if (!metrics.requests) return { status: "NOT VERIFIED", evidence: "Routeset is enabled but has no observed request in the current process window.", metrics };
  if (metrics.failed && !metrics.success) return { status: "DEGRADED", evidence: "Observed routeset requests failed without a successful request in the process window.", metrics };
  return { status: "VERIFIED HEALTHY", evidence: "Observed routeset counters include successful requests and no active refusal cooldown.", metrics };
}

function projectHealth(value) {
  if (!value || typeof value !== "object") return null;
  return {
    status: safeText(value.status, 20),
    application: value.application && {
      version: safeText(value.application.version, 32),
      commit: safeText(value.application.commit, 64),
      channel: safeText(value.application.channel, 32),
    },
    database: value.database && { status: safeText(value.database.status, 20) },
    source: value.source && {
      status: safeText(value.source.status, 20),
      provider: safeText(value.source.provider, 64),
      lastUpdate: safeTimestamp(value.source.lastUpdate),
    },
    aircraftCount: safeInteger(value.aircraftCount),
    checkedAt: safeTimestamp(value.checkedAt),
  };
}

function projectRuntime(value) {
  if (!value || typeof value !== "object") return null;
  const runtime = value.runtime;
  if (!runtime || typeof runtime !== "object") return null;
  const windows = Array.isArray(runtime.eventLoopLagWindows) ? runtime.eventLoopLagWindows : [];
  return {
    status: safeText(runtime.status, 32),
    eventLoop: {
      p50Ms: nonNegative(runtime.eventLoopLagP50Ms),
      p95Ms: nonNegative(runtime.eventLoopLagP95Ms),
      p99Ms: nonNegative(runtime.eventLoopLagP99Ms),
      maxWindowMs: windows.length ? Math.max(...windows.map((window) => nonNegative(window?.maxMs) ?? 0)) : null,
      windowCount: safeInteger(windows.length),
    },
    memory: {
      rssBytes: nonNegative(runtime.rssBytes),
      heapUsedBytes: nonNegative(runtime.heapUsedBytes),
      heapTotalBytes: nonNegative(runtime.heapTotalBytes),
      gcCount: safeInteger(runtime.gcCount),
      majorGcCount: safeInteger(runtime.majorGcCount),
      gcTotalPauseMs: nonNegative(runtime.gcTotalPauseMs),
      gcMaxPauseMs: nonNegative(runtime.gcMaxPauseMs),
    },
  };
}

function projectIntegrations(value) {
  if (!value || typeof value !== "object") return null;
  return {
    routeProviders: value.routeProviders && {
      routeset: projectRouteset(value.routeProviders.routeset),
      postgres: projectPostgres(value.routeProviders.postgres),
    },
    route: value.route && {
      dbError: safeInteger(value.route.dbError),
      dbBypassed: safeInteger(value.route.dbBypassed),
    },
    databaseLatency: value.databaseLatency && {
      lastHour: projectWindow(value.databaseLatency.lastHour),
      last24Hours: projectWindow(value.databaseLatency.last24Hours),
    },
    routeCacheLatency: projectWindow(value.routeCacheLatency),
  };
}

function projectRouteset(value) {
  if (!value || typeof value !== "object") return null;
  return {
    enabled: value.enabled === true,
    requests: safeInteger(value.requests),
    success: safeInteger(value.success),
    failed: safeInteger(value.failed),
    skippedBlocked: safeInteger(value.skippedBlocked),
    lastHttpStatus: safeInteger(value.lastHttpStatus),
    blockedUntilAt: safeTimestamp(value.blockedUntilAt),
    reasons: Object.fromEntries(["http", "timeout", "network", "invalid_response", "other"].map((key) => [key, safeInteger(value.reasons?.[key]) ?? 0])),
  };
}

function projectPostgres(value) {
  if (!value || typeof value !== "object") return null;
  return {
    timeouts: safeInteger(value.timeouts),
    queryFailures: safeInteger(value.queryFailures),
    connectionFailures: safeInteger(value.connectionFailures),
    bypassBackoff: safeInteger(value.bypassBackoff),
    bypassConcurrency: safeInteger(value.bypassConcurrency),
    bypassUnconfigured: safeInteger(value.bypassUnconfigured),
    lastErrorKind: ["timeout", "query", "connection"].includes(value.lastErrorKind) ? value.lastErrorKind : null,
  };
}

function projectWindow(value) {
  if (!value || typeof value !== "object") return null;
  return {
    status: safeText(value.status, 32),
    sampleCount: safeInteger(value.sampleCount),
    failedSampleCount: safeInteger(value.failedSampleCount),
    p50Ms: nonNegative(value.p50Ms),
    p95Ms: nonNegative(value.p95Ms),
    p99Ms: nonNegative(value.p99Ms),
  };
}

function compare(previous, current) {
  if (!previous || typeof previous !== "object") return { status: "NO_BASELINE" };
  const previousCounts = previous.summary?.statusCounts ?? {};
  const currentCounts = current.summary.statusCounts;
  return {
    status: "COMPARED",
    previousGeneratedAt: safeTimestamp(previous.generatedAt),
    statusCountDelta: Object.fromEntries([...new Set([...Object.keys(previousCounts), ...Object.keys(currentCounts)])].map((key) => [key, (currentCounts[key] ?? 0) - (previousCounts[key] ?? 0)])),
  };
}

function projectVersion(value) {
  if (!value || typeof value !== "object") return null;
  return {
    version: safeText(value.version, 32),
    commit: safeText(value.commit, 64),
    channel: safeText(value.channel, 32),
    buildTime: safeTimestamp(value.buildTime),
  };
}

function buildReport({ root, mode, health, integrations, runtime, version, previous }) {
  const checks = providerChecks({ health, integrations, runtime, mode });
  const statusCounts = Object.fromEntries([...new Set(checks.map((check) => check.status))].map((status) => [status, checks.filter((check) => check.status === status).length]));
  const degraded = checks.some((check) => ["DEGRADED", "BLOCKED"].includes(check.status));
  const verdict = degraded ? "DEGRADED" : checks.some((check) => check.status === "NOT VERIFIED") ? "PASS_WITH_LIMITATIONS" : "PASS";
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode,
    commit: gitCommit(root),
    applicationVersion: projectVersion(version)?.version ?? readPackageVersion(root),
    verdict,
    checks,
    summary: { statusCounts },
    observed: { deployed: projectVersion(version), health: projectHealth(health), integrations: projectIntegrations(integrations), runtime: projectRuntime(runtime) },
    comparison: compare(previous, { summary: { statusCounts }, generatedAt: new Date().toISOString() }),
    safety: {
      activeProviderRequests: false,
      databaseWrites: false,
      productionMutations: false,
      rawAircraftPositions: false,
      secrets: false,
    },
  };
}

export function renderMarkdown(report) {
  const rows = report.checks.map((check) => `| ${check.area} | ${check.id} | ${check.status} | ${check.evidence} |`).join("\n");
  return [
    "# AirRadar integration audit",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Mode: ${report.mode}`,
    `- Commit: ${report.commit}`,
    `- Application version: ${report.applicationVersion}`,
    `- Verdict: **${report.verdict}**`,
    "",
    "This report is bounded and sanitized. It performs only GET diagnostics in read-only mode; it never sends provider probes, writes PostgreSQL, publishes raw aircraft data, or records secrets.",
    "",
    "| Area | Check | Status | Evidence |",
    "| --- | --- | --- | --- |",
    rows,
    "",
    "## Safety flags",
    "",
    ...Object.entries(report.safety).map(([key, value]) => `- ${key}: ${value ? "yes" : "no"}`),
    "",
  ].join("\n");
}

async function loadFixture(path) {
  if (!path) return { health: null, integrations: null, runtime: null, version: null };
  const value = JSON.parse(readFileSync(path, "utf8"));
  return { health: value.health ?? null, integrations: value.integrations ?? null, runtime: value.runtime ?? null, version: value.version ?? null };
}

export async function runAudit({ root = process.cwd(), mode = "readonly", baseUrl = DEFAULT_BASE_URL, fixturePath = null, previousPath = null } = {}) {
  if (!["readonly", "offline", "ci"].includes(mode)) throw new Error("invalid_audit_mode");
  let health = null;
  let integrations = null;
  let runtime = null;
  let version = null;
  if (mode === "offline" || mode === "ci") {
    ({ health, integrations, runtime, version } = await loadFixture(fixturePath));
  } else {
    const results = await Promise.all([
      fetchJson(baseUrl, "/api/health"),
      fetchJson(baseUrl, "/api/system/integrations"),
      fetchJson(baseUrl, "/api/system/runtime-performance"),
      fetchJson(baseUrl, "/api/version"),
    ]);
    health = results[0].value;
    integrations = results[1].value;
    runtime = results[2].value;
    version = results[3].value;
  }
  let previous = null;
  if (previousPath && existsSync(previousPath)) previous = JSON.parse(readFileSync(previousPath, "utf8"));
  return buildReport({ root, mode, health, integrations, runtime, version, previous });
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback = null) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] ?? fallback : fallback;
  };
  const mode = option("--mode", process.env.AIRRADAR_INTEGRATION_AUDIT_MODE ?? "readonly");
  const jsonPath = option("--json");
  const markdownPath = option("--markdown");
  const report = await runAudit({ root: process.cwd(), mode, baseUrl: option("--base-url", process.env.AIRRADAR_INTEGRATION_DIAGNOSTICS_BASE_URL ?? DEFAULT_BASE_URL), fixturePath: option("--fixture", process.env.AIRRADAR_INTEGRATION_AUDIT_FIXTURE), previousPath: option("--previous") });
  const markdown = renderMarkdown(report);
  if (jsonPath) {
    await mkdir(dirname(resolve(jsonPath)), { recursive: true });
    writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  }
  if (markdownPath) {
    await mkdir(dirname(resolve(markdownPath)), { recursive: true });
    writeFileSync(markdownPath, markdown, { mode: 0o600 });
  }
  process.stdout.write(JSON.stringify(report) + "\n");
  if (report.verdict === "DEGRADED") process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => {
    process.stderr.write("Integration audit unavailable; no diagnostic details were emitted.\n");
    process.exitCode = 1;
  });
}
