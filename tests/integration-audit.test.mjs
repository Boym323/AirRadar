import { afterEach, describe, expect, it } from "vitest";
import { closeSync, constants, fstatSync, mkdtempSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { auditExitCode, renderMarkdown, runAudit, writeAuditOutputs } from "../scripts/integration-audit.mjs";

const tempDirectories = [];
function privateTempDir() {
  const directory = mkdtempSync(join(tmpdir(), "airradar-audit-"));
  tempDirectories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Verify the bytes and mode of the same opened inode (no stat(path)/read(path) race).
function readPrivateOutput(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    expect(fstatSync(fd).mode & 0o777).toBe(0o600);
    return readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
}

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
    const path = join(privateTempDir(), "fixture.json");
    writeFileSync(path, JSON.stringify(fixture), { flag: "wx", mode: 0o600 });
    const report = await runAudit({ root: process.cwd(), mode: "offline", fixturePath: path });
      expect(report.checks.find((check) => check.id === "adsblol-routeset")).toMatchObject({ status: "BLOCKED" });
      expect(report.checks.find((check) => check.id === "route-cache")).toMatchObject({ status: "DEGRADED" });
      expect(report.checks.find((check) => check.id === "event-loop")).toMatchObject({ status: "DEGRADED" });
      expect(JSON.stringify(report)).not.toContain("SECRET-ICAO");
      expect(JSON.stringify(report)).not.toContain("SECRET-ROUTE-PAYLOAD");
      expect(renderMarkdown(report)).not.toContain("SECRET-ICAO");
      const previousPath = `${path}.previous`;
      writeFileSync(previousPath, JSON.stringify({ generatedAt: "2026-10-15T14:00:00.000Z", summary: { statusCounts: { "NOT VERIFIED": 1 } } }), { flag: "wx", mode: 0o600 });
      const compared = await runAudit({ root: process.cwd(), mode: "offline", fixturePath: path, previousPath });
      expect(compared.comparison.status).toBe("COMPARED");
  });

  it("creates bounded JSON and Markdown reports privately without overwriting existing files", async () => {
    const dir = privateTempDir();
    const jsonPath = join(dir, "report.json");
    const markdownPath = join(dir, "report.md");
    const report = await runAudit({ mode: "offline" });
    const markdown = renderMarkdown(report);
    await writeAuditOutputs({ report, markdown, jsonPath, markdownPath });
    expect(JSON.parse(readPrivateOutput(jsonPath)).verdict).toBe("PASS_WITH_LIMITATIONS");
    expect(readPrivateOutput(markdownPath)).toBe(markdown);
    await expect(writeAuditOutputs({ report, markdown: "replacement", jsonPath, markdownPath }))
      .rejects.toMatchObject({ code: "EEXIST" });
    expect(readPrivateOutput(markdownPath)).toBe(markdown);

    const symlink = join(dir, "symlink.md");
    symlinkSync(markdownPath, symlink);
    await expect(writeAuditOutputs({ report, markdown: "overwrite", markdownPath: symlink }))
      .rejects.toMatchObject({ code: "EEXIST" });
    expect(readPrivateOutput(markdownPath)).toBe(markdown);
    await expect(writeAuditOutputs({ report, markdown, jsonPath, markdownPath: jsonPath }))
      .rejects.toThrow("audit_output_paths_must_differ");
  });

  it("rejects symlinked or oversized input files and handles missing baselines safely", async () => {
    const dir = privateTempDir();
    const fixturePath = join(dir, "fixture.json");
    const linkPath = join(dir, "fixture-link.json");
    writeFileSync(fixturePath, JSON.stringify(fixture), { flag: "wx", mode: 0o600 });
    symlinkSync(fixturePath, linkPath);
    await expect(runAudit({ mode: "offline", fixturePath: linkPath })).rejects.toMatchObject({ code: "ELOOP" });
    await expect(runAudit({ mode: "offline", fixturePath, previousPath: linkPath }))
      .rejects.toMatchObject({ code: "ELOOP" });
    const noBaseline = await runAudit({ mode: "offline", fixturePath, previousPath: join(dir, "missing.json") });
    expect(noBaseline.comparison.status).toBe("NO_BASELINE");

    const hugePath = join(dir, "huge.json");
    writeFileSync(hugePath, "x".repeat(2 * 1024 * 1024 + 1), { flag: "wx", mode: 0o600 });
    await expect(runAudit({ mode: "offline", fixturePath: hugePath })).rejects.toThrow("invalid_audit_input_file");
  });

  it("enforces output limits and refuses unsafe output paths", async () => {
    const dir = privateTempDir();
    await expect(writeAuditOutputs({
      report: { ok: true }, markdown: "x".repeat(128 * 1024 + 1),
      jsonPath: join(dir, "too-large.json"), markdownPath: join(dir, "too-large.md"),
    })).rejects.toThrow("audit_output_too_large");
    await expect(writeAuditOutputs({
      report: {}, markdown: "", markdownPath: `bad${String.fromCharCode(0)}path.md`,
    })).rejects.toThrow("invalid_audit_output_path");
  });
});

