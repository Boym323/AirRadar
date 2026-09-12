import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTranslations } from "@/lib/i18n";
import {
  AIRPORT_VISIBILITY_ZOOM,
  airportVisibilityFilter,
  airportVisibilityTier,
  airportVisibleAtZoom,
  DEFAULT_AIRPORT_LAYER_VISIBILITY,
} from "@/lib/airport-visibility";
import { aircraftMarkerClassNames } from "@/lib/radar-ui";

const appSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const streamSource = readFileSync(new URL("../components/use-aircraft-stream.ts", import.meta.url), "utf8");
const atcSource = readFileSync(new URL("../components/relevant-atc-panel.tsx", import.meta.url), "utf8");
const aircraftDetailSource = readFileSync(new URL("../components/aircraft-detail-v2.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const maplibreCss = readFileSync(new URL("../node_modules/maplibre-gl/dist/maplibre-gl.css", import.meta.url), "utf8");

describe("radar UI polish helpers", () => {
  it("changes airport visibility deterministically by zoom", () => {
    expect(airportVisibleAtZoom("significant", 3)).toBe(true);
    expect(airportVisibleAtZoom("small", AIRPORT_VISIBILITY_ZOOM.small - 0.1)).toBe(false);
    expect(airportVisibleAtZoom("small", AIRPORT_VISIBILITY_ZOOM.small)).toBe(true);
    expect(airportVisibleAtZoom("heliport", AIRPORT_VISIBILITY_ZOOM.heliport - 0.1)).toBe(false);
    expect(airportVisibleAtZoom("heliport", AIRPORT_VISIBILITY_ZOOM.heliport)).toBe(false);
    expect(airportVisibleAtZoom("heliport", AIRPORT_VISIBILITY_ZOOM.heliport, { ...DEFAULT_AIRPORT_LAYER_VISIBILITY, showHeliports: true })).toBe(true);
    expect(airportVisibilityFilter(7.4)).toEqual(airportVisibilityFilter(7.4));
  });

  it("uses only safe DTO signals for airport prominence", () => {
    expect(airportVisibilityTier({ iataCode: "PRG", name: "Prague" })).toBe("significant");
    expect(airportVisibilityTier({ iataCode: null, name: "Small strip" })).toBe("small");
    expect(airportVisibilityTier({ iataCode: null, name: "City Helipad" })).toBe("heliport");
  });

  it("keeps selected, watchlisted and emergency aircraft visually distinct", () => {
    expect(aircraftMarkerClassNames({ selected: true, watchlisted: true, emergency: true })).toEqual([
      "aircraft-marker",
      "selected",
      "watchlisted",
      "emergency",
    ]);
  });

  it("keeps all primary routes reachable from the mobile radar header", () => {
    expect(appSource).toContain("mobile-main-nav");
    expect(appSource).toContain('href="/alerts"');
    expect(appSource).toContain('href="/recap/daily"');
    expect(globalCss).toContain(".mobile-main-nav > nav");
  });

  it("keeps MapLibre in control of DOM marker positioning", () => {
    const aircraftRule = globalCss.match(/\.aircraft-marker\s*\{([^}]*)\}/)?.[1] ?? "";
    const receiverRule = globalCss.match(/\.receiver-marker\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(maplibreCss).toContain(".maplibregl-marker");
    expect(maplibreCss).toMatch(/\.maplibregl-marker\{[^}]*position:absolute/);
    expect(aircraftRule).not.toMatch(/\bposition\s*:/);
    expect(aircraftRule).not.toMatch(/\btransform\s*:/);
    expect(receiverRule).not.toMatch(/\bposition\s*:/);
    expect(receiverRule).not.toMatch(/\btransform\s*:/);
  });

  it("keeps aircraft visual effects off the MapLibre root", () => {
    expect(globalCss).toContain(".aircraft-marker.selected::before");
    expect(globalCss).toContain("position: absolute");
    expect(globalCss).toMatch(/\.aircraft-marker:hover \.aircraft-plane[^}]*transform:\s*scale/);
    expect(globalCss).toMatch(/\.aircraft-marker\.selected \.aircraft-plane[^}]*transform:\s*scale/);
    expect(appSource).toContain("const target: [number, number] = [aircraft.lon, aircraft.lat]");
    expect(appSource).toContain("setLngLat([receiver.lon, receiver.lat])");
  });

  it("shows seen-by and position provenance as separate signals", () => {
    expect(appSource).toContain("label={t.aircraft.seenBy}");
    expect(appSource).toContain("aircraft.provenance?.positionOrigin");
    expect(appSource).toContain("aircraft.provenance?.positionSource");
    expect(appSource).not.toContain("`${aircraftDataSourceLabel(aircraft)} · ${aircraft.source}`");
  });

  it("keeps ATC collapsed/expanded state accessible and mobile-collapsed by default", () => {
    expect(atcSource).toContain("aria-expanded={expanded}");
    expect(appSource).toContain("expanded={!mobileCompact}");
    expect(appSource).toContain("const [mobileCompact, setMobileCompact] = useState(true)");
  });

  it("exposes the layer state and keeps aircraft detail loading bounded", () => {
    expect(appSource).toContain("checked={showAircraft}");
    expect(appSource).toContain('root.className = "ogn-marker"');
    expect(appSource).toContain('root.style.visibility = visible ? "visible" : "hidden"');
    expect(globalCss).toContain(".ogn-marker");
    expect(appSource).toContain("checked={showAirports}");
    expect(appSource).toContain("checked={showAtc}");
    expect(appSource.match(/\bfetch\(/g)).toHaveLength(9);
    expect(appSource).toContain('fetch("/api/airspace/activity", { cache: "no-store" })');
    expect(appSource).toContain("setAirspaceActivityRetry((value) => value + 1)");
    expect(appSource).toContain("setAtsRoutesRetry((value) => value + 1)");
    expect(appSource).toContain("INTELLIGENCE_RETRY_MS = 30_000");
    expect(appSource).not.toContain("airspaceActivityRequestedRef");
    expect(appSource).toContain("/api/aircraft/${encodeURIComponent(selectedHex)}");
    expect(appSource).toContain("/api/history/${encodeURIComponent(selectedHex)}");
  });

  it("plots aircraft altitude using recorded time instead of sample index", () => {
    expect(aircraftDetailSource).toContain("Date.parse(point.recordedAt) - firstTimestamp");
    expect(aircraftDetailSource).toContain("lastTimestamp - firstTimestamp");
    expect(aircraftDetailSource).not.toContain("index / (chartPoints.length - 1)");
  });

  it("keeps independent bounded SSE streams and does not add trail polling", () => {
    expect(`${appSource}\n${streamSource}`.match(/new EventSource\(/g)).toHaveLength(2);
    expect(appSource).not.toContain("setInterval(");
    expect(appSource).toContain("selected-trail-line");
    expect(appSource).toContain('geometry: { type: "LineString"');
  });

  it("keeps radar keyboard shortcuts out of editable controls", () => {
    expect(appSource).toContain("searchInputRef.current?.focus()");
    expect(appSource).toContain('event.key.toLowerCase() === "f"');
    expect(appSource).toContain("setSelectedHex(null);");
    expect(appSource).toContain("isEditableTarget(event.target)");
  });

  it("keeps selection details while hiding filtered map overlays and supports a client reset", () => {
    expect(appSource).toContain("filterAircraftForMap(snapshot.aircraft, mapFilters)");
    expect(appSource).toContain("const selectedAircraftVisible = Boolean(selectedAircraft && filteredAircraft.some");
    expect(appSource).toContain("selectedAircraftVisible ? selectedTrail");
    expect(appSource).toContain("selectedAircraftVisible ? selectedAircraftInSnapshot");
    expect(appSource).toContain('map.setLayoutProperty(layer, "visibility", selectedAircraftVisible ? "visible" : "none")');
    expect(appSource).toContain("resetMapFilters");
    expect(appSource).toContain("setMapFilters(DEFAULT_MAP_AIRCRAFT_FILTERS)");
  });

  it("keeps CZ and EN layer labels in the existing i18n dictionaries", () => {
    expect(getTranslations("cs").layers).toMatchObject({ aircraft: "Letadla", airports: "Letiště", atc: "ATC", heliports: "Heliporty" });
    expect(getTranslations("en").layers).toMatchObject({ aircraft: "Aircraft", airports: "Airports", atc: "ATC", heliports: "Heliports" });
  });
});
