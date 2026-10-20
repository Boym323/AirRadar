import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
const exists = (path: string) => existsSync(new URL("../" + path, import.meta.url));
describe("retired standalone history/flight-story/procedure surfaces", () => {
  it("does not ship abandoned Time Machine, Flight Story presentation or procedure imports", () => {
    for (const path of [
      "lib/server/time-machine.ts",
      "lib/server/sector-traffic-transitions.ts",
      "lib/time-machine/events.ts",
      "lib/time-machine/playback.ts",
      "lib/server/flight-story.ts",
      "lib/flight-story/narrative.ts",
      "lib/recap/daily-intelligence.ts",
      "lib/procedures/index.ts",
      "lib/procedures/pipeline.ts",
      "lib/procedures/repository.ts",
      "lib/procedures/sources.ts",
      "scripts/procedures-sync.ts",
      "components/atc-sector-traffic-panels.tsx",
      "lib/i18n/fleet-explorer-v6-f.ts"
]) {
      expect(exists(path), path).toBe(false);
    }
  });
  it("preserves sampled history, historical aircraft and ATS navigation endpoints", () => {
    for (const path of [
      "lib/server/history.ts",
      "app/api/history/[hex]/route.ts",
      "app/api/statistics/route.ts",
      "app/api/ats/routes/route.ts",
      "app/api/navigation/data/route.ts",
      "lib/route-intelligence/index.ts",
      "lib/server/atc-sector-service.ts",
    ]) expect(exists(path), path).toBe(true);
  });
});
