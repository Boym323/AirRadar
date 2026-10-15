import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Operational build isolation guard is plain Node ESM.
import { assertSafeProductionBuild } from "../scripts/assert-build-isolation.mjs";

const metadata = {
  version: "1.0.451",
  tag: "v1.0.451",
  commit: "a".repeat(40),
  shortCommit: "a".repeat(8),
  sourceCommit: "a".repeat(40),
  releaseCommit: "a".repeat(40),
  artifactCommit: "a".repeat(40),
  tagTarget: "a".repeat(40),
  buildTime: "2026-10-14T12:00:00.000Z",
  channel: "production",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production standalone version integrity", () => {
  it("uses the artifact identity regardless of the development checkout", async () => {
    const dir = await mkdtemp(join(tmpdir(), "airradar-version-"));
    const artifactPath = join(dir, "build-version.json");
    try {
      await writeFile(artifactPath, JSON.stringify(metadata));
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("AIRRADAR_ARTIFACT_METADATA_PATH", artifactPath);
      vi.resetModules();
      const { getPublicVersion } = await import("../lib/server/version");
      expect(getPublicVersion()).toEqual({
        version: "1.0.451",
        commit: "aaaaaaaa",
        buildTime: metadata.buildTime,
        channel: "production",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not fall back to root checkout metadata when the artifact is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "airradar-version-"));
    try {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("AIRRADAR_ARTIFACT_METADATA_PATH", join(dir, "missing.json"));
      vi.resetModules();
      const { getPublicVersion } = await import("../lib/server/version");
      expect(() => getPublicVersion()).toThrow("artifact_build_metadata_invalid");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails closed for invalid artifact metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "airradar-version-"));
    try {
      const path = join(dir, "build-version.json");
      await writeFile(path, JSON.stringify({ ...metadata, channel: "development" }));
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("AIRRADAR_ARTIFACT_METADATA_PATH", path);
      vi.resetModules();
      const { getPublicVersion } = await import("../lib/server/version");
      expect(() => getPublicVersion()).toThrow("artifact_build_metadata_invalid");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("build isolation in the shared production checkout", () => {
  it("refuses a default Next build", () => {
    expect(() => assertSafeProductionBuild({ cwd: "/var/www/airradar" }))
      .toThrow("production_checkout_build_forbidden");
  });

  it("refuses path tricks and an unauthorized isolated build", () => {
    for (const distDir of [".next", "./.next", "../.next", ".next-release-test", ".next-release-123/../.next"]) {
      expect(() => assertSafeProductionBuild({
        cwd: "/var/www/airradar", distDir, releaseBuild: "1",
      })).toThrow("production_checkout_build_forbidden");
    }
    expect(() => assertSafeProductionBuild({
      cwd: "/var/www/airradar", distDir: ".next-release-123",
    })).toThrow("production_checkout_build_forbidden");
  });

  it("allows only versioned release staging under explicit release control", () => {
    expect(() => assertSafeProductionBuild({
      cwd: "/var/www/airradar", distDir: ".next-release-123", releaseBuild: "1",
    })).not.toThrow();
  });

  it("allows isolated developer and CI worktrees", () => {
    expect(() => assertSafeProductionBuild({
      cwd: "/tmp/airradar-ci-fixture", distDir: ".next",
    })).not.toThrow();
  });
});
