import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error The production gate helper is runtime-only ESM consumed by Node.
import { assertMigrationSource, assertProductionReleaseMetadata, isProductionGateFullSmokeViewport, isProductionGateMarkerSmokeViewport, resolveProductionGateChannel } from "../scripts/production-gates.mjs";

describe("production release metadata gate", () => {
  it("accepts only the stable production pair", () => {
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0", channel: "production" }, "stable")).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.1", channel: "release-candidate" }, "stable")).toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.1", channel: "production" }, "stable")).toThrow();
  });

  it("accepts canonical 1.0.0 RC metadata and rejects arbitrary versions", () => {
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0", channel: "production" })).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.1", channel: "release-candidate" })).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.1", channel: "release-candidate" }, "rc")).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.99", channel: "release-candidate" }, "rc")).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.0", channel: "release-candidate" }, "rc")).toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "2.0.0-rc.1", channel: "release-candidate" }, "rc")).toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.1", channel: "production" }, "rc")).toThrow();
  });

  it("supports the version emitted by the current build metadata", () => {
    expect(() => assertProductionReleaseMetadata({ version: "1.0.7", channel: "production" }, "auto", "1.0.7")).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.6", channel: "production" }, "auto", "1.0.7")).toThrow();
  });

  it("rejects an unconfigured or arbitrary gate mode", () => {
    expect(resolveProductionGateChannel(undefined)).toBe("auto");
    expect(resolveProductionGateChannel("RC")).toBe("rc");
    expect(() => resolveProductionGateChannel("anything")).toThrow();
  });

  it("validates the complete checked-in migration chain", () => {
    const result = assertMigrationSource(process.cwd());
    expect(result.directories).toHaveLength(19);
    expect(result.directories.at(-1)).toBe("20261005T1530_operational_twin_calibration_persistence_v1");
    expect(result.finalContractHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("retries the real command palette keyboard shortcut once after hydration", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source.match(/keyboard\.press\("Control\+K"\)/g)).toHaveLength(2);
    expect(source).toContain("if (!await commandPalette.isVisible())");
    expect(source).toContain("waitForTimeout(500)");
  });

  it("retries visual route navigation once when the root is not painted yet", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("const targetRoot = visualPage.locator(target.selector)");
    expect(source).toContain("visualPage.reload({ waitUntil: \"domcontentloaded\" })");
    expect(source).toContain("visual smoke ${target.path} root was not visible after initial navigation; retrying page load");
  });

  it("retries secondary route navigation once when the root is not painted yet", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("const routeRoot = page.locator(rootSelector)");
    expect(source).toContain("secondary route ${path} root was not visible after initial navigation; retrying page load");
  });

  it("retries the real Operations Center click once after hydration", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("const operationsPanel = visualPage.locator('[data-testid=\"operations-center-panel\"]')");
    expect(source).toContain("if (!await operationsPanel.isVisible()) await operationsTrigger.click();");
  });

  it("keeps breakpoint edges in the no-reload sweep while reloading only representative devices", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("const sweepWidths = [430, 480, 700, 720, 820, 821, 899, 900, 901, 950, 951, 1024, 1100, 1101, 1400, 1401]");
    for (const viewport of [
      "320x568", "320x844", "375x812", "390x844", "430x932", "768x1024", "820x1180",
      "821x1000", "1024x768", "1024x1366", "1366x768", "1440x900", "1100x900", "1920x1080",
    ]) {
      const [width, height] = viewport.split("x");
      expect(source).toContain(`{ width: ${width}, height: ${height} }`);
    }
    expect(source).not.toContain("{ width: 900, height: 900 }");
    expect(source).not.toContain("{ width: 1200, height: 900 }");
    expect(source).not.toContain("{ width: 902, height: 900 }");
    expect(source).not.toContain("{ width: 1150, height: 900 }");
  });

  it("completes the responsive sweep before route smoke can tear down the browser", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    const sweepStart = source.indexOf("const runResponsiveSweep =");
    const sweepAwait = source.indexOf("await runResponsiveSweep();", sweepStart);
    const routeSmokeSetup = source.indexOf("const routeErrors =", sweepStart);
    const lateSweepAwait = source.indexOf("await runResponsiveSweep();", routeSmokeSetup);

    expect(sweepStart).toBeGreaterThan(-1);
    expect(sweepAwait).toBeGreaterThan(sweepStart);
    expect(sweepAwait).toBeLessThan(routeSmokeSetup);
    expect(lateSweepAwait).toBe(-1);
  });

  it("treats degraded airport operations as an expected 503 in route smoke", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("/\\/api\\/airports\\/[^/]+\\/operations(?:\\?|\\/)/.test(url)");
    expect(source).toContain("if (expectedUnavailable) unavailable.push");
  });

  it("keeps Operations Dashboard in secondary smoke and follows the actual mobile More target", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain('["/operations", \'[data-testid="operations-dashboard-v1"]\']');
    expect(source).toContain('["/receiver/coverage", \'[data-testid="receiver-explorer-v2"]\']');
    expect(source).toContain('const mobileMoreHref = await mobileMoreLink.getAttribute("href")');
    expect(source).toContain("const mobileMoreTarget = new URL(mobileMoreHref, baseUrl)");
    expect(source).toContain('clickAndWaitForNavigation(routeSmoke, mobileMoreLink, mobileMoreTarget, "Mobile More link")');
    expect(source).not.toContain("alerts|fleet|intelligence|operations|recap|system|watchlist");
  });

  it("retries client-side route clicks once after hydration without bypassing the link", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("const clickAndWaitForNavigation = async");
    expect(source).toContain('waitUntil: "domcontentloaded"');
    expect(source).toContain("if (matchesTarget(page.url())) return");
    expect(source).toContain("await page.waitForTimeout(500)");
    expect(source).toContain('clickAndWaitForNavigation(routeSmoke, historyLink, new URL("/history", baseUrl), "History link")');
    expect(source).toContain("link.click()");
  });

  it("treats bounded diagnostic API rate limits as expected browser-smoke responses", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain('pathname === "/api/logbook/summary"');
    expect(source).toContain('/^\\/api\\/navigation-integrity\\/aircraft\\/[A-F0-9]{6}$/i.test(pathname)');
    expect(source).toContain("expectedRateLimitedApiErrors += 1");
  });

  it("keeps production-gate weather persistence inside its temporary state", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain('AVIATION_WEATHER_CACHE_FILE: resolve(runtimeStateDirectory, "weather-cache-v1.json")');
  });

  it("tracks the Airport Live Board V8 production smoke contract while preserving V6/V7 panels", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain('[data-product="airport-live-board-v8"]');
    expect(source).toContain('[data-testid="airport-live-board-flow-pulse"]');
    expect(source).toContain('[data-testid="airport-live-board-v6-pressure"]');
    expect(source).toContain('[data-testid="airport-live-board-v7-runway-flow"]');
    expect(source).toContain('[data-testid="airport-live-board-v7-arrival-sequence"]');
    expect(source).toContain('[data-testid="airport-live-board-v8-arrival-flow"]');
    expect(source).not.toContain('[data-product="airport-live-board-v6"]');
    expect(source).not.toContain('[data-product="airport-live-board-v7"]');
  });

  it("tracks the Digital Twin V2 map source contract", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain('"operational-twin-v2"');
    expect(source).toContain('"operational-twin-v2-uncertainty"');
    expect(source).toContain('"operational-twin-v2-route"');
    expect(source).toContain('"operational-twin-v2-kinematic"');
    expect(source).toContain('"operational-twin-v2-milestones"');
    expect(source).toContain('"operational-twin-v2-events"');
    expect(source).toContain('"operational-twin-v2-weather-events"');
    expect(source).toContain('"operational-twin-navigation-integrity-corridor-v1"');
  });

  it("captures radar visual evidence only after basemap features are rendered", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("map?.isStyleLoaded()");
    expect(source).toContain("map.queryRenderedFeatures().some((feature) => Boolean(feature.sourceLayer))");
    expect(source).toContain("}, undefined, { timeout: 25_000 });");
  });

  it("keeps mobile navigation geometry assertions out of the Node global scope", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("navLayout.items.some((item) => item.y < 0 || item.right > viewport.width + 1)");
  });

  it("verifies cross-country datasets from sources without touring the map", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain('map.querySourceFeatures("atc-sectors")');
    expect(source).toContain('map.querySourceFeatures("ats-routes")');
    expect(source).not.toContain('jumpTo({ center: [17.9, 49.0]');
    expect(source).not.toContain('jumpTo({ center: [19.5, 48.8]');
    expect(source).not.toContain('text.includes("reconnecting")');
  });

  it("runs dataset map-source smoke only on the desktop representative", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("const dataLayerSmoke = fullSmoke && viewport.width >= 821");
    expect(source).toContain("if (dataLayerSmoke) {");
    expect(source).toContain("Dataset requests did not complete");
    expect(source).not.toContain("temporary fixture failure");
    expect(source).toContain('if (viewport.width === 375) {');
  });

  it("runs marker transform regression only on the desktop representative", () => {
    expect(isProductionGateMarkerSmokeViewport({ width: 821, height: 1000 })).toBe(true);
    expect(isProductionGateMarkerSmokeViewport({ width: 375, height: 812 })).toBe(false);
    expect(isProductionGateMarkerSmokeViewport({ width: 1920, height: 1080 })).toBe(false);

    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("if (markerSmoke) {");
    expect(source).toContain("for (const zoom of [4, 8, 12])");
    expect(source).toContain("for (const delta of [[200, 100], [-200, -100]])");
    expect(source).toContain("for (const bearing of [90, 180])");
  });

  it("limits expensive browser interaction smoke to representative responsive families", () => {
    expect(isProductionGateFullSmokeViewport({ width: 375, height: 812 })).toBe(true);
    expect(isProductionGateFullSmokeViewport({ width: 821, height: 1000 })).toBe(true);
    for (const width of [320, 360, 390, 430, 768, 820, 899, 900, 901, 1024, 1099, 1100, 1101, 1200, 1280, 1440, 1920]) {
      expect(isProductionGateFullSmokeViewport({ width, height: 900 })).toBe(false);
    }

    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("if (markerSmoke) {");
    expect(source).toContain("if (fullSmoke && viewport.width >= 821) {");
  });

  it("tracks the current four-tab aircraft quick-detail smoke contract", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain('quickContract.tabs.length !== 4');
    expect(source).toContain('quickContract.trafficHeroes !== 1');
    expect(source).toContain('quickContract.headerPrimary');
    expect(source).toContain('quickContract.heroPrimary');
    expect(source).toContain('quickContract.liveMetricContainers !== 1');
    expect(source).toContain('quickContract.liveMetricSlots !== 4');
    expect(source).toContain('data-testid="radar-traffic-hero"');
    expect(source).toContain('data-testid="radar-traffic-hero-metric-${metric}"');
    expect(source).toContain('metric.state !== "available"');
    expect(source).toContain("missingHeroMetrics.length > 0");
    expect(source).not.toContain('querySelectorAll(".aircraft-quick-metrics")');
    expect(source).toContain('getByRole("tab", { name: "Situace", exact: true })');
    expect(source).toContain('"aircraft-tabpanel-situation"');
    expect(source).toContain('getByRole("tab", { name: "Let", exact: true })');
    expect(source).not.toContain('getByRole("tab", { name: "Přehled" })');
  });

  it("does not let an already-disposed Playwright page fail production-gate teardown", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("const closePage = async (page) =>");
    expect(source).toContain('message.includes("Target.disposeBrowserContext")');
    expect(source).toContain('message.includes("Failed to find context")');
    expect(source).toContain("await closePage(sweepPage)");
    expect(source).toContain("await closePage(visualPage)");
  });

  it("waits for the closed drawer visibility transition before responsive assertions", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain('getComputedStyle(sidebar).visibility === "hidden"');
    expect(source).toContain("drawer-closed intentionally delays visibility:hidden");
  });

});
