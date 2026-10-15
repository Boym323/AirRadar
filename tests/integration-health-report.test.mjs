import { describe, expect, it } from "vitest";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  INTEGRATION_HEALTH_STEP_SUMMARY,
  summarizeIntegrationHealth,
  writeIntegrationHealthStepSummary,
} from "../scripts/integration-health-report.mjs";

const fixture = (overrides = {}) => ({
  routeProviders: { postgres: { timeouts: 9, queryFailures: 2, connectionFailures: 1, bypassBackoff: 12, bypassConcurrency: 3, bypassUnconfigured: 0, lastErrorKind: "timeout" }, routeset: {
    enabled: true, requests: 4, success: 0, failed: 4,
    lastHttpStatus: 429, lastFailureAt: "2026-10-11T12:00:00.000Z",
    lastSuccessAt: null, reasons: { http: 4, timeout: 0, network: 0, invalid_response: 0, other: 0 },
    ...overrides,
  } },
  route: { dbError: 4, dbBypassed: 2 },
  routeCacheLatency: { sampleCount: 26, p50Ms: 12, p95Ms: 310, p99Ms: 700 },
  routeProvidersExtra: null,
  databaseLatency: { lastHour: { status: "measured", sampleCount: 3, failedSampleCount: 1, p50Ms: 4, p95Ms: 10, p99Ms: 10 } },
  callsign: "SENSITIVE-CALLSIGN", token: "secret-token",
});
describe("publicly logged aggregate route health (no upstream probes)", () => {
  it("classifies degraded provider without leaking arbitrary payload fields", () => {
    const result = summarizeIntegrationHealth(fixture());
    expect(result).toMatchObject({ status: "DEGRADED", routeset: { failed: 4, lastHttpStatus: 429, reasons: { http: 4 } }, runtimeDbLatency: { lastHour: { p99Ms: 10 } } });
    expect(result.routeCache).toMatchObject({ lastErrorKind: "timeout", reasonCountersSinceStart: { timeouts: 9, queryFailures: 2, connectionFailures: 1 }, sqlLatencyLastHour: { p95Ms: 310, sampleCount: 26 } });
    expect(JSON.stringify(result)).not.toContain("SENSITIVE-CALLSIGN");
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
  it("normalizes remote provider dates and excludes arbitrary response text", () => {
    const report = summarizeIntegrationHealth(fixture({
      lastFailureAt: "SENSITIVE\n# injected header",
      lastSuccessAt: "2026-10-11T12:02:00.000Z",
      blockedUntilAt: "not-a-date",
    }));
    expect(report.routeset.lastFailureAt).toBeNull();
    expect(report.routeset.lastSuccessAt).toBe("2026-10-11T12:02:00.000Z");
    expect(report.routeset.blockedUntilAt).toBeNull();
    expect(JSON.stringify(report)).not.toContain("SENSITIVE");
    expect(JSON.stringify(report)).not.toContain("injected header");
  });

  it("does not label disabled or unmeasured providers as healthy", () => {
    expect(summarizeIntegrationHealth(fixture({ enabled: false })).status).toBe("DISABLED");
    expect(summarizeIntegrationHealth(fixture({
      blockedUntilAt: new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
      skippedBlocked: 120,
    }))).toMatchObject({ status: "BLOCKED", routeset: { skippedBlocked: 120 } });
    expect(summarizeIntegrationHealth(fixture({ requests: 0, failed: 0 })).status).toBe("INSUFFICIENT_DATA");
    expect(summarizeIntegrationHealth(fixture({ success: 3, lastSuccessAt: "2026-10-11T12:02:00.000Z" })).status).toBe("OK");
    expect(summarizeIntegrationHealth(fixture({ success: 3, lastSuccessAt: "2026-10-11T11:59:00.000Z" })).status).toBe("INTERMITTENT");
  });
});

describe("CodeQL #50: HTTP diagnostics never flow to GitHub summary file", () => {
  it("writes only a fixed summary while keeping allowlisted metrics available in logs", () => {
    const poison = "NETWORK-PAYLOAD\n# forged Markdown heading [unsafe](javascript:alert(1))";
    const payload = fixture({
      lastFailureAt: poison,
      reasons: { http: 123456, timeout: 987654 },
      requests: 654321,
      failed: 123456,
    });
    payload.token = poison;
    payload.routeCacheLatency = { sampleCount: 765432, p99Ms: 98765 };

    const projected = summarizeIntegrationHealth(payload);
    expect(projected.routeset.reasons.http).toBe(123456);
    expect(JSON.stringify(projected)).not.toContain(poison);

    const directory = mkdtempSync(join(tmpdir(), "airradar-integration-summary-"));
    const summaryPath = join(directory, "step-summary.md");
    try {
      // The runner creates this file before running the step.
      appendFileSync(summaryPath, "");
      writeIntegrationHealthStepSummary(summaryPath);
      const stored = readFileSync(summaryPath, "utf8");
      expect(stored).toBe(INTEGRATION_HEALTH_STEP_SUMMARY);
      expect(stored).toContain("## AirRadar route health (observational)\n\n");
      expect(stored).toContain("step logs");
      expect(stored).not.toContain(poison);
      expect(stored).not.toContain("654321");
      expect(stored).not.toContain("123456");
      expect(stored).not.toContain("98765");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
