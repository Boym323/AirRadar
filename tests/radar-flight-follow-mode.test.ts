import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Flight Follow Mode V1 boundaries", () => {
  it("reuses selected-aircraft state and PUBLIC Operational Twin data without a new data lane", async () => {
    const app = await readFile(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
    const hud = await readFile(new URL("../components/radar/radar-flight-follow-hud.tsx", import.meta.url), "utf8");

    expect(app).toContain('const [followSelected, setFollowSelected] = useState(false)');
    expect(app).toContain("<RadarFlightFollowHud");
    expect(app).toContain('map.on("dragstart", stopFollowingOnDrag)');
    expect(app).toContain('window.requestAnimationFrame(followRenderedAircraft)');
    expect(app).toContain("liveAircraftByHexRef.current.get(selectedHex)");

    expect(hud).toContain('event.type === "ARRIVAL_ETA"');
    expect(hud).toContain('event.type === "RUNWAY_EXPECTATION"');
    expect(hud).toContain('event.provenance === "PREDICTED"');
    expect(hud).toContain("operationalTwin?.status === \"available\"");
    expect(hud).not.toContain("fetch(");
    expect(hud).not.toContain("adminPreview");
    expect(hud).not.toContain("localStorage");
  });

  it("collapses the follow HUD to identity and toggle while aircraft detail shows live telemetry", async () => {
    const app = await readFile(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
    const hud = await readFile(new URL("../components/radar/radar-flight-follow-hud.tsx", import.meta.url), "utf8");
    const styles = await readFile(new URL("../components/radar/radar-flight-follow-hud.module.css", import.meta.url), "utf8");

    expect(app).toContain('compact={drawerState === "aircraft"}');
    expect(hud).toContain('data-compact={compact ? "true" : "false"}');
    expect(hud).toContain("{!compact && <div className={styles.telemetry}");
    expect(hud).toContain("{!compact && <div className={styles.metrics}");
    expect(hud).toContain("aria-pressed={following}");
    expect(styles).toContain(".hud.compact");
    expect(styles).toContain(".compact .toggle");
  });

  it("fails closed when the selected aircraft is no longer available or the drawer leaves aircraft mode", async () => {
    const app = await readFile(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");

    expect(app).toContain("setFollowSelected(false);");
    expect(app).toContain("onSelectedAircraftRemoved");
    expect(app).toContain("const selectOgn");
    expect(app).toContain("const closeRadarDrawer");
    expect(app).toContain("const backToTraffic");
  });
});
