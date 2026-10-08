import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Visual refinement B: aircraft and mobile drawer", () => {
  it("groups identity next to live metrics without moving operational data", () => {
    const page = source("components/aircraft-detail-v3.tsx");
    const styles = source("components/aircraft-detail-v3.module.css");
    expect(page).toContain("styles.heroOverview");
    expect(page).toContain("styles.heroIntro");
    expect(page).toContain("styles.heroBody");
    expect(page).toContain("<PredictiveAircraftAdvisories");
    expect(styles).toContain(".heroOverview .heroMetrics");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("supports accessible expansion of a compact mobile aircraft drawer", () => {
    const detail = source("components/aircraft-radar-quick-detail.tsx");
    const style = source("app/radar-aircraft-panel.css");
    expect(detail).toContain("const [mobileExpanded, setMobileExpanded] = useState(false)");
    expect(detail).toContain('aria-expanded={mobileExpanded}');
    expect(detail).toContain('aria-controls="radar-sidebar"');
    expect(detail).toContain('t.radar.expandAircraftPanel');
    expect(detail).toContain('t.radar.collapseAircraftPanel');
    expect(style).toContain('.sidebar.drawer-aircraft.has-selection:has(.aircraft-quick-mobile-expand[aria-expanded="true"])');
    expect(style).toContain("height: min(52svh, 490px)");
    expect(style).toContain("height: min(80svh, 760px)");
    const gate = source("scripts/production-gates.mjs");
    expect(gate).toContain('"radar-mobile-selected-expanded"');
    expect(gate).toContain("Mobile aircraft detail expand did not increase visible drawer height");
  });
});
