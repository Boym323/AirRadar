import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("PIREP / AIREP Intelligence V1 boundaries", () => {
  it("keeps the upstream fetch server-side, bounded and outside the ADS-B hot path", async () => {
    const provider = await readFile("lib/server/pirep-provider.ts", "utf8");
    const route = await readFile("app/api/weather/pirep/route.ts", "utf8");
    const aircraftState = await readFile("lib/server/aircraft-state.ts", "utf8");

    expect(provider).toContain('new URL("/api/data/pirep"');
    expect(provider).toContain("MAX_CACHE_ENTRIES = 64");
    expect(provider).toContain("MAX_RESULTS = 200");
    expect(provider).toContain("DEFAULT_TTL_MS = 5 * 60_000");
    expect(provider).toContain("this.inFlight.get(key)");
    expect(route).toContain('checkPublicRateLimit("weather", request)');
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(aircraftState).not.toContain("pirep-provider");
    expect(aircraftState).not.toContain("/api/data/pirep");
  });

  it("keeps external reports visibly separate from local aircraft weather", async () => {
    const panel = await readFile("components/aircraft-weather-panel.tsx", "utf8");
    const cs = await readFile("lib/i18n/cs.ts", "utf8");
    const registry = await readFile("docs/features.registry.json", "utf8");

    expect(panel).toContain("api/weather/pirep");
    expect(panel).toContain("pirepExternalDisclaimer");
    expect(panel).toContain("setInterval(() => void load(), 5 * 60_000)");
    expect(cs).toContain("Nejsou automaticky přiřazena ke konkrétním letadlům");
    expect(registry).toContain('"/api/weather/pirep"');
  });
});
