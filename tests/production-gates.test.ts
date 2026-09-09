import { describe, expect, it } from "vitest";
// @ts-expect-error The production gate helper is runtime-only ESM consumed by Node.
import { assertProductionReleaseMetadata, resolveProductionGateChannel } from "../scripts/production-gates.mjs";

describe("production release metadata gate", () => {
  it("accepts only the stable production pair", () => {
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0", channel: "production" }, "stable")).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.1", channel: "release-candidate" }, "stable")).toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.1", channel: "production" }, "stable")).toThrow();
  });

  it("accepts canonical 1.0.0 RC metadata and rejects arbitrary versions", () => {
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0", channel: "production" })).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.1", channel: "release-candidate" })).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.1", channel: "release-candidate" }, "rc")).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.99", channel: "release-candidate" }, "rc")).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.0", channel: "release-candidate" }, "rc")).toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "2.0.0-rc.1", channel: "release-candidate" }, "rc")).toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.1", channel: "production" }, "rc")).toThrow();
  });

  it("rejects an unconfigured or arbitrary gate mode", () => {
    expect(resolveProductionGateChannel(undefined)).toBe("auto");
    expect(resolveProductionGateChannel("RC")).toBe("rc");
    expect(() => resolveProductionGateChannel("anything")).toThrow();
  });
});
