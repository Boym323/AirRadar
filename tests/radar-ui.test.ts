import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTranslations } from "@/lib/i18n";
import {
  AIRPORT_VISIBILITY_ZOOM,
  airportVisibilityFilter,
  airportVisibilityTier,
  airportsWithinMapRadius,
  mapRadiusNmFromEnv,
  airportVisibleAtZoom,
  DEFAULT_AIRPORT_LAYER_VISIBILITY,
} from "@/lib/airport-visibility";
import { aircraftMarkerClassNames } from "@/lib/radar-ui";

const appSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const markerControllerSource = readFileSync(new URL("../lib/radar/aircraft-marker-controller.ts", import.meta.url), "utf8");
const aircraftTrafficRowSource = readFileSync(new URL("../components/aircraft-traffic-row.tsx", import.meta.url), "utf8");
const aircraftTrafficListSource = readFileSync(new URL("../components/aircraft-traffic-list.tsx", import.meta.url), "utf8");
const radarTrafficBrowserSource = readFileSync(new URL("../components/radar/radar-traffic-browser.tsx", import.meta.url), "utf8");
const radarDrawerDetailsSource = readFileSync(new URL("../components/radar/radar-drawer-details.tsx", import.meta.url), "utf8");
const radarMapLayerMenuSource = readFileSync(new URL("../components/radar/radar-map-layer-menu.tsx", import.meta.url), "utf8");
const radarDrawerInteractionsSource = readFileSync(new URL("../components/radar/use-radar-drawer-interactions.ts", import.meta.url), "utf8");
const trafficVirtualizationSource = readFileSync(new URL("../lib/radar/traffic-virtualization.ts", import.meta.url), "utf8");
const radarPerformanceSource = readFileSync(new URL("../lib/radar/performance-diagnostics.ts", import.meta.url), "utf8");
const liveSnapshotSchedulerSource = readFileSync(new URL("../lib/radar/live-snapshot-scheduler.ts", import.meta.url), "utf8");
const quickDetailSource = readFileSync(new URL("../components/aircraft-radar-quick-detail.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../components/airradar-shell.tsx", import.meta.url), "utf8");
const streamSource = readFileSync(new URL("../components/use-aircraft-stream.ts", import.meta.url), "utf8");
const datasetSource = readFileSync(new URL("../components/use-dataset-query.ts", import.meta.url), "utf8");
const atcSource = readFileSync(new URL("../components/relevant-atc-panel.tsx", import.meta.url), "utf8");
const aircraftDetailSource = readFileSync(new URL("../components/aircraft-detail-v2.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const atcTrafficSource = readFileSync(new URL("../components/atc-sector-traffic-panels.tsx", import.meta.url), "utf8");
const englishSource = readFileSync(new URL("../lib/i18n/en.ts", import.meta.url), "utf8");
const czechSource = readFileSync(new URL("../lib/i18n/cs.ts", import.meta.url), "utf8");
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
    expect(airportVisibilityFilter(7.4, { ...DEFAULT_AIRPORT_LAYER_VISIBILITY, showAirports: false })).toEqual(["==", "icao", "__airradar_hidden__"]);
    expect(airportVisibilityFilter(7.4, { ...DEFAULT_AIRPORT_LAYER_VISIBILITY, showSignificant: false, showSmall: false, showHeliports: false })).toEqual(["all", ["any", ["==", "icao", "__airradar_hidden__"], ["==", ["get", "important"], true]]]);
  });

  it("uses airport metadata before legacy prominence fallbacks", () => {
    expect(airportVisibilityTier({ iataCode: "PRG", name: "Prague" })).toBe("significant");
    expect(airportVisibilityTier({ iataCode: null, name: "Small strip" })).toBe("small");
    expect(airportVisibilityTier({ iataCode: null, name: "City Helipad" })).toBe("heliport");
    expect(airportVisibilityTier({ iataCode: null, name: "City Medical Base", type: "heliport" })).toBe("heliport");
    expect(airportVisibilityTier({ iataCode: null, name: "Regional Field", type: "medium_airport" })).toBe("significant");
    expect(airportVisibilityTier({ iataCode: null, name: "Small Strip", type: "small_airport" })).toBe("small");
    expect(airportVisibilityTier({ iataCode: null, name: "Scheduled Strip", type: "small_airport", scheduledService: true })).toBe("significant");
  });

  it("bounds the airport map source to the receiver's 250 NM operating area", () => {
    const nearby = { icaoCode: "NEAR", iataCode: null, name: "Nearby", city: null, country: null, latitude: 50.1, longitude: 14.3 };
    const far = { icaoCode: "FAR", iataCode: null, name: "Far", city: null, country: null, latitude: 55, longitude: 14.3 };
    expect(airportsWithinMapRadius([nearby, far], { lat: 50.1, lon: 14.3 }).map((airport) => airport.icaoCode)).toEqual(["NEAR"]);
  });

  it("validates the public map radius configuration", () => {
    expect(mapRadiusNmFromEnv("300")).toBe(300);
    expect(mapRadiusNmFromEnv("24")).toBe(250);
    expect(mapRadiusNmFromEnv("not-a-number")).toBe(250);
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
    expect(shellSource).toContain("mobile-bottom-nav");
    expect(shellSource).toContain('href="/alerts"');
    expect(shellSource).toContain('href="/recap/daily"');
    expect(globalCss).toContain(".mobile-bottom-more > div");
  });

  it("keeps the five-item mobile navigation and compact source counters", () => {
    expect(globalCss).toMatch(/\.mobile-bottom-nav\s*\{[^}]*grid-template-columns:\s*repeat\(5/);
    expect(globalCss).not.toMatch(/\.mobile-bottom-nav\s*\{[^}]*grid-template-columns:\s*repeat\(4/);
    expect(globalCss).toMatch(/\.source-counter-strip\s*\{[^}]*display:\s*grid/);
    expect(globalCss).toMatch(/\.source-counter-strip\s*\{[^}]*repeat\(4/);
  });

  it("uses one layers icon and an explicit ATC history stroke", () => {
    expect(globalCss).not.toContain('.map-layers > summary::before { content: "☷"');
    expect(globalCss).toMatch(/\.atc-history-series[^}]*stroke:/);
    expect(atcTrafficSource).toContain('<path key={i} d={path} fill="none" stroke="currentColor" />');
    expect(atcTrafficSource).toContain('aria-label={t.atc.historyChart}');
  });

  it("keeps ATC UI copy translated and source badges compact", () => {
    for (const key of ["verticalTraffic", "trafficHistory", "showHistory", "sectorFlows", "loadingHistory"]) {
      expect(englishSource).toContain(`${key}:`);
      expect(czechSource).toContain(`${key}:`);
    }
    expect(atcTrafficSource).not.toContain("ATC Vertical Traffic");
    expect(atcTrafficSource).not.toContain("Traffic history");
    expect(atcTrafficSource).not.toContain("Show history");
    expect(appSource).not.toContain("classifyAircraftSource(aircraft)} · {aircraftPositionSourceLabel");
    expect(aircraftTrafficRowSource).toContain("aircraftSourceLabel(aircraft)");
  });

  it("keeps MapLibre in control of DOM marker positioning", () => {
    const aircraftRule = globalCss.match(/\.aircraft-marker\s*\{([^}]*)\}/)?.[1] ?? "";
    const receiverRule = globalCss.match(/\.receiver-marker\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(maplibreCss).toContain(".maplibregl-marker");
    expect(maplibreCss).toMatch(/\.maplibregl-marker\{[^}]*position:absolute/);
    expect(aircraftRule).not.toMatch(/\bposition\s*:/);
    expect(globalCss).toMatch(/\.aircraft-marker-visual\s*\{[^}]*position:\s*relative/);
    expect(aircraftRule).not.toMatch(/\btransform\s*:/);
    expect(receiverRule).not.toMatch(/\bposition\s*:/);
    expect(receiverRule).not.toMatch(/\btransform\s*:/);
  });

  it("keeps aircraft visual effects off the MapLibre root", () => {
    expect(globalCss).toContain(".aircraft-marker.selected .aircraft-marker-visual::before");
    expect(globalCss).toContain("position: absolute");
    expect(globalCss).toMatch(/\.aircraft-marker:hover \.aircraft-plane[^}]*transform:\s*scale/);
    expect(globalCss).toMatch(/\.aircraft-marker\.selected \.aircraft-plane[^}]*transform:\s*scale/);
    expect(appSource).toContain("const target: [number, number] = [aircraft.lon, aircraft.lat]");
    expect(appSource).toContain("setLngLat([receiver.lon, receiver.lat])");
  });

  it("keeps tar1090 icons colorable and map motion visually continuous", () => {
    expect(markerControllerSource).toContain("--aircraft-icon-mask");
    expect(globalCss).toContain("mask-image: var(--aircraft-icon-mask)");
    expect(globalCss).toContain("background: currentColor");
    expect(globalCss).not.toMatch(/\.aircraft-plane \.aircraft-glyph-asset[^}]*filter:/);
    expect(appSource).toContain("aircraftMarkersRef.current.get(selectedHex)?.marker.getLngLat()");
    expect(appSource).toContain("confirmedInterpolationDurationMs(");
    expect(appSource).toContain("visualHeadingForConfirmedPosition");
    expect(appSource).toContain("previous.visualHeading");
    expect(appSource).toContain("visualHeading: visualHeadingForConfirmedPosition");
    expect(appSource).toContain("correction && previousInterpolationActive ? previous.visualHeading : null");
    expect(appSource).toContain("visualHeadingForConfirmedPosition({ lon: target[0], lat: target[1] }, source, nextHistory)");
    expect(appSource).toContain("allowPrediction: false");
    expect(appSource).not.toContain("predictedPosition(");
    expect(appSource).toContain("motionRenderIntervalMs(animationJobs.size)");
    expect(appSource).toContain("job === selectedAnimationJob || bulkFrameDue || renderFinalCorrection");
    expect(appSource).toContain("if (!renderThisFrame)");
    expect(appSource).toContain('map.on("zoom", updateLiveZoomLabels)');
    expect(appSource).toContain('map.on("move", scheduleLabelCollision)');
  });

  it("bounds React and layout work for dense live traffic", () => {
    expect(appSource).not.toContain('from "zod"');
    expect(appSource).toContain("aircraftSearchTextCache");
    expect(appSource).toContain("watchlistedHexes");
    expect(appSource).toContain("default view avoids a redundant O(n log n) sort");
    expect(radarTrafficBrowserSource).toContain("<AircraftTrafficList");
    expect(trafficVirtualizationSource).toContain("AIRCRAFT_TRAFFIC_VIRTUALIZATION_THRESHOLD = 40");
    expect(trafficVirtualizationSource).toContain("AIRCRAFT_TRAFFIC_OVERSCAN_ROWS = 6");
    expect(aircraftTrafficListSource).toContain("window.requestAnimationFrame(update)");
    expect(aircraftTrafficListSource).toContain("aircraft.slice(visibleRange.start, visibleRange.end)");
    expect(aircraftTrafficListSource).toContain("memo(AircraftTrafficListComponent)");
    expect(aircraftTrafficRowSource).toContain("memo(");
    expect(aircraftTrafficRowSource).toContain("previous.aircraft === next.aircraft");
    expect(aircraftTrafficRowSource).toContain("previous.selected === next.selected");
    expect(globalCss).toMatch(/\.aircraft-list-virtual-row\s*\{[^}]*position:\s*absolute/);
    expect(globalCss).toMatch(/\.aircraft-list-virtual-row > \.aircraft-row\s*\{[^}]*min-height:\s*0/);
    expect(globalCss).toMatch(/\.aircraft-row\s*\{[^}]*content-visibility:\s*auto/);
    expect(globalCss).toMatch(/\.aircraft-row\s*\{[^}]*contain-intrinsic-size:\s*62px/);
  });

  it("keeps radar presentation and drawer lifecycles outside the map owner", () => {
    expect(appSource).toContain("<RadarTrafficBrowser");
    expect(appSource).toContain("<RadarDrawerDetails");
    expect(appSource).toContain("<RadarMapLayerMenu");
    expect(appSource).toContain("useRadarDrawerInteractions({");
    expect(appSource).not.toContain("function OgnDetailContent");
    expect(appSource).not.toContain("watchlistKind");
    expect(appSource).not.toContain("intelligenceOpened");
    expect(appSource).not.toContain("logbookOpened");
    expect(radarTrafficBrowserSource).toContain("const [watchlistKind, setWatchlistKind]");
    expect(radarTrafficBrowserSource).toContain("<RelevantAtcPanel");
    expect(radarDrawerDetailsSource).toContain("<AircraftRadarQuickDetail");
    expect(radarMapLayerMenuSource).toContain('data-testid="map-layer-atc"');
    expect(radarDrawerInteractionsSource).toContain('window.addEventListener("keydown", handleKeyboardShortcut, true)');
  });

  it("keeps performance diagnostics opt-in and off the default hot path", () => {
    expect(appSource).toContain('import("@/lib/radar/performance-diagnostics")');
    expect(appSource).toContain("startRadarPerformanceDiagnostics(window.location.search)");
    expect(appSource).toContain('window.dispatchEvent(new Event("airradar:performance-diagnostics-ready"))');
    expect(aircraftTrafficListSource).toContain('window.addEventListener("airradar:performance-diagnostics-ready"');
    expect(appSource).toContain("performanceDiagnostics.recordAnimationFrame(");
    expect(appSource).toContain("performanceDiagnostics.recordLabelCollision(");
    expect(aircraftTrafficListSource).toContain("recordTrafficList(");
    expect(radarPerformanceSource).toContain('get("perfDiagnostics") !== "1"');
    expect(appSource).toContain("const frameStartedAt = performanceDiagnostics ? performance.now() : 0");
    expect(radarPerformanceSource).toContain("__airradarPerformanceDiagnostics");
    expect(radarPerformanceSource).toContain('includes("longtask")');
  });

  it("keeps high-frequency aircraft deltas off the main React render cadence", () => {
    expect(liveSnapshotSchedulerSource).toContain("RADAR_REACT_SNAPSHOT_INTERVAL_MS = 200");
    expect(appSource).toContain("liveSnapshotRef.current = next");
    expect(appSource).toContain("scheduleAircraftMapSync()");
    expect(appSource).toContain("if (document.hidden)");
    expect(appSource).toContain("aircraftMapSyncRef.current?.(false)");
    expect(appSource).toContain("reactSnapshotSchedulerRef.current?.push(next, change.full)");
    expect(appSource).toContain("const syncAircraftMap = useCallback");
    expect(appSource).toContain("const liveSnapshot = liveSnapshotRef.current");
    expect(appSource).toContain("aircraftMapSyncRef.current = syncAircraftMap");
    expect(appSource).not.toContain("setSnapshot(next)");
  });

  it("fades the desktop drawer while removing closed contents from overflow geometry", () => {
    const drawerRules = [...globalCss.matchAll(/\.sidebar(?:\.drawer-closed)?\s*\{([^}]*)\}/g)].map((match) => match[1] ?? "");
    const closedRule = drawerRules.find((rule) => rule.includes("visibility: hidden")) ?? "";
    expect(closedRule).toContain("visibility: hidden");
    expect(closedRule).toContain("opacity: 0");
    expect(closedRule).not.toContain("translateX(100%)");
    expect(closedRule).not.toContain("scaleX(0)");
    expect(globalCss).toContain("transition: opacity 150ms ease");
    expect(globalCss).toContain("visibility 0s linear 150ms");
    expect(globalCss).toMatch(/@media \(min-width: 821px\)[\s\S]*?\.sidebar\.drawer-closed > \*\s*\{\s*display: none;/);
  });

  it("keeps aircraft rotation on the rotator and labels outside it", () => {
    expect(markerControllerSource).toContain('rotationAlignment: "viewport"');
    expect(markerControllerSource).toContain('pitchAlignment: "viewport"');
    expect(markerControllerSource).toContain('const rotator = document.createElement("div")');
    expect(markerControllerSource).toContain('visual.className = "aircraft-marker-visual"');
    expect(markerControllerSource).toContain('name.startsWith("maplibregl-")');
    expect(markerControllerSource).toContain('rotator.className = "aircraft-plane-rotator"');
    expect(markerControllerSource).toContain('label.className = "aircraft-label"');
    expect(appSource).not.toContain("setRotation(");
    expect(appSource).not.toContain('root.querySelector<HTMLElement>(".aircraft-plane")');
    expect(globalCss).toContain(".aircraft-label[data-placement=\"right\"]");
    expect(globalCss).toContain(".aircraft-label[data-collision-hidden=\"true\"]");
  });

  it("shows seen-by and position provenance as separate signals", () => {
    expect(`${appSource}\n${quickDetailSource}`).toContain("label={t.aircraft.seenBy}");
    expect(appSource).toContain("aircraft.provenance?.positionOrigin");
    expect(`${appSource}\n${quickDetailSource}`).toContain("aircraft.provenance?.positionSource");
    expect(appSource).not.toContain("`${aircraftDataSourceLabel(aircraft)} · ${aircraft.source}`");
  });

  it("keeps ATC collapsed/expanded state accessible and mobile-collapsed by default", () => {
    expect(atcSource).toContain("aria-expanded={expanded}");
    expect(appSource).toContain("expanded={!mobileCompact}");
    expect(appSource).toContain("const [mobileCompact, setMobileCompact] = useState(true)");
  });

  it("exposes the layer state and keeps aircraft detail loading bounded", () => {
    expect(radarMapLayerMenuSource).toContain("checked={showAircraft}");
    expect(appSource).toContain('root.className = "ogn-marker"');
    expect(appSource).toContain('root.style.visibility = visible ? "visible" : "hidden"');
    expect(globalCss).toContain(".ogn-marker");
    expect(radarMapLayerMenuSource).toContain("checked={showAirports}");
    expect(radarMapLayerMenuSource).toContain("checked={showAtc}");
    expect(appSource).toContain("useDatasetQuery");
    expect(appSource).toContain('url: "/api/airspace/activity"');
    expect(appSource).toContain('url: "/api/ats/routes?view=map"');
    expect(datasetSource).toContain('"retrying"');
    expect(datasetSource).toContain("retry-after");
    expect(datasetSource).toContain("signal");
    expect(appSource).toContain("mapReplayRef");
    expect(appSource).toContain("/api/aircraft/${encodeURIComponent(selectedHex)}");
    expect(appSource).toContain("/api/history/${encodeURIComponent(selectedHex)}");
  });

  it("shows available receiver telemetry in technical aircraft details", () => {
    expect(quickDetailSource).toContain("label={t.aircraft.bearing}");
    expect(quickDetailSource).toContain("label={t.aircraft.rssi}");
    expect(quickDetailSource).toContain("label={t.aircraft.seenPosition}");
    expect(quickDetailSource).toContain("aircraft.seenPosSeconds");
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
    expect(radarDrawerInteractionsSource).toContain('event.key.toLowerCase() === "f"');
    expect(appSource).toContain("setSelectedHex(null);");
    expect(radarDrawerInteractionsSource).toContain("isEditableTarget(event.target)");
  });

  it("keeps search shortcuts source-independent while filters stay ADS-B-only", () => {
    const searchBranch = appSource.indexOf('if (shortcut === "search")');
    const filterBranch = appSource.indexOf('else if (shortcut === "filters" && trafficSource === "adsb")');
    const ognBranch = appSource.indexOf('else if (trafficSource === "ogn")');
    expect(searchBranch).toBeGreaterThan(-1);
    expect(appSource.slice(searchBranch, filterBranch)).toContain("searchInputRef.current?.focus()");
    expect(filterBranch).toBeGreaterThan(searchBranch);
    expect(ognBranch).toBeGreaterThan(filterBranch);
    expect(appSource.slice(ognBranch, ognBranch + 120)).toContain("setFiltersOpen(false)");
  });

  it("keeps selection details while hiding filtered map overlays and supports a client reset", () => {
    expect(appSource).toContain("filterAircraftForMap(snapshot.aircraft, mapFilters)");
    expect(appSource).toContain("const selectedAircraftVisible = Boolean(selectedAircraft && filteredAircraft.some");
    expect(appSource).toContain("selectedTrailForMap = selectedConfirmedTrailRef.current");
    expect(appSource).toContain("selectedAircraftVisible ? selectedAircraftInSnapshot");
    expect(appSource).toContain('map.setLayoutProperty(layer, "visibility", selectedAircraftVisible ? "visible" : "none")');
    expect(appSource).toContain('map.setLayoutProperty(layer, "visibility", selectedAircraftVisible && showAirports ? "visible" : "none")');
    expect(appSource).toContain("resetMapFilters");
    expect(appSource).toContain("setMapFilters(DEFAULT_MAP_AIRCRAFT_FILTERS)");
  });

  it("loads ATS data only for the explicit ATS layer or ATS point focus", () => {
    expect(appSource).toContain("enabled: showAtsRoutes || Boolean(atsPointFocus)");
    expect(appSource).not.toContain("selectedHasRouteData");
    expect(appSource).not.toContain("analyzePublishedRoute");
    expect(appSource).not.toContain("ROUTE_INTELLIGENCE_SOURCE_ID");
    expect(appSource).not.toContain("routeIntelligenceView");
    expect(appSource).toContain("selectedRoute?.originAirport?.icaoCode ?? selectedRoute?.origin");
    expect(appSource).toContain("selectedRoute?.destinationAirport?.icaoCode ?? selectedRoute?.destination");
  });

  it("keeps CZ and EN layer labels in the existing i18n dictionaries", () => {
    expect(getTranslations("cs").layers).toMatchObject({ aircraft: "Letadla", airports: "Letiště", atc: "ATC", heliports: "Heliporty" });
    expect(getTranslations("en").layers).toMatchObject({ aircraft: "Aircraft", airports: "Airports", atc: "ATC", heliports: "Heliports" });
  });

  it("keeps responsive map geometry driven by measured occlusions", () => {
    expect(appSource).toContain("radarContentRef");
    expect(appSource).toContain("sidebarRef");
    expect(appSource).toContain("currentRadarPadding()");
    expect(appSource).toContain("radarBottomControlOffset(layout)");
    expect(appSource).not.toContain("window.innerHeight * 0.46");
    expect(appSource).not.toContain("panelHeight + 40");
    expect(globalCss).toContain("--radar-map-control-bottom");
    expect(globalCss).toContain(".radar-content:has(.sidebar.drawer-closed) .traffic-trigger");
    expect(globalCss).toMatch(/\.sidebar\.drawer-closed\s*\{[^}]*visibility:\s*hidden[^}]*pointer-events:\s*none/);
  });

  it("keeps contextual map controls in an explicit second overlay row", () => {
    expect(appSource).toContain('className="map-overlay-context-row"');
    expect(globalCss).toMatch(/\.map-overlay-primary\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto/);
    expect(globalCss).toContain(".map-overlay-context-row .weather-radar-timeline");
    const primaryStart = appSource.indexOf('<div className="map-overlay-primary">');
    const contextRow = appSource.indexOf('className="map-overlay-context-row"');
    expect(primaryStart).toBeGreaterThan(-1);
    expect(contextRow).toBeGreaterThan(primaryStart);
  });

  it("keeps the layer overlay drawer-aware without changing mobile placement", () => {
    expect(globalCss).toContain("--radar-drawer-width");
    expect(globalCss).toContain(".radar-content:has(.drawer-traffic) .map-overlay");
    expect(globalCss).toContain("right: calc(var(--radar-drawer-width) + 64px)");
    expect(globalCss).toContain("@media (min-width: 821px)");
    expect(globalCss).toContain(".detail-panel .close-button { display: none; }");
  });
});
