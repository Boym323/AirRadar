import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { observerFailureState, observerWatchOptions } from "@/components/use-spotter-observer";

describe("isolated Spotter GPS lifecycle", () => {
  it("matches battery-aware GPS options and permission denial behavior", () => {
    expect(observerWatchOptions(true)).toEqual({enableHighAccuracy:true, maximumAge:15_000, timeout:10_000});
    expect(observerWatchOptions(false)).toEqual({enableHighAccuracy:false, maximumAge:60_000, timeout:10_000});
    expect(observerFailureState(1, 1)).toBe("denied");
    expect(observerFailureState(2, 1)).toBe("error");
  });
  it("keeps the only geolocation subscription in the hook and still cleans up the watch", () => {
    const hook = readFileSync(new URL("../components/use-spotter-observer.ts", import.meta.url),"utf8");
    const page = readFileSync(new URL("../components/mobile-spotter-mode.tsx", import.meta.url),"utf8");
    expect((hook.match(/navigator\.geolocation\.watchPosition\(/g) ?? [])).toHaveLength(1);
    expect(hook).toContain("navigator.geolocation.clearWatch(watchId)");
    expect(page).not.toContain("navigator.geolocation.watchPosition(");
    expect(page).toContain('useSpotterObserver(pageVisible && distanceOrigin === "observer", runtimeBudget.enableHighAccuracyGeolocation)');
    expect(page).toContain('data-testid="my-sky-focus-v2"');
  });
});
