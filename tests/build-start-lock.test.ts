import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error The helper is intentionally runtime-only ESM consumed by Node.
import { waitForBuildReady } from "../scripts/build-start-lock.mjs";

const children: ReturnType<typeof spawn>[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill();
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "airradar-build-lock-"));
  const nextDir = join(root, ".next");
  await mkdir(nextDir);
  return { root, lockFile: join(root, "build.lock"), buildIdPath: join(nextDir, "BUILD_ID") };
}

function holdLock(lockFile: string, seconds = "2") {
  const child = spawn("flock", [lockFile, "-c", `sleep ${seconds}`], { stdio: "ignore" });
  children.push(child);
  return child;
}

async function waitForLockFile(lockFile: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await readFile(lockFile);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error("test lock was not created");
}

describe("production build/start lock", () => {
  it("continues immediately when no build is running", async () => {
    const paths = await fixture();
    await writeFile(paths.buildIdPath, "test-build\n");
    const started = Date.now();

    await waitForBuildReady({ ...paths, timeoutMs: 500, pollIntervalMs: 10 });

    expect(Date.now() - started).toBeLessThan(200);
  });

  it("waits while the build lock is held and continues after release with BUILD_ID", async () => {
    const paths = await fixture();
    const holder = holdLock(paths.lockFile, "0.25");
    await waitForLockFile(paths.lockFile);
    const started = Date.now();
    const waiting = waitForBuildReady({ ...paths, timeoutMs: 1_000, pollIntervalMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await writeFile(paths.buildIdPath, "test-build\n");

    await expect(waiting).resolves.toBeUndefined();
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
    expect(holder.exitCode).not.toBeNull();
  });

  it("fails when the build lock does not clear before the timeout", async () => {
    const paths = await fixture();
    holdLock(paths.lockFile, "2");
    await waitForLockFile(paths.lockFile);

    await expect(waitForBuildReady({ ...paths, timeoutMs: 80, pollIntervalMs: 10 })).rejects.toThrow(/Timed out/);
  });

  it("fails fast when BUILD_ID is missing", async () => {
    const paths = await fixture();

    await expect(waitForBuildReady({ ...paths, timeoutMs: 500 })).rejects.toThrow(/missing .*BUILD_ID/);
  });

  it("release.sh uses the same shared build lock around the production build", async () => {
    const release = await readFile(new URL("../deploy/release.sh", import.meta.url), "utf8");

    expect(release).toContain('BUILD_LOCK_FILE="/run/airradar-build.lock"');
    expect(release).toMatch(/acquire_build_lock[\s\S]*?npm run build[\s\S]*?release_build_lock/);
  });
});
