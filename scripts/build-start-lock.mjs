import { access } from "node:fs/promises";
import { spawn } from "node:child_process";

export const DEFAULT_BUILD_LOCK_FILE = "/run/airradar-build.lock";
// A production build can legitimately exceed two minutes on a cold boot,
// especially while dependencies/filesystems are warming up. Keep the service
// waiting for the shared release lock instead of making systemd restart it
// before the build has finished.
export const DEFAULT_BUILD_WAIT_TIMEOUT_MS = 600_000;
export const DEFAULT_BUILD_WAIT_POLL_MS = 100;

function probeLock(lockFile) {
  return new Promise((resolve, reject) => {
    const probe = spawn("flock", ["-n", lockFile, "-c", ":"], {
      stdio: "ignore",
    });

    probe.once("error", reject);
    probe.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`flock terminated by ${signal}`));
        return;
      }
      resolve(code === 0);
    });
  });
}

async function assertBuildId(buildIdPath) {
  try {
    await access(buildIdPath);
  } catch {
    throw new Error(`Production build is incomplete: missing ${buildIdPath}`);
  }
}

export async function waitForBuildReady({
  lockFile = process.env.AIRRADAR_BUILD_LOCK_FILE ?? DEFAULT_BUILD_LOCK_FILE,
  buildIdPath = `${process.cwd()}/.next/BUILD_ID`,
  timeoutMs = DEFAULT_BUILD_WAIT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_BUILD_WAIT_POLL_MS,
} = {}) {
  const startedAt = Date.now();

  while (true) {
    let available;
    try {
      available = await probeLock(lockFile);
    } catch (error) {
      throw new Error(`Cannot check AirRadar build lock ${lockFile}: ${error.message}`);
    }

    if (available) break;

    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs} ms waiting for AirRadar build lock ${lockFile}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  await assertBuildId(buildIdPath);
}
