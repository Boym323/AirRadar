import { describe, expect, it } from "vitest";
// @ts-expect-error The operational watchdog is intentionally a plain Node script.
import { activate, initialize, validateActivationPreconditions } from "../scripts/atc-canary-watchdog.mjs";

const off = {
  AIRRADAR_ATC_RESOLUTION_ENABLED: "false",
  AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED: "false",
};

function valid(overrides: Record<string, unknown> = {}) {
  return {
    phase: "assignment",
    state: { schema: 1, mode: "armed", recoveries: 0 },
    currentFlags: { ...off },
    verifiedFlags: { ...off },
    timerActive: true,
    ...overrides,
  };
}

describe("ATC watchdog activation guard", () => {
  it("allows activation only from an armed watchdog with a live timer", () => {
    expect(() => validateActivationPreconditions(valid())).not.toThrow();
    expect(() => validateActivationPreconditions(valid({ phase: "shadow", currentFlags: {
      AIRRADAR_ATC_RESOLUTION_ENABLED: "true",
      AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED: "false",
    } }))).not.toThrow();
  });

  it.each([
    ["lockout", { mode: "lockout", recoveries: 1 }, "watchdog_not_armed"],
    ["recovery budget", { mode: "armed", recoveries: 1 }, "recovery_budget_exhausted"],
    ["corrupt state", null, "watchdog_not_armed"],
    ["invalid verified backup", { mode: "armed", recoveries: 0 }, "verified_backup_not_off"],
    ["inactive timer", { mode: "armed", recoveries: 0 }, "watchdog_timer_inactive"],
  ])("fails closed for %s", (_name, state, error) => {
    const input = valid({ state });
    if (_name === "invalid verified backup") input.verifiedFlags = { ...off, AIRRADAR_ATC_RESOLUTION_ENABLED: "true" };
    if (_name === "inactive timer") input.timerActive = false;
    expect(() => validateActivationPreconditions(input)).toThrow(error);
  });

  it("rejects a concurrent state transition observed after lock acquisition", () => {
    const stateReadBeforeLock = { schema: 1, mode: "armed", recoveries: 0 };
    const stateReadUnderLock = { schema: 1, mode: "lockout", recoveries: 1 };
    expect(() => validateActivationPreconditions(valid({ state: stateReadBeforeLock }))).not.toThrow();
    expect(() => validateActivationPreconditions(valid({ state: stateReadUnderLock }))).toThrow("watchdog_not_armed");
  });

  it("rejects an unexpected previous ATC configuration", () => {
    expect(() => validateActivationPreconditions(valid({ currentFlags: {
      AIRRADAR_ATC_RESOLUTION_ENABLED: "true",
      AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED: "true",
    } }))).toThrow("unexpected_previous_atc_config");
  });
});

const originalEnv = [
  "AIRRADAR_ATC_RESOLUTION_ENABLED=false",
  "AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED=false",
  "UNRELATED_SETTING=preserve",
  "",
].join("\n");

function activationHarness(options: {
  atomicWrite?: (text: string, stat: Record<string, unknown>, count: number) => void | Promise<void>;
  exec?: (args: string[]) => void | Promise<void>;
  waitForHealth?: (count: number) => void | Promise<void>;
  state?: Record<string, unknown>;
} = {}) {
  let env = originalEnv;
  let writeCount = 0;
  let restartCount = 0;
  let healthCount = 0;
  const savedStates: Record<string, unknown>[] = [];
  const originalStat = { mode: 0o640, uid: 1001, gid: 1002 };
  const closeCalls: string[] = [];
  const lock = (name: string) => ({
    close: async () => { closeCalls.push(name); },
  });
  const runtime = {
    acquireLocks: async () => ({ release: lock("release"), build: lock("build") }),
    acquireBuildLock: async () => lock("build-reacquired"),
    readState: async () => ({ schema: 1, mode: "armed", recoveries: 0, ...options.state }),
    readFile: async (path: string) => path.endsWith("verified.env") ? originalEnv : env,
    stat: async () => originalStat,
    exec: async (_command: string, args: string[]) => {
      if (args[0] === "is-active") return;
      restartCount += 1;
      await options.exec?.(args);
    },
    atomicWrite: async (_path: string, text: string, stat: Record<string, unknown>) => {
      writeCount += 1;
      await options.atomicWrite?.(text, stat, writeCount);
      env = text;
    },
    waitForHealth: async () => {
      healthCount += 1;
      await options.waitForHealth?.(healthCount);
    },
    saveState: async (state: Record<string, unknown>) => { savedStates.push(state); },
  };
  return { runtime, get: () => ({ env, writeCount, restartCount, healthCount, savedStates, originalStat, closeCalls }) };
}

