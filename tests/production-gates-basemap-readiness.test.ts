import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gate = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
const radar = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");

describe("production browser gate basemap evidence", () => {
  it("requires a completed map style lifecycle and actually rendered source-layer features", () => {
    const visualWait = gate.slice(
      gate.indexOf('if (target.path.includes("mapDiagnostics=1"))'),
      gate.indexOf('if (target.openMapCredits)'),
    );
    expect(visualWait).toContain("window.__airradarMapStyleLoadedForDiagnostics !== true");
    expect(visualWait).toContain("map.queryRenderedFeatures().some((feature) => Boolean(feature.sourceLayer))");
    expect(visualWait).not.toContain("!map.isStyleLoaded()");
    expect(visualWait).not.toContain("!allowPendingRaster");
    expect(radar).toContain('map.once("style.load", () => {');
    expect(radar).toContain("window.__airradarMapStyleLoadedForDiagnostics = true");
  });

  it("retains useful diagnostics for slow remote tile managers", () => {
    expect(gate).toContain("styleEventLoaded: window.__airradarMapStyleLoadedForDiagnostics === true");
    expect(gate).toContain("styleLoaded: map.isStyleLoaded()");
    expect(gate).toContain("tilesLoaded: map.areTilesLoaded()");
    expect(gate).toContain("renderedVectorFeatures,");
    expect(gate).toContain("timeout: 25_000");
  });

  it("retries transient third-party tile stalls once, but still requires rendered vector features", () => {
    const baseline = gate.slice(
      gate.indexOf('if (target.path.includes("mapDiagnostics=1"))'),
      gate.indexOf('if (target.openMapCredits)'),
    );
    expect(baseline).toContain('evidence.styleEventLoaded === true && evidence.renderedVectorFeatures === 0 && evidence.tilesLoaded === false');
    expect(baseline).toContain('await visualPage.reload({ waitUntil: "domcontentloaded" })');
    expect(baseline).toContain('if (target.v6Appearance) {');
    expect(baseline).toContain('selectOption(target.v6Appearance)');
    expect(baseline).toContain('!target.v6Presentation && !target.enableV6Multi');
    expect(baseline).toContain('map.queryRenderedFeatures().some((feature) => Boolean(feature.sourceLayer))');
    expect(baseline).toContain("failed after one retry");
    expect(baseline).not.toContain("catch { /*ignore*/ }");
  });

  it("tolerates 429 only for the optional RXW availability endpoint in the browser sweep", () => {
    const browserSweep = gate.slice(gate.indexOf("const runResponsiveSweep"));
    expect(browserSweep).toContain('pathname === "/api/aircraft/communications/waypoints"');
    expect(browserSweep).toContain("/^\\/api\\/aircraft\\/[A-F0-9]{6}\\/communications$/i.test(pathname)");
    expect(browserSweep).toContain("expectedRateLimitedApiErrors += 1");
    expect(browserSweep).toContain("browserErrors.push(");
    expect(radar).toContain('fetch("/api/aircraft/communications/waypoints", { cache: "no-store" })');
    // RXW availability is a best-effort map enrichment, not the source of live aircraft.
    expect(radar).toContain('rxwFpnAvailabilityRef.current = [];');
  });
});
