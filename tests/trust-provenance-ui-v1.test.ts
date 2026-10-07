import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeTrustConfidence, trustFreshness } from "@/lib/trust-provenance";

describe("Trust & Provenance UI V1", () => {
  it("classifies freshness with an explicit threshold", () => {
    const now = new Date("2026-10-07T15:10:00Z");
    expect(trustFreshness("2026-10-07T15:09:30Z", now, 60_000).state).toBe("FRESH");
    expect(trustFreshness("2026-10-07T15:00:00Z", now, 60_000).state).toBe("STALE");
    expect(trustFreshness(null, now).state).toBe("UNKNOWN");
  });

  it("normalizes only supported confidence levels", () => {
    expect(normalizeTrustConfidence("high")).toBe("HIGH");
    expect(normalizeTrustConfidence("maybe")).toBeNull();
  });

  it("is a presentation layer over existing evidence, not a new data source", () => {
    const stamp = readFileSync(new URL("../components/trust-stamp.tsx", import.meta.url), "utf8");
    expect(stamp).not.toContain("fetch(");
    expect(stamp).not.toContain("localStorage");
    expect(stamp).not.toContain("EventSource");
    for (const path of [
      "../components/my-airradar-home.tsx",
      "../components/aviation-event-feed.tsx",
      "../components/historical-baselines.tsx",
      "../components/followed-journeys.tsx",
    ]) {
      expect(readFileSync(new URL(path, import.meta.url), "utf8")).toContain("TrustStamp");
    }
  });
});
