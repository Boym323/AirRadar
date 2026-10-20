import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const matrix = JSON.parse(readFileSync(new URL("../docs/audits/SELECTED-FEATURE-MATRIX-2026-10-19.json", import.meta.url), "utf8")) as {
  keepIds: string[]; removeIds: string[];
  phase1: { removedStandalonePages: string[]; remainingRoutes: string[] };
};
const root = new URL("../", import.meta.url);

function pagePath(route: string): string {
  return `app${route.replace(/:([^/]+)/g, "[$1]")}/page.tsx`;
}

describe("explicit selected-feature reduction contracts", () => {
  it("keeps the selection unambiguous and prevents ID overlap", () => {
    const selected = [...matrix.keepIds, ...matrix.removeIds];
    expect(new Set(selected).size).toBe(selected.length);
    expect(matrix.keepIds).toContain("R17");
    expect(matrix.keepIds).toContain("J09");
    expect(matrix.keepIds).toContain("L11");
    expect(matrix.keepIds).toContain("L12");
    expect(matrix.removeIds).toContain("D23");
    expect(matrix.removeIds).toContain("P15");
  });

  it("does not ship the first-phase retired page entrypoints", () => {
    for (const route of matrix.phase1.removedStandalonePages) {
      expect(existsSync(new URL(pagePath(route), root)), route).toBe(false);
    }
  });

  it("preserves page entrypoints for user-selected UI", () => {
    for (const route of matrix.phase1.remainingRoutes) {
      expect(existsSync(new URL(pagePath(route), root)), route).toBe(true);
    }
  });

  it("keeps retained airport details free of retired Airport Live Board controllers", () => {
    const detail = readFileSync(new URL("components/airport-detail.tsx", root), "utf8");
    const catalog = readFileSync(new URL("components/airports-flights-browser.tsx", root), "utf8");
    const hud = readFileSync(new URL("components/radar/radar-map-hud.tsx", root), "utf8");
    expect(detail).not.toContain("useAirportLiveTrafficController");
    expect(detail).not.toContain("useAirportOperationsController");
    expect(detail).toContain("<AirportWeatherPanel");
    expect(detail).toContain("<AirportInfrastructureSections");
    expect(catalog).not.toContain("LiveAirportNetwork");
    expect(catalog).not.toContain("FlightsPage");
    expect(hud).not.toContain("RadarOperationsCenter");
  });

  it("keeps RXW Hub metadata but no longer runs the rejected live FPN map lane", () => {
    const app = readFileSync(new URL("components/airradar-app.tsx", root), "utf8");
    expect(app).not.toContain("RXW_FPN_");
    expect(app).not.toContain("createRxwFpn");
    expect(app).not.toContain("/api/aircraft/communications/waypoints");
    expect(existsSync(new URL("app/api/aircraft/[hex]/communications/route.ts", root))).toBe(true);
    expect(existsSync(new URL("app/api/aircraft/communications/waypoints/route.ts", root))).toBe(false);
    expect(existsSync(new URL("lib/server/rxw-fpn-parser.ts", root))).toBe(false);
    for (const legacyUi of [
      "lib/radar/rxw-fpn-visual.ts",
      "components/historical-acars-routes.tsx",
      "components/historical-acars-routes.module.css",
      "lib/i18n/rxw-history.ts",
    ]) {
      expect(existsSync(new URL(legacyUi, root)), legacyUi).toBe(false);
    }
    const store = readFileSync(new URL("lib/server/rxw-hub-store.ts", root), "utf8");
    expect(store).not.toContain("parseRxwH1Fpn");
    expect(store).not.toContain("waypointPlanForFlight");
    expect(store).not.toContain("RXW_FPN_ENABLED");
  });

  it("keeps RXW communication metadata without the rejected H1/FPN detail panel", () => {
    const panel = readFileSync(new URL("components/aircraft-communications.tsx", root), "utf8");
    expect(panel).toContain("snapshot.routeHint");
    expect(panel).toContain("snapshot.messages");
    expect(panel).not.toContain("snapshot.waypointPlan");
  });

  it("removes standalone UI modules for retired procedures, ATC exploration and airport comparisons", () => {
    for (const path of [
      "components/procedure-explorer.tsx",
      "components/airport-compare.tsx",
      "components/atc-airspace-explorer.tsx",
    ]) {
      expect(existsSync(new URL(path, root)), path).toBe(false);
    }
    // The requested retained navigation and ATC map overlays remain independent.
    expect(existsSync(new URL("components/navigation-reference-explorer.tsx", root))).toBe(true);
    expect(existsSync(new URL("lib/radar/airspace-geojson.ts", root))).toBe(true);
  });

  it("retains only selected deep-link contracts in the shared investigation helper", () => {
    const source = readFileSync(new URL("lib/investigation-links.ts", root), "utf8");
    for (const required of [
      "parseNavigationIntegrityInvestigation", "buildNavigationIntegrityInvestigation",
      "parseNavigationReferenceInvestigation", "buildNavigationReferenceInvestigation",
      "investigationHref",
    ]) expect(source).toContain("export function " + required);
    for (const retired of [
      "parseAirspaceInvestigation", "buildAirspaceInvestigation",
      "parseFlightCompareInvestigation", "buildFlightCompareInvestigation",
      "parseAirportCompareInvestigation", "buildAirportCompareInvestigation",
      "parseProcedureInvestigation", "buildProcedureInvestigation",
      "parseSectorDetailInvestigation", "buildSectorDetailInvestigation",
    ]) expect(source).not.toContain("export function " + retired);
  });

  it("never polls retired flight-intelligence and route-weather endpoints from selected aircraft", () => {
    const context = readFileSync(new URL("components/radar/use-radar-aircraft-context.ts", root), "utf8");
    const detail = readFileSync(new URL("components/aircraft-radar-quick-detail.tsx", root), "utf8");
    expect(context).not.toContain("/api/intelligence/events");
    expect(context).not.toContain("/route-weather");
    expect(context).toContain("/context");
    expect(detail).toContain("SigmetSection");
    expect(detail).toContain("NavigationIntegritySection");
    expect(detail).not.toContain("IntelligenceSection");
    expect(detail).not.toContain("RouteWeatherSection");
    expect(detail).not.toContain("<FlightRouteWeather");
  });

  it("keeps retained ATC and SIGMET context without the rejected flight situation summary", () => {
    const quick = readFileSync(new URL("components/aircraft-radar-quick-detail.tsx", root), "utf8");
    expect(quick).not.toContain("buildFlightSituationSummary");
    expect(quick).not.toContain("SituationSummarySection");
    expect(quick).toContain("<AtcSection");
    expect(quick).toContain("<SigmetSection");
    expect(quick).toContain("<NavigationIntegritySection");
  });

  it("never fetches rejected Digital Twin from the selected-aircraft context hook", () => {
    const hook = readFileSync(new URL("components/radar/use-radar-aircraft-context.ts", root), "utf8");
    expect(hook).not.toContain("/situation");
    expect(hook).not.toContain("setOperationalTwin");
    expect(hook).not.toContain("OperationalTwinApiResponse");
    expect(hook).toContain("return { atcContext };");
    expect(hook).toContain("/context");
  });

  it("does not mount rejected Digital Twin and Operational Focus map layers", () => {
    const app = readFileSync(new URL("components/airradar-app.tsx", root), "utf8");
    const detail = readFileSync(new URL("components/aircraft-radar-quick-detail.tsx", root), "utf8");
    expect(app).not.toContain("OPERATIONAL_TWIN_");
    expect(app).not.toContain("AIRCRAFT_OPERATIONAL_FOCUS_MAP_");
    expect(app).not.toContain("RadarOperationalFocusCard");
    expect(detail).not.toContain("RadarOperationalFocusSummary");
    expect(app).toContain("showNavigationIntegrity");
    expect(app).toContain("showAtc");
  });

  it("does not compute Weather Avoidance in the radar drawer", () => {
    const app = readFileSync(new URL("components/airradar-app.tsx", root), "utf8");
    const panel = readFileSync(new URL("components/aircraft-radar-quick-detail.tsx", root), "utf8");
    expect(app).not.toContain("buildWeatherAvoidanceIntelligence");
    expect(panel).not.toContain("weather-avoidance-intelligence-v1");
    expect(panel).toContain("sigmet-trajectory-deviation");
    expect(panel).toContain("aircraft-sigmet-context");
  });

  it("does not register rejected Digital Twin Regional Attention map lane", () => {
    const app = readFileSync(new URL("components/airradar-app.tsx", root), "utf8");
    expect(app).not.toContain("REGIONAL_ATTENTION_MAP_");
    expect(app).not.toContain("createRegionalAttentionMapFocusGeoJSON");
    expect(app).not.toContain("regionalAttentionMapFocus");
    expect(app).toContain("showNavigationIntegrity");
    expect(app).toContain("showAtc");
    expect(app).toContain('map.addSource("selected-trail"');
  });

  it("does not mount rejected predictive or Digital Twin panels on the retained aircraft detail", () => {
    const detail = readFileSync(new URL("components/aircraft-detail-v3.tsx", root), "utf8");
    expect(detail).not.toContain("PredictiveAircraftAdvisories");
    expect(detail).not.toContain("AircraftOperationalTwin");
    expect(detail).toContain("<AircraftHeroPhoto");
    expect(detail).toContain("<AircraftAltitudeChart");
    expect(detail).toContain("<AircraftAdsbTelemetry");
  });

  it("does not mount the rejected W10 Weather Fusion detail panel", () => {
    const detail = readFileSync(new URL("components/aircraft-detail-v3.tsx", root), "utf8");
    expect(detail).not.toContain("AircraftWeatherFusion");
    expect(detail).toContain("<AircraftAdsbTelemetry");
    expect(detail).toContain("<AircraftAltitudeChart");
  });

  it("does not mount rejected route weather on the retained aircraft detail", () => {
    const detail = readFileSync(new URL("components/aircraft-detail-v3.tsx", root), "utf8");
    expect(detail).not.toContain("FlightRouteWeather");
    expect(detail).toContain("<AircraftAltitudeChart");
    expect(detail).toContain("<AirspaceCard");
  });

  it("does not ship deleted predictive client panel modules", () => {
    for (const path of [
      "components/predictive-aircraft-advisories.tsx",
      "components/predictive-aircraft-advisories.module.css",
    ]) expect(existsSync(new URL(path, root)), path).toBe(false);
    const detail = readFileSync(new URL("components/aircraft-detail-v3.tsx", root), "utf8");
    expect(detail).not.toContain("PredictiveAircraftAdvisories");
    expect(detail).toContain("<AircraftAltitudeChart");
  });

  it("does not ship the orphan Digital Twin client or focus UI tests", () => {
    for (const path of [
      "components/aircraft-operational-twin.tsx",
      "components/aircraft-operational-twin.module.css",
      "tests/aircraft-operational-focus-ui-boundary.test.ts",
    ]) expect(existsSync(new URL(path, root)), path).toBe(false);
    const detail = readFileSync(new URL("components/aircraft-detail-v3.tsx", root), "utf8");
    expect(detail).not.toContain("AircraftOperationalTwin");
    expect(detail).toContain("<AircraftAltitudeChart");
  });

  it("does not ship retired W10 Weather Fusion client", () => {
    expect(existsSync(new URL("components/aircraft-weather-fusion.tsx", root))).toBe(false);
    const detail = readFileSync(new URL("components/aircraft-detail-v3.tsx", root), "utf8");
    expect(detail).not.toContain("AircraftWeatherFusion");
    expect(detail).toContain("<AircraftAdsbTelemetry");
  });

  it("does not ship the rejected W11 weather avoidance analytical module", () => {
    expect(existsSync(new URL("lib/weather/avoidance-intelligence.ts", root))).toBe(false);
    expect(existsSync(new URL("tests/weather-avoidance-intelligence.test.ts", root))).toBe(false);
    const quick = readFileSync(new URL("components/aircraft-radar-quick-detail.tsx", root), "utf8");
    expect(quick).toContain("sigmet-trajectory-deviation");
    expect(quick).toContain("aircraft-sigmet-context");
  });

  it("does not ship orphan Operational Focus map/drawer UI or styles", () => {
    for (const path of [
      "components/radar/radar-operational-focus-card.tsx",
      "components/radar/radar-operational-focus-card.module.css",
      "components/radar/radar-operational-focus-summary.tsx",
      "components/radar/radar-operational-focus-summary.module.css",
    ]) expect(existsSync(new URL(path, root)), path).toBe(false);
    const app = readFileSync(new URL("components/airradar-app.tsx", root), "utf8");
    const quick = readFileSync(new URL("components/aircraft-radar-quick-detail.tsx", root), "utf8");
    expect(app).not.toContain("RadarOperationalFocusCard");
    expect(quick).not.toContain("RadarOperationalFocusSummary");
    expect(quick).toContain("<NavigationIntegritySection");
  });

  it("does not keep obsolete prediction-timeline and retired UI files", () => {
    for (const path of [
      "components/predictive-aircraft-advisories.tsx",
      "components/aircraft-operational-twin.tsx",
      "tests/prediction-timeline-v1-boundary.test.ts",
    ]) {
      expect(existsSync(new URL(path, root)), path).toBe(false);
    }
    // Legacy read-only advisory contracts are reviewed independently from UI.
    expect(existsSync(new URL("lib/predictive-intelligence/explainability.ts", root))).toBe(true);
  });

  it("keeps flight-follow telemetry without rejected Digital Twin forecasts", () => {
    const follow = readFileSync(new URL("components/radar/radar-flight-follow-hud.tsx", root), "utf8");
    const app = readFileSync(new URL("components/airradar-app.tsx", root), "utf8");
    expect(follow).not.toContain("OperationalTwin");
    expect(follow).not.toContain("etaEvent");
    expect(follow).not.toContain("runwayEvent");
    expect(follow).not.toContain("weatherEvent");
    expect(follow).toContain("verticalRate(aircraft.verticalRate)");
    expect(app).toContain("<RadarFlightFollowHud");
  });

  it("drops orphan Regional Attention map-only projections without deleting server outcomes", () => {
    expect(existsSync(new URL("lib/operational-twin/regional-attention-ui.ts", root))).toBe(false);
    expect(existsSync(new URL("tests/regional-attention-ui.test.ts", root))).toBe(false);
    // Existing stored calibration/outcome data and internal validation remain untouched.
    expect(existsSync(new URL("lib/operational-twin/regional-attention-outcome.ts", root))).toBe(true);
    expect(existsSync(new URL("lib/operational-twin/regional-attention-graduation.ts", root))).toBe(true);
    const app = readFileSync(new URL("components/airradar-app.tsx", root), "utf8");
    expect(app).not.toContain("REGIONAL_ATTENTION_MAP");
  });

  it("does not expose removed navigation targets in main menus", () => {
    const shell = readFileSync(new URL("components/airradar-shell.tsx", root), "utf8");
    const palette = readFileSync(new URL("components/command-palette.tsx", root), "utf8");
    for (const route of matrix.phase1.removedStandalonePages) {
      if (route.includes(":")) continue;
      expect(shell.includes(`href="${route}"`) || shell.includes(`href: "${route}"`), route).toBe(false);
      expect(palette.includes(`href: "${route}"`), route).toBe(false);
    }
  });
});

describe("phase 18 retired API entrypoints", () => {
  it("does not expose standalone Time Machine, Intelligence or prediction APIs", () => {
    for (const path of [
      "app/api/time-machine/range/route.ts",
      "app/api/time-machine/window/route.ts",
      "app/api/intelligence/analytics/route.ts",
      "app/api/intelligence/events/route.ts",
      "app/api/operations/predictive/route.ts",
      "app/api/operations/situation/route.ts",
      "app/api/aircraft/[hex]/route-weather/route.ts",
      "app/api/aircraft/[hex]/weather-fusion/route.ts"
]) {
      expect(existsSync(new URL(path, root)), path).toBe(false);
    }
  });
  it("retains selected history, navigation, weather and notification transports", () => {
    for (const path of [
      "app/api/history/[hex]/route.ts",
      "app/api/navigation-integrity/current/route.ts",
      "app/api/ats/routes/route.ts",
      "app/api/weather/sigmet/route.ts",
      "app/api/weather/airport/[icao]/route.ts",
      "app/api/push/subscribe/route.ts",
      "app/api/push/vapid-public-key/route.ts",
    ]) expect(existsSync(new URL(path, root)), path).toBe(true);
  });
});
