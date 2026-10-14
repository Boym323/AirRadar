import { describe, expect, it } from "vitest";
// @ts-expect-error The operational watchdog is intentionally a plain Node script.
import { validateActivationPreconditions } from "../scripts/atc-canary-watchdog.mjs";

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
