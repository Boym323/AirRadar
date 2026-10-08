import { describe, expect, it } from "vitest";
import { buildPredictiveCaptureHealth } from "@/lib/predictive-intelligence/capture-health";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const valid = (capability: string, createdAt: unknown) => ({ capability, createdAt });
const defaults = { now: NOW, sourceAvailable: true, complete: true, captureConfigured: true };

describe("Prediction Evidence Health V1", () => {
  it("counts persisted observations by capability for the last 24 hours, not by predicted landing time", () => {
    const report = buildPredictiveCaptureHealth([
      valid("ETA", "2026-10-08T11:59:00.000Z"),
      valid("ETA", new Date("2026-10-07T12:00:00.000Z")),
      valid("RUNWAY", { epochMilliseconds: Date.parse("2026-10-08T09:00:00.000Z") }),
      valid("TRAJECTORY", "2026-10-06T09:00:00.000Z"),
      valid("RUNWAY_CHANGE", "2026-10-08T13:00:00.000Z"), // future clock skew
      valid("ETA", "broken"),
    ], defaults);

    expect(report.version).toBe("predictive-capture-health-v1");
    expect(report.state).toBe("RECENT_SAMPLES");
    expect(report.observationRows).toBe(6);
    expect(report.timestampedRows).toBe(4);
    expect(report.recent24h).toBe(3);
    expect(report.lastPersistedAt).toBe("2026-10-08T11:59:00.000Z");
    expect(report.perCapability.ETA).toEqual({ recent24h: 2, lastPersistedAt: "2026-10-08T11:59:00.000Z" });
    expect(report.perCapability.RUNWAY).toEqual({ recent24h: 1, lastPersistedAt: "2026-10-08T09:00:00.000Z" });
    expect(report.perCapability.RUNWAY_CHANGE).toEqual({ recent24h: 0, lastPersistedAt: null });
    expect(report.perCapability.TRAJECTORY).toEqual({ recent24h: 0, lastPersistedAt: "2026-10-06T09:00:00.000Z" });
  });

  it("reports quiet collection without equating it with a failed predictive model", () => {
    const report = buildPredictiveCaptureHealth([valid("ETA", "2026-10-06T10:00:00Z")], defaults);
    expect(report.state).toBe("NO_RECENT_SAMPLES");
    expect(report.recent24h).toBe(0);
    expect(report.lastPersistedAt).not.toBeNull();
  });

  it("distinguishes disabled capture, unavailable database, and truncated collections", () => {
    const recent = [valid("ETA", "2026-10-08T10:00:00Z")];
    expect(buildPredictiveCaptureHealth(recent, { ...defaults, captureConfigured: false }).state).toBe("CAPTURE_DISABLED");
    expect(buildPredictiveCaptureHealth([], { ...defaults, sourceAvailable: false }).state).toBe("SOURCE_UNAVAILABLE");
    expect(buildPredictiveCaptureHealth(recent, { ...defaults, complete: false }).state).toBe("COLLECTION_INCOMPLETE");
    expect(buildPredictiveCaptureHealth([], defaults).state).toBe("NO_TIMESTAMPED_SAMPLES");
    expect(buildPredictiveCaptureHealth([valid("ETA", Number.NaN)], defaults).state).toBe("NO_TIMESTAMPED_SAMPLES");
  });

  it("rejects unknown capability and invalid/future timestamps from per-capability freshness", () => {
    const report = buildPredictiveCaptureHealth([
      valid("UNKNOWN", "2026-10-08T11:00:00Z"),
      valid("ETA", "2026-11-08T11:00:00Z"),
      valid("ETA", -Infinity),
      valid("ETA", "2026-08-08T11:00:00Z"),
    ], defaults);
    expect(report.timestampedRows).toBe(1);
    expect(report.recent24h).toBe(1);
    expect(report.perCapability.ETA.lastPersistedAt).toBeNull();
    expect(Object.keys(report.perCapability)).toEqual(["ETA", "RUNWAY", "RUNWAY_CHANGE", "TRAJECTORY"]);
  });

  it("is a read-only diagnostic and never a graduation decision", () => {
    const disabled = buildPredictiveCaptureHealth([valid("ETA", "2026-10-08T11:00:00Z")], {
      ...defaults, captureConfigured: false,
    });
    expect(disabled.state).toBe("CAPTURE_DISABLED");
    expect(disabled.recent24h).toBe(1); // Historic records remain visible even when capture is now off.
    expect(disabled).not.toHaveProperty("ready");
    expect(disabled).not.toHaveProperty("publicActive");
  });
});