describe("ATC watchdog activation rollback", () => {
  it("does not change .env when validation fails", async () => {
    const harness = activationHarness({ state: { mode: "lockout", recoveries: 1 } });
    await expect(activate("assignment", harness.runtime)).rejects.toThrow("watchdog_not_armed");
    expect(harness.get().writeCount).toBe(0);
    expect(harness.get().env).toBe(originalEnv);
  });

  it("does not report a changed configuration when atomic write fails", async () => {
    const harness = activationHarness({ atomicWrite: async () => { throw new Error("disk_full"); } });
    await expect(activate("assignment", harness.runtime)).rejects.toThrow("disk_full");
    expect(harness.get().env).toBe(originalEnv);
    expect(harness.get().savedStates).toHaveLength(0);
  });

  it.each([
    ["build lock release", { atomicWrite: undefined, exec: undefined, waitForHealth: undefined }],
    ["health timeout", { waitForHealth: async (count: number) => { if (count === 1) throw new Error("health_timeout"); } }],
  ])("restores the original configuration after %s", async (_name, options) => {
    const harness = activationHarness(options);
    if (_name === "build lock release") {
      let failed = false;
      harness.runtime.acquireLocks = async () => ({
        release: { close: async () => {} },
        build: { close: async () => { if (!failed) { failed = true; throw new Error("build_unlock_failed"); } } },
      });
    }
    await expect(activate("assignment", harness.runtime)).rejects.toThrow("activation_rolled_back");
    expect(harness.get().env).toBe(originalEnv);
    expect(harness.get().savedStates.at(-1)).toMatchObject({ mode: "lockout", recoveries: 1, restored: true, critical: false });
  });

  it("restores the original configuration after systemd restart fails", async () => {
    let failed = false;
    const harness = activationHarness({ exec: async (args: string[]) => {
      if (args[0] === "restart" && !failed) { failed = true; throw new Error("restart_failed"); }
    } });
    await expect(activate("assignment", harness.runtime)).rejects.toThrow("activation_rolled_back");
    expect(harness.get().env).toBe(originalEnv);
    expect(harness.get().savedStates.at(-1)).toMatchObject({ mode: "lockout", recoveries: 1, restored: true, critical: false });
  });

  it("returns an explicit critical state when rollback itself fails", async () => {
    let failed = false;
    const harness = activationHarness({
      exec: async (args: string[]) => { if (args[0] === "restart" && !failed) { failed = true; throw new Error("restart_failed"); } },
      atomicWrite: async (_text, _stat, count) => { if (count === 2) throw new Error("rollback_write_failed"); },
    });
    await expect(activate("assignment", harness.runtime)).rejects.toThrow("ATC_WATCHDOG_CRITICAL rollback_failed");
    expect(harness.get().savedStates.at(-1)).toMatchObject({ mode: "lockout", recoveries: 1, critical: true, rollbackFailed: true });
  });

  it("uses the original file metadata for both activation and rollback", async () => {
    const seenStats: Record<string, unknown>[] = [];
    let failed = false;
    const harness = activationHarness({
      atomicWrite: async (_text, stat) => { seenStats.push(stat); },
      exec: async (args: string[]) => { if (args[0] === "restart" && !failed) { failed = true; throw new Error("restart_failed"); } },
    });
    await expect(activate("assignment", harness.runtime)).rejects.toThrow("activation_rolled_back");
    expect(seenStats).toHaveLength(2);
    expect(seenStats[0]).toBe(harness.get().originalStat);
    expect(seenStats[1]).toBe(harness.get().originalStat);
  });

  it("serializes activation with the watchdog lock", async () => {
    let active = 0;
    let maximum = 0;
    let tail = Promise.resolve();
    const harness = activationHarness();
    harness.runtime.acquireLocks = async () => {
      let release!: () => void;
      const prior = tail;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await prior;
      active += 1;
      maximum = Math.max(maximum, active);
      return {
        release: { close: async () => { active -= 1; release(); } },
        build: { close: async () => {} },
      };
    };
    const first = activate("assignment", harness.runtime);
    const second = activate("assignment", harness.runtime);
    await expect(first).resolves.toBeUndefined();
    await expect(second).rejects.toThrow("unexpected_previous_atc_config");
    expect(maximum).toBe(1);
  });
});

describe("ATC watchdog initialization lockout", () => {
  it("does not re-arm an existing lockout", async () => {
    const harness = activationHarness({ state: { mode: "lockout", recoveries: 1 } });
    const copied: string[] = [];
    await expect(initialize({
      ...harness.runtime,
      mkdir: async () => {},
      copyFile: async (source: string) => { copied.push(source); },
      chmod: async () => {},
    })).rejects.toThrow("watchdog_lockout");
    expect(copied).toHaveLength(0);
  });
});
