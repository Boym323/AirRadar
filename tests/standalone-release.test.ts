import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("standalone production release", () => {
  it("builds standalone only for the validated release artifact", async () => {
    const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
    const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    expect(config).toContain('AIRRADAR_STANDALONE_BUILD === "1" ? "standalone"');
    expect(workflow).toContain("AIRRADAR_STANDALONE_BUILD: '1'");
    expect(workflow).toContain("Prepare standalone runtime assets");
    expect(workflow).toContain('runtime: "standalone"');
  });

  it("starts the traced server through the existing production wrapper", async () => {
    const start = await readFile(new URL("../scripts/start-production.mjs", import.meta.url), "utf8");
    const gates = await readFile(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(start).toContain('.next/standalone/server.js');
    expect(start).toContain('process.env.AIRRADAR_APP_ROOT = appDir');
    expect(start).toContain('await import("next/dist/bin/next")');
    expect(gates).toContain('["scripts/start-production.mjs", "start"');
  });

  it("skips npm ci only when standalone deploy tooling matches the lockfile", async () => {
    const release = await readFile(new URL("../deploy/release.sh", import.meta.url), "utf8");
    expect(release).toContain("deploy-package-lock.sha256");
    expect(release).toContain('[[ "${runtime}" == "standalone" ]]');
    expect(release).toContain('[[ "${recorded_hash}" == "${lock_hash}" ]]');
    expect(release).toContain("skipping npm ci");
    expect(release).toContain("npm ci --prefer-offline --no-audit --no-fund");
  });
});
