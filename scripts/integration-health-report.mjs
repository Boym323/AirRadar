import { fileURLToPath } from "node:url";
import { appendFileSync } from "node:fs";

/**
 * Reports only bounded aggregate counters already collected in the application.
 * No outbound requests to ADSB.lol and no additional database queries.
 */
export function summarizeIntegrationHealth(data) {
  const p = data?.routeProviders?.routeset;
  const db = data?.databaseLatency;
  if (!p || typeof p !== "object") throw new Error("missing route provider diagnostics");
  const requests = Number.isSafeInteger(p.requests) && p.requests >= 0 ? p.requests : 0;
  const success = Number.isSafeInteger(p.success) && p.success >= 0 ? p.success : 0;
  const failed = Number.isSafeInteger(p.failed) && p.failed >= 0 ? p.failed : 0;
  const lastFailure = Date.parse(p.lastFailureAt ?? "");
  const lastSuccess = Date.parse(p.lastSuccessAt ?? "");
  const blockedUntil = Date.parse(p.blockedUntilAt ?? "");
  let status;
  if (!p.enabled) status = "DISABLED";
  else if (Number.isFinite(blockedUntil) && blockedUntil > Date.now()) status = "BLOCKED";
  else if (!requests) status = "INSUFFICIENT_DATA";
  else if (!success && failed > 0) status = "DEGRADED";
  else if (Number.isFinite(lastFailure) && (!Number.isFinite(lastSuccess) || lastFailure > lastSuccess))
    status = "INTERMITTENT";
  else status = "OK";
  const allowedReasonNames = ["http", "timeout", "network", "invalid_response", "other"];
  const reasons = Object.fromEntries(allowedReasonNames.map((kind) => [
    kind, Number.isSafeInteger(p.reasons?.[kind]) && p.reasons[kind] >= 0 ? p.reasons[kind] : 0,
  ]));
  const http = Number.isInteger(p.lastHttpStatus) && p.lastHttpStatus >= 100 && p.lastHttpStatus <= 599
    ? p.lastHttpStatus : null;
  const window = (value) => {
    if (!value || typeof value !== "object") return null;
    return {
      status: ["measured", "insufficient_data", "disabled"].includes(value.status) ? value.status : "insufficient_data",
      sampleCount: Number.isSafeInteger(value.sampleCount) ? value.sampleCount : 0,
      failedSampleCount: Number.isSafeInteger(value.failedSampleCount) ? value.failedSampleCount : 0,
      p50Ms: Number.isFinite(value.p50Ms) ? value.p50Ms : null,
      p95Ms: Number.isFinite(value.p95Ms) ? value.p95Ms : null,
      p99Ms: Number.isFinite(value.p99Ms) ? value.p99Ms : null,
    };
  };
  return {
    status,
    routeset: { enabled: !!p.enabled, requests, success, failed, lastHttpStatus: http,
      lastFailureAt: typeof p.lastFailureAt === "string" ? p.lastFailureAt : null,
      lastSuccessAt: typeof p.lastSuccessAt === "string" ? p.lastSuccessAt : null,
      blockedUntilAt: Number.isFinite(blockedUntil) && blockedUntil > Date.now()
        ? new Date(blockedUntil).toISOString() : null,
      skippedBlocked: Number.isSafeInteger(p.skippedBlocked) && p.skippedBlocked >= 0 ? p.skippedBlocked : 0,
      reasons },
    routeCache: {
      dbError24h: Number.isSafeInteger(data.route?.dbError) ? data.route.dbError : null,
      dbBypassed24h: Number.isSafeInteger(data.route?.dbBypassed) ? data.route.dbBypassed : null,
      reasonCountersSinceStart: Object.fromEntries([
        "timeouts", "queryFailures", "connectionFailures",
        "bypassBackoff", "bypassConcurrency", "bypassUnconfigured",
      ].map((name) => [name, Number.isSafeInteger(data.routeProviders?.postgres?.[name])
        && data.routeProviders.postgres[name] >= 0 ? data.routeProviders.postgres[name] : 0])),
      lastErrorKind: ["timeout", "query", "connection"].includes(data.routeProviders?.postgres?.lastErrorKind)
        ? data.routeProviders.postgres.lastErrorKind : null,
      sqlLatencyLastHour: window(data.routeCacheLatency),
    },
    runtimeDbLatency: db ? { lastHour: window(db.lastHour), last24Hours: window(db.last24Hours) } : null,
  };
}

async function main() {
  const url = process.env.AIRRADAR_INTEGRATION_DIAGNOSTICS_URL
    ?? "https://airradar.pomykal.cz/api/system/integrations";
  const response = await fetch(url, {
    headers: { Accept: "application/json" }, cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 401) {
    console.log("[integration-health] UNVERIFIED: diagnostics requires admin session; no token attempted");
    return;
  }
  if (!response.ok) throw new Error(`diagnostics endpoint returned HTTP ${response.status}`);
  const summary = summarizeIntegrationHealth(await response.json());
  const safe = JSON.stringify(summary);
  console.log("[integration-health] " + safe);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## AirRadar route health (observational)\n\n` +
      `Status: **${summary.status}**; requests: ${summary.routeset.requests}, success: ${summary.routeset.success}, failed: ${summary.routeset.failed}, last HTTP: ${summary.routeset.lastHttpStatus ?? "n/a"}.\n\n` +
      `Reason counters: ${JSON.stringify(summary.routeset.reasons)}.\n\n` +
      `Route cache diagnostics: ${JSON.stringify(summary.routeCache)}.\n\n` +
      `DB health query P50/P95/P99: ${JSON.stringify(summary.runtimeDbLatency)}.\n\n` +
      `No ADSB.lol traffic/route API calls were made. Counters are process-local except where otherwise noted.\n`);
  }
  if (summary.status === "DEGRADED" || summary.status === "BLOCKED") {
    console.warn("[integration-health] ADSB.lol routeset is currently failing; radar and local cache may still work");
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error("[integration-health] " + String(error)); process.exitCode = 1; });
}
