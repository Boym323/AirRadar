import { describe, expect, it } from "vitest";
import { renderMarkdown, runAudit } from "../scripts/integration-audit.mjs";

const fixture = {
  health: {
    status: "ok",
    checkedAt: "2026-10-15T15:01:08.019Z",
    application: { version: "1.0.462", commit: "e8282c48", channel: "production" },
    database: { status: "ok" },
    source: { status: "ok", provider: "local-beast+json-failover", lastUpdate: "2026-10-15T15:01:05.130Z" },
    aircraftCount: 71,
    rawAircraft: [{ icaoHex: "SECRET-ICAO", lat: 50, lon: 14 }],
  },
  integrations: {
    route: { dbError: 0, dbBypassed: 2076 },
    routeProviders: {
      routeset: {
        enabled: true, requests: 0, success: 0, failed: 0, skippedBlocked: 104,
        blockedUntilAt: "2099-10-15T20:37:09.101Z", lastHttpStatus: 403,
        secret: "SECRET-ROUTE-PAYLOAD",
      },
      postgres: { bypassConcurrency: 108, timeouts: 0, queryFailures: 0, connectionFailures: 0 },
    },
    databaseLatency: { lastHour: { status: "measured", sampleCount: 26, p95Ms: 1000, p99Ms: 4994 } },
  },
  runtime: {
    runtime: {
      status: "enabled",
      eventLoopLagP50Ms: 20,
      eventLoopLagP95Ms: 22,
      eventLoopLagP99Ms: 85,
      eventLoopLagWindows: [{ maxMs: 4152.361 }],
      rssBytes: 1579180032,
      heapUsedBytes: 537507384,
      heapTotalBytes: 882606080,
      gcCount: 5339,
      majorGcCount: 22,
      gcTotalPauseMs: 16183,
      gcMaxPauseMs: 9,
    },
  },
};

describe("integration audit", () => {
  it("runs offline without provider or database access and classifies observed risk", async () => {
    const report = await runAudit({ root: process.cwd(), mode: "offline", fixturePath: null });
    expect(report.mode).toBe("offline");
    expect(report.verdict).toBe("PASS_WITH_LIMITATIONS");
    expect(report.safety).toMatchObject({ activeProviderRequests: false, databaseWrites: false, rawAircraftPositions: false, secrets: false });
  });

  it("redacts raw payloads and treats route-cache contention and refusal cooldown as non-healthy", async () => {
    const path = "/tmp/airradar-integration-audit-fixture.json";
    const { writeFileSync, unlinkSync } = await import("node:fs");
    writeFileSync(path, JSON.stringify(fixture));
    try {
      const report = await runAudit({ root: process.cwd(), mode: "offline", fixturePath: path });
      expect(report.checks.find((check) => check.id === "adsblol-routeset")).toMatchObject({ status: "BLOCKED" });
      expect(report.checks.find((check) => check.id === "route-cache")).toMatchObject({ status: "DEGRADED" });
      expect(report.checks.find((check) => check.id === "event-loop")).toMatchObject({ status: "DEGRADED" });
      expect(JSON.stringify(report)).not.toContain("SECRET-ICAO");
      expect(JSON.stringify(report)).not.toContain("SECRET-ROUTE-PAYLOAD");
      expect(renderMarkdown(report)).not.toContain("SECRET-ICAO");
      const previousPath = `${path}.previous`;
      writeFileSync(previousPath, JSON.stringify({ generatedAt: "2026-10-15T14:00:00.000Z", summary: { statusCounts: { "NOT VERIFIED": 1 } } }));
      const compared = await runAudit({ root: process.cwd(), mode: "offline", fixturePath: path, previousPath });
      expect(compared.comparison.status).toBe("COMPARED");
      unlinkSync(previousPath);
    } finally {
      unlinkSync(path);
    }
  });
});
