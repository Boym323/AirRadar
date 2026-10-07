import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONSERVATIVE_SPOTTER_RUNTIME_BUDGET,
  DEFAULT_SPOTTER_RUNTIME_BUDGET,
  spotterRuntimeBudget,
} from "@/lib/spotter-runtime-budget";

describe("Spotter Mobile Hardening V1", () => {
  const component = readFileSync(new URL("../components/mobile-spotter-mode.tsx", import.meta.url), "utf8");
  const stream = readFileSync(new URL("../components/use-aircraft-stream.ts", import.meta.url), "utf8");

  it("suspends the canonical aircraft stream while the page is hidden", () => {
    expect(component).toContain("document.visibilityState");
    expect(component).toContain('document.addEventListener("visibilitychange"');
    expect(component).toContain("enabled: pageVisible");
    expect(stream).toContain("if (!enabled)");
    expect(component).not.toContain("new EventSource");
  });

  it("ties GPS, device orientation and background refreshes to page visibility", () => {
    expect(component).toContain('if (!pageVisible || distanceOrigin !== "observer") return;');
    expect(component).toContain("navigator.geolocation.clearWatch");
    expect(component).toContain('if (!skyFinderEnabled || !pageVisible)');
    expect(component).toContain("runtimeBudget.prgRefreshMs");
    expect(component).toContain("runtimeBudget.metarRefreshMs");
    expect(component).toContain("runtimeBudget.historyRefreshMs");
    expect(component).toContain("runtimeBudget.discoveryRefreshMs");
  });

  it("uses a conservative network budget for save-data and 2G links", () => {
    expect(spotterRuntimeBudget()).toEqual(DEFAULT_SPOTTER_RUNTIME_BUDGET);
    expect(spotterRuntimeBudget({ saveData: true })).toEqual(CONSERVATIVE_SPOTTER_RUNTIME_BUDGET);
    expect(spotterRuntimeBudget({ effectiveType: "2g" })).toEqual(CONSERVATIVE_SPOTTER_RUNTIME_BUDGET);
    expect(spotterRuntimeBudget({ effectiveType: "4g" })).toEqual(DEFAULT_SPOTTER_RUNTIME_BUDGET);
    expect(CONSERVATIVE_SPOTTER_RUNTIME_BUDGET.enableHighAccuracyGeolocation).toBe(false);
    expect(CONSERVATIVE_SPOTTER_RUNTIME_BUDGET.metarRefreshMs)
      .toBeGreaterThan(DEFAULT_SPOTTER_RUNTIME_BUDGET.metarRefreshMs);
  });

  it("keeps personal data boundaries explicit", () => {
    expect(component).toContain("SPOTTER_LOGBOOK_STORAGE_KEY");
    expect(component).toContain("centerLat: observer.lat");
    expect(component).toContain('method: "POST"');
    expect(component).toContain('fetch("/api/weather/metar-map"');
    expect(component).not.toContain("/api/weather/metar-map?");
  });
});
