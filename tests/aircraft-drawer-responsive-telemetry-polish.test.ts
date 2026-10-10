import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("aircraft drawer responsive telemetry polish", () => {
  const quick = read("components/aircraft-radar-quick-detail.tsx");
  const drawer = read("components/radar/radar-drawer-details.tsx");
  const css = read("app/radar-aircraft-panel.css");
  const polish = css.slice(css.indexOf("Aircraft drawer polish: never overlay"));

  it("keeps all six actions visible within the actual drawer width", () => {
    expect(polish).toContain("container: aircraft-drawer-header / inline-size");
    expect(polish).toContain("@container aircraft-drawer-header (max-width: 270px)");
    expect(polish).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(polish).not.toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(polish).toContain("overflow: visible");
    const actionBlock = polish.split(".sidebar.drawer-aircraft .aircraft-v5-quick-actions .aircraft-quick-action {")[1]?.split("}")[0];
    expect(actionBlock).toContain("white-space: normal");
    expect(actionBlock).toContain("overflow-wrap: normal");
    expect(actionBlock).toContain("word-break: normal");
    expect(actionBlock).not.toContain("overflow-wrap: anywhere");
    expect(quick).toContain('data-testid="aircraft-v5-quick-actions"');
    expect(quick).toContain("t.aircraftQuickV5.followMap");
    expect(quick).toContain("t.aircraft.centerOnAircraft");
    expect(quick).toContain("t.aircraft.showFlightHistory");
    expect(quick).toContain("t.aircraftQuickV5.share");
    expect(quick).toContain("t.aircraftQuickV5.alerts");
    expect(quick).toContain("t.aircraft.fullDetail");
  });

  it("keeps the full live altitude, speed, track and vertical rate visible in a narrow desktop drawer", () => {
    const metricsBlock = polish.split(".sidebar.drawer-aircraft .aircraft-quick-header-hero .radar-traffic-hero-metrics {")[1]?.split("}")[0];
    const metricsValueBlock = polish.split(".sidebar.drawer-aircraft .aircraft-quick-header-hero .radar-traffic-hero-metrics strong {")[1]?.split("}")[0];
    expect(metricsBlock).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(metricsBlock).toContain("min-width: 0");
    expect(metricsValueBlock).toContain("white-space: nowrap");
    expect(metricsValueBlock).toContain("font-size: var(--font-size-base)");
    expect(polish).toContain(".radar-traffic-hero-metrics > div:nth-child(odd)");
    expect(quick).toContain("altitude={formatAltitude(aircraft.altitude)}");
    expect(quick).toContain("speed={formatSpeed(aircraft.groundSpeed)}");
    expect(quick).toContain("track={formatTrack(aircraft.track)}");
    expect(quick).toContain("verticalRate={compactVerticalRateLabel(aircraft.verticalRate)}");
  });

  it("guards real text geometry in the production browser smoke", () => {
    const browserGate = read("scripts/production-gates.mjs");
    expect(browserGate).toContain("aircraftDrawerLayout");
    expect(browserGate).toContain("range.getBoundingClientRect()");
    expect(browserGate).toContain("twoMetricRows");
    expect(browserGate).toContain("overflowingValues");
    expect(browserGate).toContain("overflowingActions");
  });

  it("does not overlay scrollable tabs with a sticky aircraft header", () => {
    expect(polish).toContain(".sidebar.drawer-aircraft .aircraft-quick-header");
    expect(polish).toContain("position: relative");
    expect(polish).toContain("z-index: auto");
    expect(polish).toContain(".sidebar.drawer-aircraft .aircraft-quick-tabs");
    expect(polish).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(polish).toContain("overflow-x: visible");
    expect(drawer).toContain('key={selectedOgnTarget ? `ogn-${selectedOgnTarget.id}` : selectedIdentity}');
  });

  it("gates extended data behind user action while preserving live basic telemetry", () => {
    expect(quick).toContain('data-testid="aircraft-quick-telemetry-more"');
    expect(quick).toContain("<summary>{t.aircraft.advancedTelemetry}</summary>");
    expect(quick).toContain("onToggle={(event) => setAdvancedTelemetryOpen(event.currentTarget.open)}");
    expect(quick).toContain("advancedTelemetryOpen && (telemetryAircraft");
    expect(quick).toContain("<AircraftAdsbTelemetry aircraft={telemetryAircraft} compact />");
    expect(quick).toContain("const position = aircraft.lat === null");
    expect(quick).toContain('className="aircraft-quick-detail-grid"');
  });

  it("avoids short-lived missing ADS-B source flicker without mislabelling cached values as live", () => {
    expect(quick).toContain("lastTelemetry.seenAt + 10_000");
    expect(quick).toContain("lastTelemetry?.hex === aircraft.icaoHex");
    expect(quick).toContain("window.clearTimeout(timer)");
    expect(quick).toContain('className="aircraft-quick-telemetry-stale" role="status"');
    expect(quick).toContain("{t.intelligence.stale}");
    expect(polish).toContain(".aircraft-quick-telemetry-stale");
    expect(polish).toContain(".aircraft-quick-telemetry .aircraft-quick-detail-grid");
  });
});
