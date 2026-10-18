import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = (relative: string) => new URL(`../${relative}`, import.meta.url);

describe("Batch A optional external-source retirement", () => {
  it("removes SondeHub routes, clients, polling and MQTT code", () => {
    for (const file of [
      "app/api/sondes/route.ts",
      "app/api/sondes/[serial]/route.ts",
      "components/radar/use-sondehub-map-layer.ts",
      "lib/server/sondehub-provider.ts",
      "lib/server/sondehub-mqtt.ts",
    ]) expect(existsSync(path(file))).toBe(false);

    const app = readFileSync(path("components/airradar-app.tsx"), "utf8");
    expect(app).not.toMatch(/sondehub|showSondes|useSondeHubMapLayer/i);
    expect(existsSync(path("app/api/aircraft/route.ts"))).toBe(true);
    expect(existsSync(path("lib/server/ogn-provider.ts"))).toBe(true);
  });

  it("removes NOAA context fetches while preserving Navigation Integrity", () => {
    expect(existsSync(path("app/api/navigation-integrity/space-weather/route.ts"))).toBe(false);
    expect(existsSync(path("lib/server/noaa-space-weather.ts"))).toBe(false);
    expect(existsSync(path("lib/server/space-weather.ts"))).toBe(false);
    expect(existsSync(path("components/navigation-integrity-center.tsx"))).toBe(true);
    expect(existsSync(path("app/api/navigation-integrity/current/route.ts"))).toBe(true);
    const center = readFileSync(path("components/navigation-integrity-center.tsx"), "utf8");
    expect(center).not.toMatch(/SpaceWeather|space-weather/i);
  });

  it("removes retired routes from the registry and retains the 2D radar", () => {
    const registry = JSON.parse(readFileSync(path("docs/features.registry.json"), "utf8"));
    const text = JSON.stringify(registry);
    expect(text).not.toMatch(/sondehub|space-weather-context|\/api\/sondes|\/api\/navigation-integrity\/space-weather/i);
    expect(registry.features.some((feature: { id: string }) => feature.id === "navigation-integrity")).toBe(true);
    expect(registry.features.some((feature: { id: string }) => feature.id === "live-radar")).toBe(true);
  });
});