describe("Integration Health observational warning policy", () => {
  it("keeps strict readiness failure while allowing observational reporting", () => {
    expect(auditExitCode("DEGRADED")).toBe(2);
    expect(auditExitCode("DEGRADED", "fail")).toBe(2);
    expect(auditExitCode("DEGRADED", "warn")).toBe(0);
    expect(auditExitCode("PASS_WITH_LIMITATIONS", "fail")).toBe(0);
    expect(auditExitCode("PASS_WITH_LIMITATIONS", "warn")).toBe(0);
    expect(auditExitCode("PASS", "fail")).toBe(0);
    expect(() => auditExitCode("DEGRADED", "silent")).toThrow("invalid_audit_degraded_policy");
  });

  it("writes DEGRADED artifact and static Actions warning without hiding the status", () => {
    const dir = privateTempDir();
    const fixturePath = join(dir, "fixture.json");
    writeFileSync(fixturePath, JSON.stringify(fixture), { flag: "wx", mode: 0o600 });
    const jsonPath = join(dir, "audit.json");
    const mdPath = join(dir, "audit.md");
    const params = [
      "scripts/integration-audit.mjs", "--mode", "offline", "--fixture", fixturePath,
      "--degraded-policy", "warn", "--json", jsonPath, "--markdown", mdPath,
    ];
    const result = spawnSync(process.execPath, params, { cwd: process.cwd(), encoding: "utf8", timeout: 10_000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("::warning title=AirRadar integration health::DEGRADED");
    expect(result.stdout).not.toContain("SECRET-ROUTE-PAYLOAD");
    const report = JSON.parse(readPrivateOutput(jsonPath));
    expect(report.verdict).toBe("DEGRADED");
    expect(report.checks.find((check) => check.id === "adsblol-routeset").status).toBe("BLOCKED");
    expect(report.checks.find((check) => check.id === "route-cache").status).toBe("DEGRADED");
    expect(readPrivateOutput(mdPath)).toContain("Verdict: **DEGRADED**");

    // Strict policy remains the default for release readiness gates.
    const strict = spawnSync(process.execPath,
      ["scripts/integration-audit.mjs", "--mode", "offline", "--fixture", fixturePath],
      { cwd: process.cwd(), encoding: "utf8", timeout: 10_000 });
    expect(strict.error).toBeUndefined();
    expect(strict.status).toBe(2);
    expect(strict.stdout).not.toContain("::warning title=");
  });

  it("fails on unsafe/unavailable audit input even under observational policy", () => {
    const dir = privateTempDir();
    const missing = spawnSync(process.execPath,
      ["scripts/integration-audit.mjs", "--mode", "offline", "--fixture", join(dir, "missing.json"),
        "--degraded-policy", "warn"],
      { cwd: process.cwd(), encoding: "utf8", timeout: 10_000 });
    expect(missing.error).toBeUndefined();
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("Integration audit unavailable");
  });
});
