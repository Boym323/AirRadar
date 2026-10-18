import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Batch D feature retirement", () => {
  it("removes the optional 3D runtime, terrain and device QA modules", () => {
    for (const relative of [
      "../components/radar/radar-3d-device-check.tsx",
      "../lib/radar/aircraft-3d-models-v6.ts",
      "../lib/radar/aircraft-3d-v6-d.ts",
      "../lib/radar/licensed-aircraft-glb-v6.ts",
      "../lib/radar/terrain-v6-d.ts",
      "../scripts/verify-v6-3d-device.mjs",
    ]) {
      expect(existsSync(new URL(relative, import.meta.url)), relative).toBe(false);
    }
  });

  it("keeps normal MapLibre, aircraft markers, map appearances and 2D follow", () => {
    const radar = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
    const layers = readFileSync(new URL("../components/radar/radar-map-layer-menu.tsx", import.meta.url), "utf8");
    expect(radar).toContain("createAircraftMarkerHandle");
    expect(radar).toContain("applyRadarMapAppearance");
    expect(radar).toContain("const [followSelected, setFollowSelected] = useState(false)");
    expect(radar).toContain("setFollowSelected((value) => !value)");
    expect(layers).toContain("Map background");
    expect(layers).toContain("mapAppearance");
    expect(layers).not.toContain("3D terrain");
    expect(layers).not.toContain("online GLB");
  });
});
