import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("nightly workflow scheduling", () => {
  it("staggeres scale and soak jobs to avoid simultaneous hosted-runner load", async () => {
    const heavy = await readFile(new URL("../.github/workflows/ci-heavy.yml", import.meta.url), "utf8");
    const soak = await readFile(new URL("../.github/workflows/radar-soak.yml", import.meta.url), "utf8");
    expect(heavy).toContain("cron: '17 2 * * *'");
    expect(soak).toContain('cron: "17 3 * * *"');
  });

  it("reuses the Playwright browser cache for radar soak", async () => {
    const soak = await readFile(new URL("../.github/workflows/radar-soak.yml", import.meta.url), "utf8");
    expect(soak).toContain("Restore Playwright browsers");
    expect(soak).toContain("~/.cache/ms-playwright");
    expect(soak).toContain("steps.playwright-cache.outputs.cache-hit != 'true'");
  });
});
