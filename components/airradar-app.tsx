"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { FilterSpecification, GeoJSONSource, ImageSource, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import {
  formatAtcFrequency,
  formatAtcNote,
  formatAtcService,
  formatDateTime,
  formatNumber,
  t,
  visibleAircraft,
} from "@/lib/i18n";
import { shouldRecenterOnReceiver } from "@/lib/receiver";
import type { AircraftView, CoverageMode, PublicReceiverPosition, PublicStateSnapshot, ReceiverPosition, TrailPoint } from "@/lib/aircraft/types";
import { positionObservedAt } from "@/lib/aircraft/source-merge";
import { boundTrailPoints, selectedTrail } from "@/lib/aircraft/trail";
import { aircraftMapLabelLevel, trafficMapLabelText } from "@/lib/aircraft/map-labels";
import type { Airport } from "@/lib/airports/types";
import type { AtcDataResponse } from "@/lib/atc/types";
import { matchesAircraftRule, normalizeAircraftRuleType, type AircraftMatchRule } from "@/lib/aircraft/watchlist";
import type { AircraftQuickDetailResponse, HistoryResponse } from "@/lib/server/history";
import { aircraftSigmetContext } from "@/lib/weather/aircraft-sigmet-context";
import { WEATHER_RADAR_BOUNDS } from "@/lib/server/weather-radar/types";
import type { AircraftWeatherMapObservation } from "@/components/aircraft-weather-panel";
import type { OgnStateSnapshot } from "@/lib/ogn/types";
import { isOgnDuplicateOfAircraft } from "@/lib/ogn/deduplication";
import { airportVisibilityFilter, DEFAULT_AIRPORT_LAYER_VISIBILITY, type AirportLayerVisibility, AIRPORT_MAP_RADIUS_NM } from "@/lib/airport-visibility";
import type { AircraftColorMode } from "@/lib/aircraft/color-mode";
import {
  createRouteAirportGeoJSON,
  createRouteGeoJSON,
  createRouteIntelligenceGeoJSON,
  emptyRouteIntelligenceGeoJSON,
  ROUTE_INTELLIGENCE_COMPLETED_LAYER_ID,
  ROUTE_INTELLIGENCE_CURRENT_LAYER_ID,
  ROUTE_INTELLIGENCE_REMAINING_LAYER_ID,
  ROUTE_INTELLIGENCE_SOURCE_ID,
  ROUTE_V2_AIRPORT_CIRCLE_LAYER_ID,
  ROUTE_V2_AIRPORT_LABEL_LAYER_ID,
  ROUTE_V2_AIRPORT_SOURCE_ID,
  ROUTE_V2_COMPLETED_LAYER_ID,
  ROUTE_V2_REMAINING_LAYER_ID,
  ROUTE_V2_SOURCE_ID,
} from "@/lib/route-visualization";
import { AirRadarTopbar, MobileBottomNav, RadarNavRail, UtcClock } from "@/components/airradar-shell";
import { RadarTrafficBrowser } from "@/components/radar/radar-traffic-browser";
import { RadarDrawerDetails } from "@/components/radar/radar-drawer-details";
import { RadarMapLayerMenu } from "@/components/radar/radar-map-layer-menu";
import { RadarQuickActions } from "@/components/radar/radar-quick-actions";
import { RadarMultiAircraft } from "@/components/radar/radar-multi-aircraft";
import { addMultiAircraft, removeMultiAircraft, MULTI_AIRCRAFT_LIMIT } from "@/lib/radar/multi-aircraft";
import { radarWeatherPresentation } from "@/lib/radar/weather-layer-presentation";
import { createAtcGeoJSON, createNavigationIntegrityGeoJSON } from "@/lib/radar/airspace-geojson";
import { createAirportGeoJSON, createMetarGeoJSON, createAircraftWeatherGeoJSON } from "@/lib/radar/map-context-geojson";
import { registerRadarAviationLayers } from "@/lib/radar/aviation-map-layers";
import { registerRadarBaseOverlays } from "@/lib/radar/base-map-overlays";
import { RadarPresetMenu } from "@/components/radar/radar-preset-menu";
import { RadarFlightFollowHud } from "@/components/radar/radar-flight-follow-hud";
import { useRadarDrawerInteractions, type RadarDrawerState, type RadarTrafficSource as TrafficSource } from "@/components/radar/use-radar-drawer-interactions";
import { useRadarLiveAircraft } from "@/components/radar/use-radar-live-aircraft";
import { useRadarAircraftContext } from "@/components/radar/use-radar-aircraft-context";
import { useRadarOgnStream } from "@/components/radar/use-radar-ogn-stream";
import { EMPTY_SIGMET_DATA, useRadarWeatherContext } from "@/components/radar/use-radar-weather-context";
import { useRadarNavDataContext } from "@/components/radar/use-radar-nav-data-context";
import { useSelectedRoute } from "@/components/radar/use-selected-route";
import { IconButton, Panel, StatusBadge, UiIcon } from "@/components/ui-primitives";
import { useDatasetQuery } from "@/components/use-dataset-query";
import { createMapDatasetReplay } from "@/lib/map-layer-reliability";
import { createAviationNavGeoJSON } from "@/lib/navigation-data/map";
import { routeReferencePointIds } from "@/lib/navigation-data/route-reference";
import { configureMapLibreWorker } from "@/lib/maplibre-worker";
import {
  DEFAULT_MAP_AIRCRAFT_FILTERS,
  filterAircraftForMap,
  isMapAircraftFilterActive,
  type MapAircraftFilters,
} from "@/lib/aircraft/map-filters";
import {
  createAircraftMarkerHandle,
  setAircraftMarkerHeading,
  setAircraftMarkerZoom,
  updateAircraftMarkerHandle,
  type AircraftMarkerHandle,
} from "@/lib/radar/aircraft-marker-controller";
import { createLabelCollisionScheduler } from "@/lib/radar/aircraft-label-collision";
import { applyAircraftLabelCollisionLayout } from "@/lib/radar/aircraft-label-controller";
import { setOgnDomLabel, type OgnMarkerHandle } from "@/lib/radar/ogn-marker-controller";
import { parseNavPointFocus } from "@/lib/radar/navigation-focus";
import { radarBottomControlOffset, radarCameraPadding, type RadarMapPadding } from "@/lib/radar/layout";
import type { RadarPerformanceDiagnosticsSession } from "@/lib/radar/performance-diagnostics";
import { createAircraftMotionRuntime, type AircraftMotionRuntime } from "@/lib/radar/aircraft-motion-runtime";
import { aircraftReportedTrueHeading } from "@/lib/aircraft/visual-heading";
import { AIRRADAR_MAP_THEME } from "@/lib/map-theme";
import { visualSystemV5EText } from "@/lib/i18n/visual-system-v5-e";
import { AIRRADAR_BASE_MAP_STYLE_URL, airRadarMapAttributions } from "@/lib/map-style";
import { applyRadarMapAppearance, isRadarMapAppearance, type RadarMapAppearance } from "@/lib/radar/map-appearance";
import { pickPresentationAircraft } from "@/lib/radar/presentation-v6-g";
import { RadarPresentationControls } from "@/components/radar/radar-presentation-controls";
import { RadarMapHud } from "@/components/radar/radar-map-hud";
import { aircraftWebglLabelFeature, ognMapLabelFeature, labelForAircraft, aircraftSearchText, ognTargetLabel, ognGlyphMarkup } from "@/lib/radar/map-label-presentation";
import { parseAirportDataset, parseAtcDataset, parseAtsDataset, parseJsonDataset, type AtsRoutesResponse } from "@/lib/radar/dataset-validation";
import { radarTrafficAriaLabel, toOgnTrafficPresentation } from "@/lib/radar/traffic-presentation";
import { aircraftIconSizeForPresentation, aircraftIconSizeAtZoom } from "@/lib/aircraft/icon-size";
import { aircraftColor } from "@/lib/aircraft/color-mode";
import { addRadarPreset, createRadarPreset, readRadarPresets, writeRadarPresets, type RadarPreset } from "@/lib/radar/presets";
import {
  AIRCRAFT_WEBGL_LABEL_LAYER_ID,
  AIRCRAFT_WEBGL_LABEL_SOURCE_ID,
  createAircraftWebglRuntime,
  type AircraftWebglRuntime,
} from "@/lib/radar/aircraft-webgl-layer";

declare global {
  interface Window {
    __airradarMapForDiagnostics?: maplibregl.Map;
    __airradarMapStyleLoadedForDiagnostics?: boolean;
    __airradarMapStyleLoadCountForDiagnostics?: number;
    __airradarMapResizeCountForDiagnostics?: number;
    __airradarAircraftMarkersForDiagnostics?: Map<string, AircraftMarkerHandle>;
    __airradarWebglAircraftForDiagnostics?: AircraftWebglRuntime;
  }
}

const DEMO_RECEIVER: ReceiverPosition = { lat: 50.0755, lon: 14.4378, name: t.radar.receiverName };
const EMPTY_RECEIVER: PublicReceiverPosition = { lat: null, lon: null, name: t.radar.receiverName };
const EMPTY_ATC_DATA: AtcDataResponse = {
  sectors: [],
  transmitters: [],
  metadata: { status: "unavailable", source: null, sourceReference: null, effectiveDate: null, lastVerifiedAt: null, sectorCount: 0, transmitterCount: 0 },
};
const EMPTY_OGN_SNAPSHOT: OgnStateSnapshot = { enabled: false, status: "disabled", fetchedAt: new Date(0).toISOString(), targets: [] };
const EMPTY_ATS_GEOJSON = { type: "FeatureCollection" as const, features: [] };
const EMPTY_NAVIGATION_INTEGRITY_GEOJSON = { type: "FeatureCollection" as const, features: [] };
const OGN_LABEL_SOURCE_ID = "ogn-traffic-labels";
const OGN_LABEL_LAYER_ID = "ogn-traffic-labels-symbol";

const EMPTY_RADAR_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const AircraftWeatherPanel = dynamic(() => import("@/components/aircraft-weather-panel").then((module) => module.AircraftWeatherPanel), { ssr: false });
const WEATHER_RADAR_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [WEATHER_RADAR_BOUNDS.west, WEATHER_RADAR_BOUNDS.north],
  [WEATHER_RADAR_BOUNDS.east, WEATHER_RADAR_BOUNDS.north],
  [WEATHER_RADAR_BOUNDS.east, WEATHER_RADAR_BOUNDS.south],
  [WEATHER_RADAR_BOUNDS.west, WEATHER_RADAR_BOUNDS.south],
];
interface PublicAlertStatus {
  enabled: boolean;
}
const EMPTY_SNAPSHOT: PublicStateSnapshot = {
  aircraft: [],
  relevantAtcFrequencies: [],
  receiver: EMPTY_RECEIVER,
  fetchedAt: new Date(0).toISOString(),
  provider: "connecting",
  sourceOnline: false,
  lastSourceUpdate: null,
  sourceError: null,
  readsbOnline: false,
  lastReadsbUpdate: null,
  lastError: null,
  stats: { currentAircraft: 0, aircraftSeenToday: 0, uniqueAircraftToday: 0, maxConcurrentAircraft: 0, maxDistanceKm: 0, aircraftTypes: [], airlines: [], messagesPerSecond: null },
};

const EMPTY_TRAIL: TrailPoint[] = [];

function trailEndpointKey(point: TrailPoint | undefined): string {
  return point ? `${point.recordedAt}|${point.lat}|${point.lon}` : "";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}


// OpenFreeMap keeps the basemap open and no-key while providing a dark vector
// hierarchy that remains usable when the public OSM raster host is unavailable.

/** MapLibre 6 initializes compact credits expanded. Start narrow radar maps
 * collapsed, without removing mandatory credit links or the native summary. */
function collapseNarrowRadarAttribution(map: maplibregl.Map): void {
  if (!window.matchMedia("(max-width: 420px)").matches) return;
  const credits = map.getContainer().querySelector<HTMLElement>("details.maplibregl-ctrl-attrib.maplibregl-compact");
  if (!credits) return;
  credits.removeAttribute("open");
  credits.classList.remove("maplibregl-compact-show");
}

export function AirRadarApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const atsPointFocus = searchParams.get("atsPoint");
  const navPointFocus = searchParams.get("navPoint");
  const focusedNavPoint = useMemo(() => parseNavPointFocus(navPointFocus), [navPointFocus]);
  const aircraftFocus = searchParams.get("aircraft")?.trim().toUpperCase() ?? null;
  const [snapshot, setSnapshot] = useState<PublicStateSnapshot>(EMPTY_SNAPSHOT);
  const [ognSnapshot, setOgnSnapshot] = useState<OgnStateSnapshot>(EMPTY_OGN_SNAPSHOT);
  const [ognEnabled, setOgnEnabled] = useState<boolean | null>(null);
  const [showOgn, setShowOgn] = useState(false);
  const ognLoadStartedRef = useRef(false);
  const [trafficSource, setTrafficSource] = useState<TrafficSource>("adsb");
  const [selectedOgnId, setSelectedOgnId] = useState<string | null>(null);
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [followSelected, setFollowSelected] = useState(false);
  const [aircraftDetail, setAircraftDetail] = useState<AircraftQuickDetailResponse | null>(null);
  const [selectedHistoryTrail, setSelectedHistoryTrail] = useState<{ icaoHex: string; points: TrailPoint[]; flight: HistoryResponse["flight"] } | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"distance" | "altitude" | "callsign">("distance");
  const [distanceFilter, setDistanceFilter] = useState("all");
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [mapFilters, setMapFilters] = useState<MapAircraftFilters>(DEFAULT_MAP_AIRCRAFT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [watchlist, setWatchlist] = useState<Array<{ kind: string; value: string }>>([]);
  const [showAircraft, setShowAircraft] = useState(true);
  const [colorMode, setColorMode] = useState<AircraftColorMode>("default");
  const [showAtc, setShowAtc] = useState(false);
  const atcAutoFitRef = useRef(false);
  const [showSigmet, setShowSigmet] = useState(false);
  const [showWeatherRadar, setShowWeatherRadar] = useState(false);
  const [radarProduct, setRadarProduct] = useState<"MAX_Z_MASKED" | "PSEUDOCAPPI_2KM">("MAX_Z_MASKED");
  const [radarOpacity, setRadarOpacity] = useState(0.65);
  const [showMetar, setShowMetar] = useState(false);
  const [showAircraftWeather, setShowAircraftWeather] = useState(false);
  const [showNavigationIntegrity, setShowNavigationIntegrity] = useState(false);
  const [navigationIntegrityCells, setNavigationIntegrityCells] = useState<Array<{ latCell: number; lonCell: number; state: string; affectedAircraftCount: number }>>([]);
  const [aircraftWeatherMapObservations, setAircraftWeatherMapObservations] = useState<AircraftWeatherMapObservation[]>([]);
  const [aircraftWeatherMapField, setAircraftWeatherMapField] = useState<"temperature" | "wind">("temperature");
  const [focusedAircraftWeatherObservation, setFocusedAircraftWeatherObservation] = useState<string | null>(null);
  const {
    radarCatalog,
    radarFrameId,
    setRadarFrameId,
    radarLatestMode,
    setRadarLatestMode,
    radarPlaying,
    setRadarPlaying,
    radarStatus,
    metarObservations,
    metarStatus,
    sigmetEnabled,
    sigmetData,
  } = useRadarWeatherContext({
    loadSigmet: showSigmet || selectedHex !== null,
    showWeatherRadar,
    radarProduct,
    showMetar,
    onSigmetUnavailable: () => setShowSigmet(false),
  });
  const [showAtsRoutes, setShowAtsRoutes] = useState(false);
  const [showNavData, setShowNavData] = useState(false);
  const [selectedAtsRoute, setSelectedAtsRoute] = useState<string | null>(null);
  const [showAirports, setShowAirports] = useState(true);
  const [showSignificantAirports, setShowSignificantAirports] = useState(DEFAULT_AIRPORT_LAYER_VISIBILITY.showSignificant);
  const [showSmallAirports, setShowSmallAirports] = useState(DEFAULT_AIRPORT_LAYER_VISIBILITY.showSmall);
  const [showHeliports, setShowHeliports] = useState(DEFAULT_AIRPORT_LAYER_VISIBILITY.showHeliports);
  const [atcExpanded, setAtcExpanded] = useState(false);
  const [coverage, setCoverage] = useState<CoverageMode>("local");
  const [preferencesResolved, setPreferencesResolved] = useState(false);
  const [serverAlertsEnabled, setServerAlertsEnabled] = useState<boolean | null>(null);
  const [mobileCompact, setMobileCompact] = useState(true);
  const [trafficOpen, setTrafficOpen] = useState(false);
  const [mapFocus, setMapFocus] = useState(false);
  const [mapAppearance, setMapAppearance] = useState<RadarMapAppearance>("dark");
  const [presentationMode, setPresentationMode] = useState(false);
  const [presentationPaused, setPresentationPaused] = useState(false);
  const [presentationScene, setPresentationScene] = useState<string | null>(null);
  const presentationLastHexRef = useRef<string | null>(null);
  const presentationAircraftRef = useRef<AircraftView[]>([]);
  presentationAircraftRef.current = snapshot.aircraft;
  const nativeBasemapLayerIdsRef = useRef<string[]>([]);
  const [multiAircraftMode, setMultiAircraftMode] = useState(false);
  const multiAircraftModeRef = useRef(false);
  const [multiAircraftHexes, setMultiAircraftHexes] = useState<string[]>([]);
  const trafficTriggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerActionGenerationRef = useRef(0);
  const previousDrawerStateRef = useRef<RadarDrawerState>("closed");
  const radarContentRef = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarBrowseRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const attributionControlRef = useRef<maplibregl.AttributionControl | null>(null);
  const centeredTrafficRef = useRef(false);
  const focusedAircraftRef = useRef<string | null>(null);
  const aircraftMarkersRef = useRef<Map<string, AircraftMarkerHandle>>(new Map());
  const ognMarkersRef = useRef<Map<string, OgnMarkerHandle>>(new Map());
  const aircraftMotionRuntimeRef = useRef<AircraftMotionRuntime | null>(null);
  const aircraftWebglRuntimeRef = useRef<AircraftWebglRuntime | null>(null);
  const aircraftWebglLabelAircraftRef = useRef<Map<string, AircraftView>>(new Map());
  const aircraftWebglLabelsUpdatedAtRef = useRef(Number.NEGATIVE_INFINITY);
  const labelCollisionSchedulerRef = useRef<(() => void) | null>(null);
  const aircraftMapSyncRef = useRef<((forceFull?: boolean) => void) | null>(null);
  const aircraftMapSyncFrameRef = useRef<number | null>(null);
  const selectedConfirmedTrailRef = useRef<readonly TrailPoint[]>(EMPTY_TRAIL);
  const selectedTrailInputsRef = useRef<{
    icaoHex: string;
    history: readonly TrailPoint[];
    liveLength: number;
    liveEndpointKey: string;
  } | null>(null);
  const selectedTrailSourceRef = useRef<readonly TrailPoint[] | null>(null);
  const routeSourceKeyRef = useRef<string | null>(null);
  const routeAirportSourceKeyRef = useRef<string | null>(null);
  const routeIntelligenceActiveRef = useRef(false);
  const routeAirportGeoJsonRef = useRef<ReturnType<typeof createRouteAirportGeoJSON>>(createRouteAirportGeoJSON(null));
  const selectedHexRef = useRef<string | null>(null);
  const receiverRef = useRef<PublicReceiverPosition>(snapshot.receiver);
  const centeredReceiverRef = useRef<ReceiverPosition | null>(null);
  const [mapZoom, setMapZoom] = useState(7.4);
  const [radarPresets, setRadarPresets] = useState<RadarPreset[]>([]);
  const [mapReady, setMapReady] = useState(false);
  // Native details[name] keeps Presets and Layers mutually exclusive.
  // Dismiss the active map menu outside the HUD and restore focus on Escape.
  useEffect(() => {
    const selector = 'details[name="radar-map-menus"][open]';
    const onPointerDown = (event: PointerEvent) => {
      const menu = document.querySelector<HTMLDetailsElement>(selector);
      if (menu && event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const menu = document.querySelector<HTMLDetailsElement>(selector);
      if (!menu) return;
      event.preventDefault();
      menu.open = false;
      menu.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    try {
      const persisted = window.localStorage.getItem("airradar-map-appearance-v6");
      if (isRadarMapAppearance(persisted)) setMapAppearance(persisted);
    } catch { /* Optional browser preference. */ }
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    applyRadarMapAppearance(map, nativeBasemapLayerIdsRef.current, mapAppearance);
  }, [mapAppearance, mapReady]);
  useEffect(() => {
    if (!presentationMode || !mapReady || presentationPaused) return;
    const map = mapRef.current;
    if (!map) return;
    let disposed = false;
    const rotate = () => {
      if (disposed || document.hidden || !mapRef.current) return;
      const next = pickPresentationAircraft(presentationAircraftRef.current, presentationLastHexRef.current);
      if (next?.lat !== null && next?.lon !== null && next) {
        presentationLastHexRef.current = next.icaoHex;
        setPresentationScene(next.callsign || next.registration || next.icaoHex);
        map.easeTo({ center: [next.lon, next.lat], zoom: 8, duration: 900, essential: true });
      } else {
        const receiver = receiverRef.current;
        if (receiver.lat === null || receiver.lon === null) return;
        presentationLastHexRef.current = null;
        setPresentationScene(receiver.name);
        map.easeTo({ center: [receiver.lon, receiver.lat], zoom: 7.4, duration: 900, essential: true });
      }
    };
    // Keep exactly one pending scene rotation only while Presentation Mode is active.
    // This is local camera choreography, never additional aircraft/network polling.
    let rotationTimeout: number | null = null;
    const schedule = () => {
      if (disposed) return;
      rotationTimeout = window.setTimeout(() => {
        if (disposed) return;
        rotate();
        schedule();
      }, 45_000);
    };
    rotate();
    schedule();
    return () => {
      disposed = true;
      if (rotationTimeout !== null) window.clearTimeout(rotationTimeout);
    };
  }, [mapReady, presentationMode, presentationPaused]);

  useEffect(() => {
    if (!presentationMode) return;
    const resize = () => mapRef.current?.resize();
    const onFullscreen = () => {
      if (!document.fullscreenElement) setPresentationMode(false);
      window.requestAnimationFrame(resize);
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    window.requestAnimationFrame(resize);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.requestAnimationFrame(resize);
    };
  }, [presentationMode]);

  const togglePresentationMode = () => {
    if (presentationMode) {
      setPresentationMode(false);
      setPresentationScene(null);
      if (document.fullscreenElement === radarContentRef.current) void document.exitFullscreen().catch(() => undefined);
      return;
    }
    setMapFocus(true);
    setFollowSelected(false);
    setPresentationPaused(false);
    setPresentationMode(true);
    const element = radarContentRef.current;
    if (element?.requestFullscreen) void element.requestFullscreen().catch(() => undefined);
  };
  const chooseMapAppearance = (value: RadarMapAppearance) => {
    setMapAppearance(value);
    try { window.localStorage.setItem("airradar-map-appearance-v6", value); } catch { /* Optional browser preference. */ }
  };
  const readRadarLayout = useCallback(() => {
    const mapElement = mapContainerRef.current;
    if (!mapElement || typeof window === "undefined") return null;
    const mobile = window.matchMedia("(max-width: 820px)").matches;
    const drawerVisible = trafficOpen || selectedHex !== null || selectedOgnId !== null;
    const bottomNav = mobile ? document.querySelector<HTMLElement>(".mobile-bottom-nav") : null;
    return {
      mapRect: mapElement.getBoundingClientRect(),
      drawerRect: drawerVisible ? sidebarRef.current?.getBoundingClientRect() ?? null : null,
      bottomNavRect: bottomNav?.getBoundingClientRect() ?? null,
      mobile,
    };
  }, [selectedHex, selectedOgnId, trafficOpen]);

  const currentRadarPadding = useCallback((base?: RadarMapPadding): RadarMapPadding => {
    const fallback = base ?? { top: 70, right: 40, bottom: 40, left: 40 };
    const layout = readRadarLayout();
    return layout ? radarCameraPadding(layout, fallback) : fallback;
  }, [readRadarLayout]);

  useEffect(() => {
    const content = radarContentRef.current;
    const mapElement = mapContainerRef.current;
    if (!content || !mapElement) return;

    const updateLayoutMetrics = () => {
      const layout = readRadarLayout();
      const bottom = layout ? radarBottomControlOffset(layout) : 10;
      content.style.setProperty("--radar-map-control-bottom", `${bottom}px`);
      if (new URLSearchParams(window.location.search).get("mapDiagnostics") === "1") {
        window.__airradarMapResizeCountForDiagnostics = (window.__airradarMapResizeCountForDiagnostics ?? 0) + 1;
      }
      mapRef.current?.resize();
    };

    updateLayoutMetrics();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateLayoutMetrics) : null;
    observer?.observe(mapElement);
    if (sidebarRef.current) observer?.observe(sidebarRef.current);
    const bottomNav = document.querySelector<HTMLElement>(".mobile-bottom-nav");
    if (bottomNav) observer?.observe(bottomNav);
    window.addEventListener("resize", updateLayoutMetrics);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateLayoutMetrics);
    };
  }, [mapReady, mobileCompact, readRadarLayout]);

  const receiverPositionAvailable = snapshot.receiver.lat !== null && snapshot.receiver.lon !== null;
  const airportGeoJsonRef = useRef<ReturnType<typeof createAirportGeoJSON>>(createAirportGeoJSON([]));
  const atcGeoJsonRef = useRef<ReturnType<typeof createAtcGeoJSON>>(createAtcGeoJSON([], false));
  const transmitterGeoJsonRef = useRef<FeatureCollection>({ type: "FeatureCollection", features: [] });
  const atsGeoJsonRef = useRef<{ segments: FeatureCollection; labels: FeatureCollection; points: FeatureCollection }>({ segments: EMPTY_ATS_GEOJSON, labels: EMPTY_ATS_GEOJSON, points: EMPTY_ATS_GEOJSON });
  const mapReplayRef = useRef({
    airports: createMapDatasetReplay<ReturnType<typeof createAirportGeoJSON>>(() => mapRef.current?.getSource("route-airports") as GeoJSONSource | undefined),
    atc: createMapDatasetReplay<ReturnType<typeof createAtcGeoJSON>>(() => mapRef.current?.getSource("atc-sectors") as GeoJSONSource | undefined),
    transmitters: createMapDatasetReplay<FeatureCollection>(() => mapRef.current?.getSource("atc-transmitters") as GeoJSONSource | undefined),
    atsSegments: createMapDatasetReplay<FeatureCollection>(() => mapRef.current?.getSource("ats-routes") as GeoJSONSource | undefined),
    atsLabels: createMapDatasetReplay<FeatureCollection>(() => mapRef.current?.getSource("ats-route-labels") as GeoJSONSource | undefined),
    atsPoints: createMapDatasetReplay<FeatureCollection>(() => mapRef.current?.getSource("ats-route-points") as GeoJSONSource | undefined),
  });
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const focusSearchOnTrafficOpenRef = useRef(false);
  const radarFrameGenerationRef = useRef(0);
  const networkEnabled = Boolean(snapshot.sources?.adsbLol.enabled);
  const activeCoverage: CoverageMode = preferencesResolved ? coverage : "local";
  const scheduleAircraftMapSync = useCallback(() => {
    // Hidden tabs do not reliably receive animation frames. Preserve the
    // existing hidden-tab contract by applying confirmed positions directly;
    // syncAircraftMap already snaps instead of animating while hidden.
    if (document.hidden) {
      if (aircraftMapSyncFrameRef.current !== null) window.cancelAnimationFrame(aircraftMapSyncFrameRef.current);
      aircraftMapSyncFrameRef.current = null;
      aircraftMapSyncRef.current?.(false);
      return;
    }
    if (aircraftMapSyncFrameRef.current !== null) return;
    aircraftMapSyncFrameRef.current = window.requestAnimationFrame(() => {
      aircraftMapSyncFrameRef.current = null;
      aircraftMapSyncRef.current?.(false);
    });
  }, []);
  const onSelectedAircraftRemoved = useCallback(() => {
    selectedHexRef.current = null;
    setSelectedHex(null);
    setFollowSelected(false);
  }, []);
  const {
    connected: streamConnected,
    liveSnapshotRef,
    liveTrailsRef,
    liveAircraftByHexRef,
    pendingAircraftChangesRef,
  } = useRadarLiveAircraft({
    enabled: preferencesResolved,
    activeCoverage,
    selectedHexRef,
    initialSnapshot: EMPTY_SNAPSHOT,
    commitSnapshot: setSnapshot,
    onSelectedAircraftRemoved,
    scheduleMapSync: scheduleAircraftMapSync,
  });

  const airportsDataset = useDatasetQuery<Airport[]>({
    url: receiverPositionAvailable ? `/api/airports?lat=${encodeURIComponent(String(snapshot.receiver.lat))}&lon=${encodeURIComponent(String(snapshot.receiver.lon))}&radiusNm=${AIRPORT_MAP_RADIUS_NM}` : "/api/airports",
    cache: "force-cache",
    parse: (response) => parseJsonDataset(response, parseAirportDataset),
    itemCount: (value) => value.length,
  });
  const atcDataset = useDatasetQuery<AtcDataResponse>({
    url: "/api/atc/sectors",
    enabled: showAtc,
    cache: "force-cache",
    parse: (response) => parseJsonDataset(response, parseAtcDataset),
    itemCount: (value) => value.sectors.length,
  });
  const atsDataset = useDatasetQuery<AtsRoutesResponse>({
    url: "/api/ats/routes?view=map",
    enabled: showAtsRoutes || Boolean(atsPointFocus),
    cache: "force-cache",
    parse: (response) => parseJsonDataset(response, parseAtsDataset),
    itemCount: (value) => value.counts?.routes ?? 0,
  });
  const airports = useMemo(() => airportsDataset.data ?? [], [airportsDataset.data]);
  const atcData = atcDataset.data ?? EMPTY_ATC_DATA;
  const atsRoutes = atsDataset.data;
  const { dataset: navDataDataset, points: navDataPoints } = useRadarNavDataContext({
    enabled: showNavData || focusedNavPoint !== null,
    latitude: focusedNavPoint?.lat ?? snapshot.receiver.lat,
    longitude: focusedNavPoint?.lon ?? snapshot.receiver.lon,
    radiusNm: 120,
  });
  const selectedNavRoutePointIds = useMemo(() => {
    const selected = snapshot.aircraft.find((aircraft) => aircraft.icaoHex === selectedHex);
    return routeReferencePointIds(selected?.enrichment?.flightPlan, navDataPoints);
  }, [navDataPoints, selectedHex, snapshot.aircraft]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("airradar-watchlist");
      if (stored) setWatchlist(JSON.parse(stored) as Array<{ kind: string; value: string }>);
      setRadarPresets(readRadarPresets(window.localStorage));
      const storedCoverage = window.localStorage.getItem("airradar-coverage");
      if (storedCoverage === "extended" || storedCoverage === "local") setCoverage(storedCoverage);
      const storedSource = window.localStorage.getItem("airradar-source-filter");
      if (storedSource === "all" || storedSource === "local" || storedSource === "network" || storedSource === "overlap") setMapFilters((current) => ({ ...current, source: storedSource }));
      setShowSigmet(window.localStorage.getItem("airradar-sigmet-layer") === "true");
      setShowOgn(window.localStorage.getItem("airradar-ogn-layer") === "true");
      setShowWeatherRadar(window.localStorage.getItem("airradar-weather-radar-layer") === "true");
      const savedRadarProduct = window.localStorage.getItem("airradar-weather-radar-product");
      if (savedRadarProduct === "MAX_Z_MASKED" || savedRadarProduct === "PSEUDOCAPPI_2KM") setRadarProduct(savedRadarProduct);
      const storedOpacity = Number(window.localStorage.getItem("airradar-weather-radar-opacity"));
      if (Number.isFinite(storedOpacity)) setRadarOpacity(Math.min(1, Math.max(0.2, storedOpacity)));
      setShowMetar(window.localStorage.getItem("airradar-metar-layer") === "true");
      setShowNavData(window.localStorage.getItem("airradar-nav-data-layer") === "true");
    } catch {
      // Local storage is optional; the radar remains usable when it is blocked.
    } finally {
      setPreferencesResolved(true);
    }
    void fetch("/api/health", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ alerts?: PublicAlertStatus }> : null)
      .then((data) => { if (data?.alerts) setServerAlertsEnabled(data.alerts.enabled); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!showOgn) {
      ognLoadStartedRef.current = false;
      return;
    }
    if (ognLoadStartedRef.current) return;
    ognLoadStartedRef.current = true;
    void fetch("/api/ogn/state", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<OgnStateSnapshot> : null)
      .then((data) => {
        if (!data) return;
        setOgnSnapshot(data);
        setOgnEnabled(data.enabled);
        if (!data.enabled) setShowOgn(false);
      })
      .catch(() => setOgnEnabled(false));
  }, [showOgn]);

  useEffect(() => {
    if ((ognEnabled !== true || !showOgn) && trafficSource === "ogn") setTrafficSource("adsb");
  }, [ognEnabled, showOgn, trafficSource]);

  useEffect(() => {
    try { window.localStorage.setItem("airradar-watchlist", JSON.stringify(watchlist)); } catch { /* optional */ }
  }, [watchlist]);

  useEffect(() => {
    if (!preferencesResolved) return;
    try { window.localStorage.setItem("airradar-coverage", coverage); } catch { /* optional */ }
  }, [coverage, preferencesResolved]);

  useEffect(() => {
    try { window.localStorage.setItem("airradar-sigmet-layer", String(showSigmet)); } catch { /* optional */ }
  }, [showSigmet]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("weather-radar-image") as ImageSource | undefined;
    const frame = radarStatus === "ready" || radarStatus === "stale"
      ? radarCatalog?.frames.find((candidate) => candidate.id === radarFrameId)
      : undefined;
    if (!source) return;
    source.updateImage({ url: frame?.imageUrl ?? EMPTY_RADAR_PNG, coordinates: WEATHER_RADAR_COORDINATES });
    if (map.getLayer("weather-radar-layer")) map.setLayoutProperty("weather-radar-layer", "visibility", showWeatherRadar && Boolean(frame) ? "visible" : "none");
    if (map.getLayer("weather-radar-layer")) map.setPaintProperty("weather-radar-layer", "raster-opacity", radarOpacity);
    const generation = ++radarFrameGenerationRef.current;
    if (frame) {
      const frameIndex = radarCatalog?.frames.findIndex((candidate) => candidate.id === frame.id) ?? -1;
      for (const neighbour of [radarCatalog?.frames[frameIndex - 1], radarCatalog?.frames[frameIndex + 1]]) {
        if (!neighbour) continue;
        const image = new window.Image();
        image.onload = () => { if (generation !== radarFrameGenerationRef.current) image.src = ""; };
        image.src = neighbour.imageUrl;
      }
    }
  }, [mapReady, radarCatalog, radarFrameId, radarOpacity, radarStatus, showWeatherRadar]);

  useEffect(() => {
    try { window.localStorage.setItem("airradar-ogn-layer", String(showOgn)); } catch { /* optional */ }
  }, [showOgn]);

  useEffect(() => { try { window.localStorage.setItem("airradar-weather-radar-layer", String(showWeatherRadar)); } catch { /* optional */ } }, [showWeatherRadar]);
  useEffect(() => { try { window.localStorage.setItem("airradar-weather-radar-product", radarProduct); } catch { /* optional */ } }, [radarProduct]);
  useEffect(() => { try { window.localStorage.setItem("airradar-weather-radar-opacity", String(radarOpacity)); } catch { /* optional */ } }, [radarOpacity]);
  useEffect(() => { try { window.localStorage.setItem("airradar-metar-layer", String(showMetar)); } catch { /* optional */ } }, [showMetar]);
  useEffect(() => { try { window.localStorage.setItem("airradar-nav-data-layer", String(showNavData)); } catch { /* optional */ } }, [showNavData]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("aviation-nav-data") as GeoJSONSource | undefined;
    source?.setData(createAviationNavGeoJSON(navDataPoints, selectedNavRoutePointIds));
    const visibility = showNavData ? "visible" : "none";
    if (map.getLayer("aviation-nav-data-points")) map.setLayoutProperty("aviation-nav-data-points", "visibility", visibility);
    if (map.getLayer("aviation-nav-data-labels")) map.setLayoutProperty("aviation-nav-data-labels", "visibility", visibility);
  }, [mapReady, navDataPoints, selectedNavRoutePointIds, showNavData]);

  useEffect(() => {
    if (!focusedNavPoint) return;
    setShowNavData(true);
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.easeTo({
      center: [focusedNavPoint.lon, focusedNavPoint.lat],
      zoom: Math.max(map.getZoom(), 10),
      padding: currentRadarPadding(),
      duration: prefersReducedMotion() ? 0 : 500,
    });
  }, [currentRadarPadding, focusedNavPoint, mapReady]);

  useEffect(() => {
    if (!showNavigationIntegrity) { setNavigationIntegrityCells([]); return; }
    let cancelled = false;
    const load = () => { void fetch("/api/navigation-integrity/current?window=15m", { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<{ cells?: Array<{ latCell: number; lonCell: number; state: string; affectedAircraftCount: number }> }> : null).then((value) => { if (!cancelled) setNavigationIntegrityCells(value?.cells ?? []); }).catch(() => undefined); };
    load();
    let timer: number | undefined;
    const schedule = () => { timer = window.setTimeout(() => { load(); if (!cancelled) schedule(); }, 30_000); };
    schedule();
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [showNavigationIntegrity]);

  const normalizedWatchlist = useMemo<AircraftMatchRule[]>(() => watchlist.flatMap((rule) => {
    const value = rule.value.trim().toUpperCase();
    const type = normalizeAircraftRuleType(rule.kind);
    return value && type ? [{ type, value }] : [];
  }), [watchlist]);
  const watchlistedHexes = useMemo(() => new Set(
    snapshot.aircraft
      .filter((aircraft) => normalizedWatchlist.some((rule) => matchesAircraftRule(aircraft, rule)))
      .map((aircraft) => aircraft.icaoHex),
  ), [normalizedWatchlist, snapshot.aircraft]);
  const isWatchlisted = useCallback(
    (aircraft: AircraftView) => watchlistedHexes.has(aircraft.icaoHex),
    [watchlistedHexes],
  );
  const isLiveAircraftWatchlisted = useCallback(
    (aircraft: AircraftView) => normalizedWatchlist.some((rule) => matchesAircraftRule(aircraft, rule)),
    [normalizedWatchlist],
  );

  const saveCurrentRadarPreset = useCallback((name: string) => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    const preset = createRadarPreset({
      name,
      camera: { longitude: center.lng, latitude: center.lat, zoom: map.getZoom() },
      coverage,
      mapFilters,
      layers: {
        showAircraft,
        showOgn,
        showAirports,
        showSignificantAirports,
        showSmallAirports,
        showHeliports,
        showAtc,
        showAtsRoutes,
        showNavData,
        showSigmet,
        showWeatherRadar,
        showMetar,
        showAircraftWeather,
        showNavigationIntegrity,
      },
      display: { colorMode, radarOpacity },
    });
    setRadarPresets((current) => {
      const next = addRadarPreset(current, preset);
      writeRadarPresets(window.localStorage, next);
      return next;
    });
  }, [
    colorMode,
    coverage,
    mapFilters,
    radarOpacity,
    showAircraft,
    showAircraftWeather,
    showAirports,
    showAtc,
    showAtsRoutes,
    showHeliports,
    showMetar,
    showNavData,
    showNavigationIntegrity,
    showOgn,
    showSigmet,
    showSignificantAirports,
    showSmallAirports,
    showWeatherRadar,
  ]);

  const applyRadarPreset = useCallback((preset: RadarPreset) => {
    setCoverage(preset.coverage);
    setMapFilters(preset.mapFilters);
    setShowAircraft(preset.layers.showAircraft);
    setShowOgn(preset.layers.showOgn);
    setShowAirports(preset.layers.showAirports);
    setShowSignificantAirports(preset.layers.showSignificantAirports);
    setShowSmallAirports(preset.layers.showSmallAirports);
    setShowHeliports(preset.layers.showHeliports);
    setShowAtc(preset.layers.showAtc);
    setShowAtsRoutes(preset.layers.showAtsRoutes);
    setShowNavData(preset.layers.showNavData);
    setShowSigmet(preset.layers.showSigmet);
    setShowWeatherRadar(preset.layers.showWeatherRadar);
    setShowMetar(preset.layers.showMetar);
    setShowAircraftWeather(preset.layers.showAircraftWeather);
    setShowNavigationIntegrity(preset.layers.showNavigationIntegrity);
    setColorMode(preset.display.colorMode);
    setRadarOpacity(preset.display.radarOpacity);
    setRadarPlaying(false);
    const map = mapRef.current;
    if (map) {
      map.easeTo({
        center: [preset.camera.longitude, preset.camera.latitude],
        zoom: preset.camera.zoom,
        padding: currentRadarPadding(),
        duration: prefersReducedMotion() ? 0 : 500,
      });
    }
  }, [currentRadarPadding, setRadarPlaying]);

  const deleteRadarPreset = useCallback((id: string) => {
    setRadarPresets((current) => {
      const next = current.filter((preset) => preset.id !== id);
      writeRadarPresets(window.localStorage, next);
      return next;
    });
  }, []);

  function updateMapFilter<Key extends keyof MapAircraftFilters>(key: Key, value: MapAircraftFilters[Key]) {
    setMapFilters((current) => ({ ...current, [key]: value }));
    if (key === "source") window.localStorage.setItem("airradar-source-filter", String(value));
  }

  const resetMapFilters = useCallback(() => {
    setMapFilters(DEFAULT_MAP_AIRCRAFT_FILTERS);
    setSearch("");
    setDistanceFilter("all");
    setWatchlistOnly(false);
    setSortBy("distance");
  }, []);

  const selectAircraft = useCallback((hex: string) => {
    if (multiAircraftModeRef.current) setMultiAircraftHexes((current) => addMultiAircraft(current, hex));
    drawerActionGenerationRef.current += 1;
    selectedHexRef.current = hex;
    setTrafficSource("adsb");
    setSelectedOgnId(null);
    setSelectedHex(hex);
    setFiltersOpen(false);
    setMobileCompact(false);
    setTrafficOpen(true);
  }, []);

  // Global search opens the live radar and selects the matching aircraft. The
  // effect intentionally waits for the stream snapshot, since search can be
  // selected before the first live update has arrived.
  useEffect(() => {
    if (!aircraftFocus) return;
    const aircraft = snapshot.aircraft.find((item) => item.icaoHex.toUpperCase() === aircraftFocus);
    if (aircraft && selectedHex !== aircraft.icaoHex) selectAircraft(aircraft.icaoHex);
  }, [aircraftFocus, selectAircraft, selectedHex, snapshot.aircraft]);

  const toggleMultiAircraft = useCallback(() => {
    setMultiAircraftMode((active) => {
      multiAircraftModeRef.current = !active;
      if (!active) setMultiAircraftHexes((current) => selectedHexRef.current ? addMultiAircraft(current, selectedHexRef.current) : current);
      return !active;
    });
  }, []);
  const clearMultiAircraft = useCallback(() => {
    multiAircraftModeRef.current = false;
    setMultiAircraftMode(false);
    setMultiAircraftHexes([]);
  }, []);
  const focusMultiAircraft = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const points = multiAircraftHexes.flatMap((hex) => {
      const aircraft = liveAircraftByHexRef.current.get(hex);
      return aircraft?.lon !== null && aircraft?.lat !== null && aircraft?.lon !== undefined && aircraft?.lat !== undefined
        && Number.isFinite(aircraft.lon) && Number.isFinite(aircraft.lat) ? [[aircraft.lon, aircraft.lat] as [number, number]] : [];
    });
    if (points.length === 1) map.easeTo({ center: points[0], duration: prefersReducedMotion() ? 0 : 450 });
    if (points.length > 1) map.fitBounds(points.reduce((bounds, point) => bounds.extend(point), new maplibregl.LngLatBounds(points[0], points[0])), { padding: 90, maxZoom: 11, duration: prefersReducedMotion() ? 0 : 450 });
  }, [liveAircraftByHexRef, multiAircraftHexes]);

  const selectOgn = useCallback((id: string) => {
    drawerActionGenerationRef.current += 1;
    selectedHexRef.current = null;
    setTrafficSource("ogn");
    setSelectedHex(null);
    setFollowSelected(false);
    setSelectedOgnId(id);
    setFiltersOpen(false);
    setMobileCompact(false);
    setTrafficOpen(true);
  }, []);

  const closeRadarDrawer = useCallback(() => {
    drawerActionGenerationRef.current += 1;
    setTrafficOpen(false);
    setFiltersOpen(false);
    setFollowSelected(false);
    setSelectedHex(null);
    setSelectedOgnId(null);
    setMobileCompact(true);
  }, []);

  useEffect(() => {
    function closeRadarUi(event: KeyboardEvent): void {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!trafficOpen && selectedHex === null && selectedOgnId === null && !filtersOpen) return;
      event.preventDefault();
      closeRadarDrawer();
    }

    document.addEventListener("keydown", closeRadarUi);
    return () => document.removeEventListener("keydown", closeRadarUi);
  }, [closeRadarDrawer, filtersOpen, selectedHex, selectedOgnId, trafficOpen]);

  const openTrafficDrawer = useCallback((shortcut?: "search" | "filters") => {
    const actionGeneration = ++drawerActionGenerationRef.current;
    setSelectedHex(null);
    setFollowSelected(false);
    setSelectedOgnId(null);
    setTrafficOpen(true);
    setMobileCompact(shortcut ? false : window.matchMedia("(max-width: 820px)").matches);
    setFiltersOpen(false);
    if (shortcut === "search") {
      focusSearchOnTrafficOpenRef.current = true;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (actionGeneration === drawerActionGenerationRef.current) {
            searchInputRef.current?.focus();
            if (searchInputRef.current) focusSearchOnTrafficOpenRef.current = false;
          }
        });
      });
    } else if (shortcut === "filters" && trafficSource === "adsb") {
      window.requestAnimationFrame(() => {
        if (actionGeneration === drawerActionGenerationRef.current) setFiltersOpen(true);
      });
    } else if (trafficSource === "ogn") {
      setFiltersOpen(false);
    }
  }, [trafficSource]);

  const backToTraffic = useCallback(() => {
    drawerActionGenerationRef.current += 1;
    setSelectedHex(null);
    setFollowSelected(false);
    setSelectedOgnId(null);
    setFiltersOpen(false);
    setTrafficOpen(true);
    setMobileCompact(false);
  }, []);

  function centerSelectedAircraft(): void {
    const map = mapRef.current;
    const aircraft = snapshot.aircraft.find((item) => item.icaoHex === selectedHex);
    if (!map || !aircraft || !selectedHex) return;
    const rendered = aircraftMarkersRef.current.get(selectedHex)?.marker.getLngLat();
    const lon = rendered?.lng ?? aircraft.lon;
    const lat = rendered?.lat ?? aircraft.lat;
    if (lon === null || lat === null) return;
    map.easeTo({ center: [lon, lat], padding: currentRadarPadding(), duration: prefersReducedMotion() ? 0 : 350 });
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !followSelected || !selectedHex) return;

    let animationFrame = 0;
    let lastFollowAt = Number.NEGATIVE_INFINITY;
    let lastCenter: [number, number] | null = null;
    const stopFollowingOnDrag = () => setFollowSelected(false);
    const followRenderedAircraft = (now: number) => {
      if (now - lastFollowAt >= 100) {
        const aircraft = liveAircraftByHexRef.current.get(selectedHex);
        const rendered = aircraftMarkersRef.current.get(selectedHex)?.marker.getLngLat();
        const lon = rendered?.lng ?? aircraft?.lon ?? null;
        const lat = rendered?.lat ?? aircraft?.lat ?? null;

        if (lon !== null && lat !== null && Number.isFinite(lon) && Number.isFinite(lat)) {
          const moved = !lastCenter
            || Math.abs(lastCenter[0] - lon) > 0.000001
            || Math.abs(lastCenter[1] - lat) > 0.000001;
          if (moved) {
            map.jumpTo({ center: [lon, lat], padding: currentRadarPadding() });
            lastCenter = [lon, lat];
          }
        }
        lastFollowAt = now;
      }
      animationFrame = window.requestAnimationFrame(followRenderedAircraft);
    };

    map.on("dragstart", stopFollowingOnDrag);
    animationFrame = window.requestAnimationFrame(followRenderedAircraft);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      map.off("dragstart", stopFollowingOnDrag);
    };
  }, [currentRadarPadding, followSelected, liveAircraftByHexRef, mapReady, selectedHex]);

  useEffect(() => {
    selectedHexRef.current = selectedHex;
  }, [selectedHex]);

  useEffect(() => {
    if (!selectedHex) {
      setAircraftDetail(null);
      return;
    }
    let active = true;
    setAircraftDetail(null);
    void fetch(`/api/aircraft/${encodeURIComponent(selectedHex)}?mode=quick&coverage=${activeCoverage}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("quick aircraft detail unavailable");
        return (await response.json()) as AircraftQuickDetailResponse;
      })
      .then((result) => {
        if (active) setAircraftDetail(result);
      })
      .catch(() => {
        // Live SSE data remains sufficient to keep the quick drawer usable.
      });
    return () => { active = false; };
  }, [activeCoverage, selectedHex]);

  useEffect(() => {
    setSelectedHistoryTrail(null);
    if (!selectedHex) return;
    let active = true;
    // 120 samples cover the live trail at the current history sampling cadence
    // while keeping the selected-aircraft request and boundTrailPoints work small.
    void fetch(`/api/history/${encodeURIComponent(selectedHex)}?limit=120`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Aircraft trail history unavailable");
        return (await response.json()) as HistoryResponse & { icaoHex?: string };
      })
      .then((history) => {
        if (active && (!history.icaoHex || history.icaoHex.toUpperCase() === selectedHex.toUpperCase())) {
          setSelectedHistoryTrail({ icaoHex: selectedHex.toUpperCase(), flight: history.flight, points: boundTrailPoints(history.positions, Date.now()) });
        }
      })
      .catch(() => {
        // Live session points remain available when history is unavailable.
      });
    return () => { active = false; };
  }, [selectedHex]);

  useRadarOgnStream(ognEnabled, showOgn, setOgnSnapshot);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    configureMapLibreWorker();
    const startingReceiver = receiverRef.current.lat === null || receiverRef.current.lon === null
      ? DEMO_RECEIVER
      : receiverRef.current as ReceiverPosition;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: AIRRADAR_BASE_MAP_STYLE_URL,
      center: [startingReceiver.lon, startingReceiver.lat],
      zoom: 7.4,
      minZoom: 3,
      crossSourceCollisions: true,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    const attributionControl = new maplibregl.AttributionControl({ compact: true, customAttribution: airRadarMapAttributions(false) });
    map.addControl(attributionControl, "bottom-right");
    collapseNarrowRadarAttribution(map);
    const attributionBreakpoint = window.matchMedia("(max-width: 420px)");
    const onAttributionBreakpoint = (event: MediaQueryListEvent) => {
      if (event.matches) collapseNarrowRadarAttribution(map);
    };
    attributionBreakpoint.addEventListener("change", onAttributionBreakpoint);
    attributionControlRef.current = attributionControl;
    mapRef.current = map;
    const mapDiagnostics = new URLSearchParams(window.location.search).get("mapDiagnostics") === "1";
    if (mapDiagnostics) {
      window.__airradarMapForDiagnostics = map;
      window.__airradarMapStyleLoadedForDiagnostics = false;
      window.__airradarMapStyleLoadCountForDiagnostics = 0;
      window.__airradarMapResizeCountForDiagnostics = 0;
    }
    const aircraftMarkers = aircraftMarkersRef.current;
    const ognMarkers = ognMarkersRef.current;
    const liveTrails = liveTrailsRef.current;
    const mapReplays = mapReplayRef.current;
    let performanceDiagnostics: RadarPerformanceDiagnosticsSession | null = null;
    let performanceDiagnosticsDisposed = false;
    if (new URLSearchParams(window.location.search).get("perfDiagnostics") === "1") {
      void import("@/lib/radar/performance-diagnostics").then(({ startRadarPerformanceDiagnostics }) => {
        if (performanceDiagnosticsDisposed) return;
        performanceDiagnostics = startRadarPerformanceDiagnostics(window.location.search);
        if (performanceDiagnostics) window.dispatchEvent(new Event("airradar:performance-diagnostics-ready"));
      });
    }
    if (new URLSearchParams(window.location.search).get("mapDiagnostics") === "1") {
      window.__airradarAircraftMarkersForDiagnostics = aircraftMarkers;
    }

    const runLabelCollision = () => {
      const startedAt = performanceDiagnostics ? performance.now() : 0;
      applyAircraftLabelCollisionLayout({
        map,
        aircraftMarkers,
        additionalMarkers: ognMarkers,
        routeAirportFeatures: routeAirportGeoJsonRef.current.features,
        routeAirportLabelLayerId: ROUTE_V2_AIRPORT_LABEL_LAYER_ID,
      });
      if (performanceDiagnostics) performanceDiagnostics.recordLabelCollision(performance.now() - startedAt);
    };
    const labelCollisionScheduler = createLabelCollisionScheduler(runLabelCollision);
    labelCollisionSchedulerRef.current = () => labelCollisionScheduler.schedule();

    const aircraftMotionRuntime = createAircraftMotionRuntime({
      map,
      getSelectedHex: () => selectedHexRef.current,
      getSelectedTrail: () => selectedConfirmedTrailRef.current,
      scheduleLabelCollision: () => labelCollisionSchedulerRef.current?.(),
      getPerformanceDiagnostics: () => performanceDiagnostics,
    });
    aircraftMotionRuntimeRef.current = aircraftMotionRuntime;

    const aircraftWebglRuntime = createAircraftWebglRuntime({
      getPerformanceDiagnostics: () => performanceDiagnostics,
      prefersReducedMotion,
    });
    aircraftWebglRuntimeRef.current = aircraftWebglRuntime;
    if (new URLSearchParams(window.location.search).get("mapDiagnostics") === "1") {
      window.__airradarWebglAircraftForDiagnostics = aircraftWebglRuntime;
    }

    // MapLibre's `load` event waits for the whole map to be loaded, including
    // remote raster tile managers. The radar overlays only require the style
    // graph to exist, so initialize them on the style lifecycle event instead.
    // This keeps basemap availability from preventing the aircraft runtime
    // from becoming usable on a narrow/mobile viewport.
    map.once("style.load", () => {
      nativeBasemapLayerIdsRef.current = (map.getStyle().layers ?? []).map((layer) => layer.id);
      if (mapDiagnostics) {
        window.__airradarMapStyleLoadedForDiagnostics = true;
        window.__airradarMapStyleLoadCountForDiagnostics = (window.__airradarMapStyleLoadCountForDiagnostics ?? 0) + 1;
      }
      registerRadarBaseOverlays(map, {
        radarImageUrl: EMPTY_RADAR_PNG,
        radarCoordinates: WEATHER_RADAR_COORDINATES,
        emptyAts: EMPTY_ATS_GEOJSON,
        emptyNavigationIntegrity: EMPTY_NAVIGATION_INTEGRITY_GEOJSON,
      });
      const openAtsSegment = (event: MapLayerMouseEvent) => {
        const properties = event.features?.[0]?.properties;
        if (!properties) return;
        setSelectedAtsRoute(String(properties.routeDesignator));
        const content = document.createElement("div"); content.className = "map-popup";
        const title = document.createElement("strong"); title.textContent = `${String(properties.routeDesignator)} · ${String(properties.fromName)} → ${String(properties.toName)}`;
        const body = document.createElement("span");
        const track = properties.magTrackForwardDeg == null ? t.common.emptyValue : `${String(properties.magTrackForwardDeg).padStart(3, "0")}° / ${properties.magTrackReverseDeg == null ? t.common.emptyValue : `${String(properties.magTrackReverseDeg).padStart(3, "0")}°`}`;
        body.textContent = `${String(properties.navigationSpecification)} · ${properties.distanceNm} NM · ${t.layers.atsVertical}: ${properties.lowerLimit}–${properties.upperLimit}${properties.lowerOverride ? ` (${properties.lowerOverride})` : ""} · ${t.layers.atsMagneticTrack}: ${track} · ${t.layers.atsLevels}: ${properties.cruisingLevelForward ?? t.common.emptyValue} / ${properties.cruisingLevelReverse ?? t.common.emptyValue} · ${t.layers.atsAvailability}: UNKNOWN · ${t.layers.atsPublished}: ${properties.availabilityClass ?? "Published"} · ${t.layers.atsEffective}: ${properties.effectiveDate} · ${t.layers.atsSource}: ${properties.aipAmendment ?? t.common.emptyValue} / ${properties.airacAmendment ?? t.common.emptyValue}. ${t.layers.atsPublishedDisclaimer}${properties.remarks ? ` ${properties.remarks}` : ""}`;
        content.append(title, body); new maplibregl.Popup({ closeButton: true, maxWidth: "340px" }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
      };
      map.on("click", "ats-routes-line", openAtsSegment); map.on("click", "ats-routes-cdr", openAtsSegment); map.on("click", "ats-routes-selected", openAtsSegment);
      for (const layer of ["ats-routes-line", "ats-routes-cdr", "ats-routes-selected"] as const) { map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; }); }
      map.addSource("multi-aircraft-trails", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "multi-aircraft-trail-lines", type: "line", source: "multi-aircraft-trails", paint: { "line-color": AIRRADAR_MAP_THEME.accent, "line-opacity": 0.76, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.3, 8, 2, 13, 2.8], "line-dasharray": [3, 2] } });
      map.addSource("selected-trail", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "selected-trail-line", type: "line", source: "selected-trail", paint: { "line-color": AIRRADAR_MAP_THEME.selected, "line-opacity": 0.86, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.8, 8, 2.4, 13, 3.2] } });
      map.addSource("selected-trail-live-tail", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "selected-trail-live-tail-line", type: "line", source: "selected-trail-live-tail", paint: { "line-color": AIRRADAR_MAP_THEME.selectedStrong, "line-opacity": 0.92, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2, 8, 2.6, 13, 3.4] } });
      map.addSource(ROUTE_V2_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(ROUTE_INTELLIGENCE_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: ROUTE_INTELLIGENCE_COMPLETED_LAYER_ID,
        type: "line",
        source: ROUTE_INTELLIGENCE_SOURCE_ID,
        filter: ["==", ["get", "progress"], "completed"],
        layout: { visibility: "none" },
        paint: { "line-color": AIRRADAR_MAP_THEME.routes.completed, "line-opacity": 0.62, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.8, 8, 2.5, 13, 3.2], "line-dasharray": [1.5, 2.5] },
      });
      map.addLayer({
        id: ROUTE_INTELLIGENCE_REMAINING_LAYER_ID,
        type: "line",
        source: ROUTE_INTELLIGENCE_SOURCE_ID,
        filter: ["==", ["get", "progress"], "remaining"],
        layout: { visibility: "none" },
        paint: { "line-color": AIRRADAR_MAP_THEME.routes.remaining, "line-opacity": 0.78, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.8, 8, 2.7, 13, 3.5] },
      });
      map.addLayer({
        id: ROUTE_INTELLIGENCE_CURRENT_LAYER_ID,
        type: "line",
        source: ROUTE_INTELLIGENCE_SOURCE_ID,
        filter: ["==", ["get", "progress"], "current"],
        layout: { visibility: "none" },
        paint: { "line-color": AIRRADAR_MAP_THEME.selectedStrong, "line-opacity": 0.98, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2.8, 8, 4.2, 13, 5.8] },
      });
      // Route V2 keeps the established completed-route value in the shared
      // theme (legacy assertion: "line-color": "#7ea9bd").
      map.addLayer({
        id: ROUTE_V2_COMPLETED_LAYER_ID,
        type: "line",
        source: ROUTE_V2_SOURCE_ID,
        filter: ["==", ["get", "segment"], "completed"],
        paint: { "line-color": AIRRADAR_MAP_THEME.routes.completed, "line-opacity": 0.54, "line-width": 1.7, "line-dasharray": [1.5, 2.5] },
      });
      map.addLayer({
        id: ROUTE_V2_REMAINING_LAYER_ID,
        type: "line",
        source: ROUTE_V2_SOURCE_ID,
        filter: ["==", ["get", "segment"], "remaining"],
        paint: { "line-color": AIRRADAR_MAP_THEME.routes.remaining, "line-opacity": 0.62, "line-width": 1.9, "line-dasharray": [2, 3] },
      });
      registerRadarAviationLayers(map, EMPTY_SIGMET_DATA as unknown as FeatureCollection);
      map.on("click", "aviation-sigmet-fill", (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const properties = feature.properties ?? {};
        const content = document.createElement("div");
        content.className = "map-popup";
        const title = document.createElement("strong");
        title.textContent = String(properties.hazard ?? properties.phenomenon ?? t.layers.sigmet);
        const addLine = (label: string, value: string) => {
          const line = document.createElement("span");
          line.textContent = `${label}: ${value}`;
          content.append(line);
        };
        const lower = properties.lowerFt == null ? t.layers.sigmetNotSpecified : `FL${Math.round(Number(properties.lowerFt) / 100)}`;
        const upper = properties.upperFt == null ? t.layers.sigmetNotSpecified : `FL${Math.round(Number(properties.upperFt) / 100)}`;
        const qualifier = String(properties.qualifier ?? t.common.emptyValue);
        const qualifierExplanation = qualifier.toUpperCase().includes("EMBD") ? ` (${t.layers.sigmetEmbedded})` : "";
        const area = [properties.firId, properties.firName].filter(Boolean).join(" · ") || t.common.emptyValue;
        const validity = `${formatDateTime(String(properties.validFrom ?? ""), t)}–${formatDateTime(String(properties.validTo ?? ""), t)}`;
        addLine(t.layers.sigmet, t.layers.sigmetMeaning);
        addLine(t.layers.sigmetHazard, String(properties.hazard ?? properties.phenomenon ?? t.common.emptyValue));
        addLine(t.layers.sigmetQualifier, `${qualifier}${qualifierExplanation}`);
        addLine(t.layers.sigmetArea, area);
        addLine(t.layers.sigmetVertical, `${t.layers.sigmetLower}: ${lower} · ${t.layers.sigmetUpper}: ${upper}`);
        addLine(t.layers.sigmetValidity, validity);
        new maplibregl.Popup({ closeButton: true, maxWidth: "340px" }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
      });
      map.on("mouseenter", "aviation-sigmet-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "aviation-sigmet-fill", () => { map.getCanvas().style.cursor = ""; });
      map.addSource(ROUTE_V2_AIRPORT_SOURCE_ID, { type: "geojson", data: createRouteAirportGeoJSON(null) });
      map.addLayer({ id: ROUTE_V2_AIRPORT_CIRCLE_LAYER_ID, type: "circle", source: ROUTE_V2_AIRPORT_SOURCE_ID, paint: { "circle-color": AIRRADAR_MAP_THEME.airports.selected, "circle-opacity": 0.94, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4.2, 12, 5.8], "circle-stroke-color": AIRRADAR_MAP_THEME.outline, "circle-stroke-width": 1.8 } });
      map.addLayer({ id: ROUTE_V2_AIRPORT_LABEL_LAYER_ID, type: "symbol", source: ROUTE_V2_AIRPORT_SOURCE_ID, filter: ["==", ["get", "labelVisible"], true], layout: { "text-field": ["get", "code"], "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9, 10, 10, 13, 11], "text-offset": [0, 1.25], "text-padding": 6, "text-allow-overlap": false, "text-ignore-placement": false, "text-optional": true }, paint: { "text-color": AIRRADAR_MAP_THEME.selectedStrong, "text-opacity": 0.94, "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1 } });
      map.on("click", "atc-sectors-fill", (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const properties = feature.properties ?? {};
        const content = document.createElement("div");
        content.className = "map-popup";
        const title = document.createElement("strong");
        title.textContent = String(properties.name ?? t.atc.sector);
        const body = document.createElement("span");
        const altitude = `${String(properties.lowerAltitude ?? properties.lowerAltitudeFt ?? 0)}–${String(properties.upperAltitude ?? properties.upperAltitudeFt ?? t.common.unlimited)}`;
        const activation = properties.activationStatus === "ACTIVE" ? t.atc.activationValues.active : properties.activationStatus === "INACTIVE" ? t.atc.activationValues.inactive : t.atc.activationValues.unknown;
        body.textContent = `${t.atc.activation}: ${activation} · ${String(properties.service ?? "")} · ${altitude} · ${t.atc.primaryFrequency}: ${String(properties.primaryFrequency ?? t.common.emptyValue)} · ${t.atc.alternates}: ${String(properties.alternateFrequencies || t.common.emptyValue)} · ${t.atc.source}: ${String(properties.source ?? t.common.emptyValue)} · ${t.atc.sourceReference}: ${String(properties.sourceReference ?? t.common.emptyValue)} · ${t.atc.effectiveDate}: ${String(properties.validFrom ?? t.common.emptyValue)} · ${t.atc.lastVerified}: ${String(properties.lastVerifiedAt ?? t.common.emptyValue)}`;
        content.append(title, body);
        new maplibregl.Popup({ closeButton: true, maxWidth: "360px" }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
      });
      map.on("mouseenter", "atc-sectors-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "atc-sectors-fill", () => { map.getCanvas().style.cursor = ""; });
      map.on("click", "metar-symbols", (event: MapLayerMouseEvent) => {
        const properties = event.features?.[0]?.properties;
        if (!properties) return;
        const content = document.createElement("div"); content.className = "map-popup";
        const title = document.createElement("strong"); title.textContent = String(properties.stationId ?? t.layers.metar);
        const body = document.createElement("span");
        body.textContent = `${t.layers.flightCategory}: ${String(properties.flightCategory ?? "UNKNOWN")} · ${t.layers.windSpeed}: ${properties.windDirection == null ? t.common.emptyValue : `${String(properties.windDirection).padStart(3, "0")}° / `}${properties.windSpeed == null ? t.common.emptyValue : `${String(properties.windSpeed)} kt`} · ${t.layers.metarObserved}: ${formatDateTime(String(properties.observedAt ?? ""), t)}${properties.stale === true ? ` · ${t.layers.metarStale}` : ""}`;
        content.append(title, body);
        new maplibregl.Popup({ closeButton: true, maxWidth: "300px" }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
      });
      map.on("mouseenter", "metar-symbols", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "metar-symbols", () => { map.getCanvas().style.cursor = ""; });
      map.on("click", "atc-transmitters-circle", (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const properties = feature.properties ?? {};
        const content = document.createElement("div");
        content.className = "map-popup";
        const title = document.createElement("strong");
        title.textContent = String(properties.name ?? t.atc.transmitter);
        const body = document.createElement("span");
        body.textContent = `${String(properties.service ?? "")} · ${String(properties.frequency ?? "")} · ${t.atc.source}: ${String(properties.source ?? t.common.emptyValue)} · ${t.atc.sourceReference}: ${String(properties.sourceReference ?? t.common.emptyValue)} · ${String(properties.notes ?? "")}`;
        content.append(title, body);
        new maplibregl.Popup({ closeButton: true, maxWidth: "260px" }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
      });
      map.on("mouseenter", "atc-transmitters-circle", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "atc-transmitters-circle", () => { map.getCanvas().style.cursor = ""; });
      const openAirport = (event: maplibregl.MapLayerMouseEvent) => {
        const icao = event.features?.[0]?.properties?.icao;
        if (typeof icao === "string" && /^[A-Z0-9]{4}$/.test(icao)) router.push(`/airports/${encodeURIComponent(icao)}`);
      };
      for (const layer of ["route-airports-circle", "route-airports-label", ROUTE_V2_AIRPORT_CIRCLE_LAYER_ID, ROUTE_V2_AIRPORT_LABEL_LAYER_ID] as const) {
        map.on("click", layer, openAirport);
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
      map.addLayer(aircraftWebglRuntime.layer);
      map.addSource(AIRCRAFT_WEBGL_LABEL_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: AIRCRAFT_WEBGL_LABEL_LAYER_ID,
        type: "symbol",
        source: AIRCRAFT_WEBGL_LABEL_SOURCE_ID,
        minzoom: 6.5,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 6.5, 10, 10.5, 11, 14, 12],
          "text-line-height": 1.1,
          "text-offset": [0, 1.4],
          "text-padding": 4,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-optional": true,
        },
        paint: {
          "text-color": ["case", ["any", ["get", "stale"], ["==", ["get", "source"], "NETWORK_ONLY"]], AIRRADAR_MAP_THEME.labelMuted, AIRRADAR_MAP_THEME.label],
          "text-opacity": ["get", "labelOpacity"],
          "text-halo-color": AIRRADAR_MAP_THEME.outline,
          "text-halo-width": 1,
        },
      });

      map.addSource(OGN_LABEL_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: OGN_LABEL_LAYER_ID,
        type: "symbol",
        source: OGN_LABEL_SOURCE_ID,
        minzoom: 6.5,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 6.5, 10, 10.5, 11, 14, 12],
          "text-line-height": 1.1,
          "text-offset": [0, 1.4],
          "text-padding": 4,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-optional": true,
          visibility: "none",
        },
        paint: {
          "text-color": ["case", ["get", "stale"], AIRRADAR_MAP_THEME.labelMuted, AIRRADAR_MAP_THEME.label],
          "text-opacity": ["case", ["get", "stale"], 0.72, 1],
          "text-halo-color": AIRRADAR_MAP_THEME.outline,
          "text-halo-width": 1,
        },
      });
      const ognLabelTargetId = (event: MapLayerMouseEvent): string | null => {
        const value = event.features?.[0]?.properties?.targetId;
        return typeof value === "string" && value ? value : null;
      };
      map.on("click", OGN_LABEL_LAYER_ID, (event) => {
        const id = ognLabelTargetId(event);
        if (id) selectOgn(id);
      });
      map.on("mouseenter", OGN_LABEL_LAYER_ID, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", OGN_LABEL_LAYER_ID, () => { map.getCanvas().style.cursor = ""; });
      const webglAircraftHex = (event: MapLayerMouseEvent): string | null => {
        const value = event.features?.[0]?.properties?.icaoHex;
        return typeof value === "string" && value ? value : null;
      };
      const selectWebglLabelAircraft = (event: MapLayerMouseEvent) => {
        const hex = webglAircraftHex(event);
        if (hex) selectAircraft(hex);
      };
      let hoveredWebglAircraft: string | null = null;
      const updateWebglHover = (event: maplibregl.MapMouseEvent) => {
        const hex = aircraftWebglRuntime.pickAircraftAtPoint(event.point, 13);
        if (hoveredWebglAircraft === hex) return;
        hoveredWebglAircraft = hex;
        aircraftWebglRuntime.setHovered(hex);
        if (hex) map.getCanvas().style.cursor = "pointer";
        else if (map.getCanvas().style.cursor === "pointer") map.getCanvas().style.cursor = "";
      };
      const selectWebglAircraft = (event: maplibregl.MapMouseEvent) => {
        const hex = aircraftWebglRuntime.pickAircraftAtPoint(event.point, 13);
        if (hex) selectAircraft(hex);
      };
      map.on("click", AIRCRAFT_WEBGL_LABEL_LAYER_ID, selectWebglLabelAircraft);
      map.on("mousemove", updateWebglHover);
      map.on("click", selectWebglAircraft);
      map.getCanvas().addEventListener("mouseleave", () => {
        hoveredWebglAircraft = null;
        aircraftWebglRuntime.setHovered(null);
      });
      const refreshWebglLabelGeometry = () => {
        const now = performance.now();
        if (now - aircraftWebglLabelsUpdatedAtRef.current < 500) return;
        const source = map.getSource(AIRCRAFT_WEBGL_LABEL_SOURCE_ID) as GeoJSONSource | undefined;
        if (!source) return;
        const zoom = map.getZoom();
        source.setData({
          type: "FeatureCollection",
          features: [...aircraftWebglLabelAircraftRef.current.values()].map((aircraft) => aircraftWebglLabelFeature(
            aircraft,
            zoom,
            aircraftWebglRuntime.getRenderedPosition(aircraft.icaoHex),
          )),
        });
        aircraftWebglLabelsUpdatedAtRef.current = now;
      };
      map.on("render", refreshWebglLabelGeometry);

      const updateAircraftHeadingsForMapBearing = () => {
        const bearing = map.getBearing();
        for (const handle of aircraftMarkers.values()) {
          if (handle.geographicHeading !== null) setAircraftMarkerHeading(handle, handle.geographicHeading, bearing);
        }
      };
      const scheduleLabelCollision = () => labelCollisionSchedulerRef.current?.();
      let liveLabelLevel = aircraftMapLabelLevel(map.getZoom());
      const updateLiveZoomLabels = () => {
        const zoom = map.getZoom();
        for (const handle of aircraftMarkers.values()) setAircraftMarkerZoom(handle, zoom);
        const nextLevel = aircraftMapLabelLevel(zoom);
        if (nextLevel !== liveLabelLevel) {
          liveLabelLevel = nextLevel;
          setMapZoom(zoom);
        }
        scheduleLabelCollision();
      };
      map.on("zoom", updateLiveZoomLabels);
      map.on("zoomend", () => {
        const zoom = map.getZoom();
        liveLabelLevel = aircraftMapLabelLevel(zoom);
        setMapZoom(zoom);
        scheduleLabelCollision();
      });
      map.on("move", scheduleLabelCollision);
      map.on("moveend", scheduleLabelCollision);
      map.on("rotate", () => {
        updateAircraftHeadingsForMapBearing();
        scheduleLabelCollision();
      });
      map.on("rotateend", scheduleLabelCollision);
      // Dataset fetches and map construction are independent lifecycles. The
      // refs retain the newest payload so a dataset that arrived before the
      // map load is applied to this map instance as soon as its sources exist.
      (map.getSource("ats-routes") as GeoJSONSource | undefined)?.setData(atsGeoJsonRef.current.segments as FeatureCollection);
      (map.getSource("ats-route-labels") as GeoJSONSource | undefined)?.setData(atsGeoJsonRef.current.labels as FeatureCollection);
      (map.getSource("ats-route-points") as GeoJSONSource | undefined)?.setData(atsGeoJsonRef.current.points as FeatureCollection);
      (map.getSource("route-airports") as GeoJSONSource | undefined)?.setData(airportGeoJsonRef.current);
      for (const replay of Object.values(mapReplays)) replay.setReady(true);
      setMapReady(true);
    });

    return () => {
      for (const replay of Object.values(mapReplays)) replay.setReady(false);
      labelCollisionScheduler.dispose();
      labelCollisionSchedulerRef.current = null;
      aircraftMotionRuntime.dispose();
      if (aircraftMotionRuntimeRef.current === aircraftMotionRuntime) aircraftMotionRuntimeRef.current = null;
      aircraftWebglRuntime.clear();
      if (aircraftWebglRuntimeRef.current === aircraftWebglRuntime) aircraftWebglRuntimeRef.current = null;
      aircraftWebglLabelAircraftRef.current.clear();
      aircraftWebglLabelsUpdatedAtRef.current = Number.NEGATIVE_INFINITY;
      if (aircraftMapSyncFrameRef.current !== null) window.cancelAnimationFrame(aircraftMapSyncFrameRef.current);
      aircraftMapSyncFrameRef.current = null;
      for (const handle of aircraftMarkers.values()) handle.marker.remove();
      aircraftMarkers.clear();
      for (const handle of ognMarkers.values()) handle.marker.remove();
      ognMarkers.clear();
      liveTrails.clear();
      performanceDiagnosticsDisposed = true;
      performanceDiagnostics?.stop();
      attributionBreakpoint.removeEventListener("change", onAttributionBreakpoint);
      map.remove();
      attributionControlRef.current = null;
      if (window.__airradarMapForDiagnostics === map) delete window.__airradarMapForDiagnostics;
      if (window.__airradarMapStyleLoadedForDiagnostics !== undefined) delete window.__airradarMapStyleLoadedForDiagnostics;
      if (window.__airradarMapStyleLoadCountForDiagnostics !== undefined) delete window.__airradarMapStyleLoadCountForDiagnostics;
      if (window.__airradarMapResizeCountForDiagnostics !== undefined) delete window.__airradarMapResizeCountForDiagnostics;
      if (window.__airradarAircraftMarkersForDiagnostics === aircraftMarkers) delete window.__airradarAircraftMarkersForDiagnostics;
      if (window.__airradarWebglAircraftForDiagnostics === aircraftWebglRuntime) delete window.__airradarWebglAircraftForDiagnostics;
      mapRef.current = null;
      setMapReady(false);
    };
  }, [liveTrailsRef, router, selectAircraft, selectOgn]);

  useEffect(() => {
    const map = mapRef.current;
    const previous = attributionControlRef.current;
    if (!map || !previous) return;
    // MapLibre's public AttributionControl API has no runtime setter. Replace
    // just this control when network availability changes; never recreate the map.
    const next = new maplibregl.AttributionControl({
      compact: true,
      customAttribution: airRadarMapAttributions(networkEnabled),
    });
    map.removeControl(previous);
    map.addControl(next, "bottom-right");
    collapseNarrowRadarAttribution(map);
    attributionControlRef.current = next;
  }, [networkEnabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const receiver = snapshot.receiver;
    receiverRef.current = receiver;
    if (receiver.lat === null || receiver.lon === null) return;
    if (shouldRecenterOnReceiver(snapshot.provider, centeredReceiverRef.current, receiver)) {
      map.jumpTo({ center: [receiver.lon, receiver.lat] });
      centeredReceiverRef.current = { name: receiver.name, lat: receiver.lat, lon: receiver.lon };
    }
  }, [mapReady, snapshot.provider, snapshot.receiver]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("aviation-sigmet") as GeoJSONSource | undefined;
    source?.setData(sigmetData as unknown as FeatureCollection);
    for (const layer of ["aviation-sigmet-fill", "aviation-sigmet-line"] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", showSigmet && sigmetEnabled === true ? "visible" : "none");
    }
  }, [mapReady, showSigmet, sigmetData, sigmetEnabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const visible = showOgn && ognEnabled === true;
    const ognMarkers = ognMarkersRef.current;
    const currentIds = new Set<string>();
    const visibleTargets = ognSnapshot.targets.filter((target) => !snapshot.aircraft.some((aircraft) => isOgnDuplicateOfAircraft(target, aircraft)));

    for (const target of visibleTargets) {
      if (!Number.isFinite(target.latitude) || !Number.isFinite(target.longitude)) continue;
      currentIds.add(target.id);
      let handle = ognMarkers.get(target.id);
      if (!handle) {
        const root = document.createElement("div");
        root.className = "ogn-marker";
        root.classList.add("aircraft-marker");
        root.setAttribute("role", "button");
        root.setAttribute("tabindex", "0");
        const visual = document.createElement("div");
        visual.className = "aircraft-marker-visual";
        const rotator = document.createElement("div");
        rotator.className = "aircraft-plane-rotator";
        const icon = document.createElement("div");
        icon.className = "aircraft-plane";
        rotator.appendChild(icon);
        visual.appendChild(rotator);
        const label = document.createElement("div");
        label.className = "aircraft-label";
        const labelPrimary = document.createElement("span");
        labelPrimary.className = "aircraft-label-primary";
        const labelSecondary = document.createElement("span");
        labelSecondary.className = "aircraft-label-secondary";
        label.append(labelPrimary, labelSecondary);
        visual.appendChild(label);
        root.appendChild(visual);
        root.addEventListener("click", () => selectOgn(target.id));
        root.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectOgn(target.id);
          }
        });
        handle = {
          marker: new maplibregl.Marker({ element: root, anchor: "center", subpixelPositioning: true })
            .setLngLat([target.longitude, target.latitude])
            .addTo(map),
          root,
          icon,
          rotator,
          labelPrimary,
          labelSecondary,
          label,
          labelText: null,
          labelPriority: "normal",
          labelWidth: null,
          labelHeight: null,
        };
        ognMarkers.set(target.id, handle);
      } else {
        handle.marker.setLngLat([target.longitude, target.latitude]);
      }
      const presentation = toOgnTrafficPresentation(target);
      handle.root.setAttribute("aria-label", radarTrafficAriaLabel(presentation));
      handle.root.setAttribute("aria-pressed", String(target.id === selectedOgnId));
      handle.root.classList.toggle("selected", target.id === selectedOgnId);
      handle.root.classList.toggle("stale", target.stale);
      handle.root.style.visibility = visible ? "visible" : "hidden";
      if (handle.icon.dataset.aircraftType !== target.aircraftType) {
        handle.icon.dataset.aircraftType = target.aircraftType;
        handle.icon.innerHTML = ognGlyphMarkup(target.aircraftType);
      }
      handle.icon.style.setProperty("--aircraft-icon-size", `${aircraftIconSizeAtZoom(aircraftIconSizeForPresentation(presentation.iconKind), mapZoom)}px`);
      const markerColor = aircraftColor({ altitude: presentation.altitudeFt, groundSpeed: presentation.speedKt, verticalRate: presentation.verticalRateFpm }, colorMode);
      if (markerColor) handle.icon.style.setProperty("--aircraft-color", markerColor);
      else handle.icon.style.removeProperty("--aircraft-color");
      handle.rotator.style.transform = target.trackDeg === null ? "" : `rotate(${target.trackDeg}deg)`;
      const selected = target.id === selectedOgnId;
      const baseLabel = trafficMapLabelText({
        identity: presentation.primaryLabel,
        altitudeFt: presentation.altitudeFt,
        speedKt: presentation.speedKt,
      }, mapZoom, { suppressTelemetry: target.stale && !selected });
      const domLabel = selected ? (baseLabel ?? presentation.primaryLabel) : null;
      const labelChanged = setOgnDomLabel(handle, domLabel);
      handle.labelPriority = selected ? "selected" : target.stale ? "stale" : "normal";
      handle.label.dataset.priority = handle.labelPriority;
      if (labelChanged) labelCollisionSchedulerRef.current?.();
    }

    for (const [id, handle] of ognMarkers) {
      if (currentIds.has(id)) continue;
      handle.marker.remove();
      ognMarkers.delete(id);
    }

    const labelSource = map.getSource(OGN_LABEL_SOURCE_ID) as GeoJSONSource | undefined;
    labelSource?.setData({
      type: "FeatureCollection",
      features: visible
        ? visibleTargets
          .filter((target) => Number.isFinite(target.latitude) && Number.isFinite(target.longitude))
          .map((target) => ognMapLabelFeature(target, mapZoom, target.id === selectedOgnId))
        : [],
    });
    if (map.getLayer(OGN_LABEL_LAYER_ID)) {
      map.setLayoutProperty(OGN_LABEL_LAYER_ID, "visibility", visible ? "visible" : "none");
    }
    labelCollisionSchedulerRef.current?.();
  }, [colorMode, mapReady, mapZoom, ognEnabled, ognSnapshot.targets, selectOgn, selectedOgnId, showOgn, snapshot.aircraft]);

  const mapFilteredAircraft = useMemo(
    () => filterAircraftForMap(snapshot.aircraft, mapFilters),
    [mapFilters, snapshot.aircraft],
  );
  useEffect(() => {
    if (activeCoverage === "local" && mapFilters.source !== "all" && mapFilters.source !== "local") setMapFilters((current) => ({ ...current, source: "local" }));
  }, [activeCoverage, mapFilters.source]);
  const filteredAircraft = useMemo(() => {
    const query = search.trim().toUpperCase();
    const filtered = mapFilteredAircraft.filter((aircraft) => {
      if (query && !aircraftSearchText(aircraft).includes(query)) return false;
      if (distanceFilter !== "all" && (aircraft.distanceKm === null || aircraft.distanceKm > Number(distanceFilter))) return false;
      if (watchlistOnly && !isWatchlisted(aircraft)) return false;
      return true;
    });
    if (sortBy === "callsign") return filtered.sort((a, b) => labelForAircraft(a).localeCompare(labelForAircraft(b)));
    if (sortBy === "altitude") return filtered.sort((a, b) => (b.altitude ?? -Infinity) - (a.altitude ?? -Infinity));
    // SSE snapshots are already distance-sorted and filters preserve input
    // order, so the default view avoids a redundant O(n log n) sort.
    return filtered;
  }, [distanceFilter, isWatchlisted, mapFilteredAircraft, search, sortBy, watchlistOnly]);
  const filteredOgnTargets = useMemo(() => {
    const query = search.trim().toUpperCase();
    if (!query) return ognSnapshot.targets;
    return ognSnapshot.targets.filter((target) => [
      ognTargetLabel(target),
      target.senderCallsign,
      target.aircraftType,
      target.identityVisible ? target.registration : null,
      target.identityVisible ? target.competitionNumber : null,
      target.identityVisible ? target.model : null,
      target.identityVisible ? target.address : null,
    ].filter(Boolean).join(" ").toUpperCase().includes(query));
  }, [ognSnapshot.targets, search]);

  const selectedRouteAirportCodesKey = useMemo(() => {
    const selectedRoute = snapshot.aircraft.find((aircraft) => aircraft.icaoHex === selectedHex)?.enrichment?.route;
    return [
      selectedRoute?.originAirport?.icaoCode ?? selectedRoute?.origin,
      selectedRoute?.destinationAirport?.icaoCode ?? selectedRoute?.destination,
    ]
      .filter((icao): icao is string => Boolean(icao))
      .map((icao) => icao.trim().toUpperCase())
      .join("|");
  }, [selectedHex, snapshot.aircraft]);

  const syncAircraftMap = useCallback((forceFull = false) => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const pending = pendingAircraftChangesRef.current;
    if (!forceFull && pending === null) return;
    pendingAircraftChangesRef.current = null;
    const liveSnapshot = liveSnapshotRef.current;
    const liveMapFilteredAircraft = filterAircraftForMap(liveSnapshot.aircraft, mapFilters);
    const query = search.trim().toUpperCase();
    const liveFilteredAircraft = liveMapFilteredAircraft.filter((aircraft) => {
      if (query && !aircraftSearchText(aircraft).includes(query)) return false;
      if (distanceFilter !== "all" && (aircraft.distanceKm === null || aircraft.distanceKm > Number(distanceFilter))) return false;
      if (watchlistOnly && !isLiveAircraftWatchlisted(aircraft)) return false;
      return true;
    });
    const liveFilteredAircraftByHex = new Map(liveFilteredAircraft.map((aircraft) => [aircraft.icaoHex, aircraft] as const));
    const isPositionedAircraft = (aircraft: AircraftView) => aircraft.lat !== null
      && aircraft.lon !== null
      && Number.isFinite(aircraft.lat)
      && Number.isFinite(aircraft.lon);
    const multiAircraftSet = new Set(multiAircraftMode ? multiAircraftHexes : []);
    const isHtmlSpecialAircraft = (aircraft: AircraftView) => aircraft.icaoHex === selectedHex
      || multiAircraftSet.has(aircraft.icaoHex)
      || isLiveAircraftWatchlisted(aircraft)
      || Boolean(aircraft.emergency);
    const liveSpecialAircraft = liveFilteredAircraft.filter((aircraft) => isPositionedAircraft(aircraft) && isHtmlSpecialAircraft(aircraft));
    const liveSpecialAircraftByHex = new Map(liveSpecialAircraft.map((aircraft) => [aircraft.icaoHex, aircraft] as const));
    const liveBulkAircraft = liveFilteredAircraft.filter((aircraft) => isPositionedAircraft(aircraft) && !isHtmlSpecialAircraft(aircraft));
    const trafficPadding = currentRadarPadding({ top: 100, right: 45, bottom: 40, left: 45 });
    if (!centeredTrafficRef.current && (liveSnapshot.receiver.lat === null || liveSnapshot.receiver.lon === null) && liveSnapshot.aircraft.length) {
      const positioned = liveSnapshot.aircraft.filter((aircraft) => aircraft.lat !== null && aircraft.lon !== null
        && Number.isFinite(aircraft.lat) && Number.isFinite(aircraft.lon));
      if (positioned.length) {
        const bounds = new maplibregl.LngLatBounds();
        for (const aircraft of positioned) bounds.extend([aircraft.lon!, aircraft.lat!]);
        map.fitBounds(bounds, { padding: trafficPadding, maxZoom: 8, duration: 0 });
        centeredTrafficRef.current = true;
      }
    }
    if (selectedHex !== focusedAircraftRef.current) {
      const aircraft = liveSnapshot.aircraft.find((item) => item.icaoHex === selectedHex);
      if (!selectedHex) focusedAircraftRef.current = null;
      else if (aircraft?.lat != null && aircraft.lon != null) {
        // Center on the marker's rendered position so prediction does not leave
        // the selected aircraft visibly ahead of the camera target.
        const rendered = aircraftMarkersRef.current.get(selectedHex)?.marker.getLngLat();
        const center: [number, number] = [rendered?.lng ?? aircraft.lon, rendered?.lat ?? aircraft.lat];
        map.easeTo({ center, padding: currentRadarPadding(), duration: prefersReducedMotion() ? 0 : 350 });
        focusedAircraftRef.current = selectedHex;
      }
    }
    const fullMarkerUpdate = forceFull || pending?.full === true;
    const currentHexes = fullMarkerUpdate ? new Set(liveSpecialAircraft.map((aircraft) => aircraft.icaoHex)) : null;
    const aircraftToUpdate = fullMarkerUpdate
      ? liveSpecialAircraft
      : [...(pending?.changedHexes ?? [])]
        .map((hex) => liveSpecialAircraftByHex.get(hex))
        .filter((aircraft): aircraft is AircraftView => Boolean(aircraft));

    const aircraftWebglRuntime = aircraftWebglRuntimeRef.current;
    aircraftWebglRuntime?.setVisible(showAircraft);
    if (map.getLayer(AIRCRAFT_WEBGL_LABEL_LAYER_ID)) {
      map.setLayoutProperty(AIRCRAFT_WEBGL_LABEL_LAYER_ID, "visibility", showAircraft ? "visible" : "none");
    }

    if (fullMarkerUpdate) {
      const bulkAircraft = liveBulkAircraft.map((aircraft) => ({ ...aircraft }));
      aircraftWebglRuntime?.sync(bulkAircraft, colorMode);
      aircraftWebglLabelAircraftRef.current = new Map(bulkAircraft.map((aircraft) => [aircraft.icaoHex, aircraft] as const));
      aircraftWebglLabelsUpdatedAtRef.current = Number.NEGATIVE_INFINITY;
    } else {
      const changedOrRemovedHexes = new Set([
        ...(pending?.changedHexes ?? []),
        ...(pending?.removedHexes ?? []),
      ]);
      for (const hex of changedOrRemovedHexes) {
        const aircraft = liveFilteredAircraftByHex.get(hex);
        if (aircraft && isPositionedAircraft(aircraft) && !isHtmlSpecialAircraft(aircraft)) {
          const bulkAircraft = { ...aircraft };
          aircraftWebglRuntime?.upsert(bulkAircraft, colorMode);
          aircraftWebglLabelAircraftRef.current.set(hex, bulkAircraft);
        } else {
          aircraftWebglRuntime?.remove(hex);
          aircraftWebglLabelAircraftRef.current.delete(hex);
        }
      }
    }

    const selectedAircraftInSnapshot = selectedHex ? liveAircraftByHexRef.current.get(selectedHex) ?? liveSnapshot.aircraft.find((aircraft) => aircraft.icaoHex === selectedHex) : undefined;
    const selectedAircraftVisible = Boolean(selectedAircraftInSnapshot && selectedHex && liveFilteredAircraftByHex.has(selectedHex));
    const historySnapshot = selectedHistoryTrail;
    const historyTrail = selectedAircraftVisible && historySnapshot && historySnapshot.icaoHex === selectedHex?.toUpperCase() ? historySnapshot.points : EMPTY_TRAIL;
    let selectedTrailForMap: readonly TrailPoint[] = EMPTY_TRAIL;
    if (selectedAircraftVisible && selectedHex) {
      const liveTrail = liveTrailsRef.current.get(selectedHex) ?? EMPTY_TRAIL;
      const inputs = {
        icaoHex: selectedHex,
        history: historyTrail,
        liveLength: liveTrail.length,
        liveEndpointKey: trailEndpointKey(liveTrail.at(-1)),
      };
      const previousInputs = selectedTrailInputsRef.current;
      const inputsChanged = !previousInputs
        || previousInputs.icaoHex !== inputs.icaoHex
        || previousInputs.history !== inputs.history
        || previousInputs.liveLength !== inputs.liveLength
        || previousInputs.liveEndpointKey !== inputs.liveEndpointKey;
      if (inputsChanged) {
        selectedConfirmedTrailRef.current = selectedTrail(liveTrailsRef.current, selectedHex, historyTrail, Date.now());
        selectedTrailInputsRef.current = inputs;
      }
      selectedTrailForMap = selectedConfirmedTrailRef.current;
    } else {
      selectedTrailInputsRef.current = null;
      selectedConfirmedTrailRef.current = EMPTY_TRAIL;
    }

    for (const aircraft of aircraftToUpdate) {
      if (aircraft.lat === null || aircraft.lon === null || !Number.isFinite(aircraft.lat) || !Number.isFinite(aircraft.lon)) continue;
      let handle = aircraftMarkersRef.current.get(aircraft.icaoHex);
      const target: [number, number] = [aircraft.lon, aircraft.lat];
      if (!handle) {
        handle = createAircraftMarkerHandle(map, aircraft, target, selectAircraft, () => labelCollisionSchedulerRef.current?.());
        aircraftMarkersRef.current.set(aircraft.icaoHex, handle);
      }
      // Pass a shallow copy because React's immutability lint treats snapshot
      // values as render-owned when they cross the animation helper boundary.
      aircraftMotionRuntimeRef.current?.upsert({ ...aircraft }, handle);
      const selectedState = aircraft.icaoHex === selectedHex;
      handle.root.dataset.multiPinned = multiAircraftSet.has(aircraft.icaoHex) ? "true" : "false";
      const reportedTrueHeading = aircraftReportedTrueHeading(aircraft);
      const renderedHeading = aircraftMotionRuntimeRef.current?.renderedHeading(
        aircraft.icaoHex,
        reportedTrueHeading ?? aircraft.track,
      ) ?? reportedTrueHeading ?? aircraft.track;
      const labelChanged = updateAircraftMarkerHandle(handle, { ...aircraft }, {
        selected: selectedState,
        watchlisted: isLiveAircraftWatchlisted(aircraft),
        emergency: Boolean(aircraft.emergency),
        showAircraft,
        zoom: mapZoom,
        colorMode,
        mapBearing: map.getBearing(),
        heading: renderedHeading,
      });
      if (labelChanged) labelCollisionSchedulerRef.current?.();
    }
    labelCollisionSchedulerRef.current?.();

    const markerRemovalCandidates = fullMarkerUpdate
      ? [...aircraftMarkersRef.current.keys()]
      : [...new Set([
        ...(pending?.removedHexes ?? []),
        ...[...(pending?.changedHexes ?? [])].filter((hex) => {
          const aircraft = liveSpecialAircraftByHex.get(hex);
          return !aircraft || !isPositionedAircraft(aircraft);
        }),
      ])];
    for (const hex of markerRemovalCandidates) {
      const handle = aircraftMarkersRef.current.get(hex);
      if (!handle || (fullMarkerUpdate && currentHexes?.has(hex))) continue;
      if (hex === selectedHex && selectedAircraftVisible && selectedTrailForMap.length > 0) {
        const lastKnown = selectedTrailForMap[selectedTrailForMap.length - 1];
        handle.marker.setLngLat([lastKnown.lon, lastKnown.lat]);
        handle.root.style.visibility = showAircraft ? "visible" : "hidden";
        continue;
      }
      aircraftMotionRuntimeRef.current?.remove(hex);
      handle.marker.remove();
      aircraftMarkersRef.current.delete(hex);
      labelCollisionSchedulerRef.current?.();
    }

    const multiSource = map.getSource("multi-aircraft-trails") as GeoJSONSource | undefined;
    if (multiSource && multiAircraftMode) {
      multiSource.setData({ type: "FeatureCollection", features: multiAircraftHexes.flatMap((hex) => {
        if (hex === selectedHex || !liveFilteredAircraftByHex.has(hex)) return [];
        const points = liveTrailsRef.current.get(hex) ?? EMPTY_TRAIL;
        const safe = boundTrailPoints(points, Date.now());
        return safe.length > 1 ? [{ type: "Feature" as const, properties: { icaoHex: hex }, geometry: { type: "LineString" as const, coordinates: safe.map((point) => [point.lon, point.lat]) } }] : [];
      }) });
    } else if (multiSource) {
      multiSource.setData({ type: "FeatureCollection", features: [] });
    }
    const selected = selectedAircraftVisible ? selectedAircraftInSnapshot : undefined;
    const trailSource = map.getSource("selected-trail") as GeoJSONSource | undefined;
    if (trailSource && selectedTrailSourceRef.current !== selectedTrailForMap) {
      trailSource.setData(selectedAircraftVisible && selectedTrailForMap.length > 1
        ? { type: "Feature", properties: { icaoHex: selectedHex }, geometry: { type: "LineString", coordinates: selectedTrailForMap.map((point) => [point.lon, point.lat]) } }
        : { type: "FeatureCollection", features: [] });
      selectedTrailSourceRef.current = selectedTrailForMap;
    }
    for (const layer of ["selected-trail-line", "selected-trail-live-tail-line"] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", selectedAircraftVisible ? "visible" : "none");
    }
    for (const layer of [ROUTE_V2_COMPLETED_LAYER_ID, ROUTE_V2_REMAINING_LAYER_ID] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", selectedAircraftVisible && !routeIntelligenceActiveRef.current ? "visible" : "none");
    }
    for (const layer of [ROUTE_V2_AIRPORT_CIRCLE_LAYER_ID, ROUTE_V2_AIRPORT_LABEL_LAYER_ID] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", selectedAircraftVisible && showAirports ? "visible" : "none");
    }
    const routeSource = map.getSource(ROUTE_V2_SOURCE_ID) as GeoJSONSource | undefined;
    const routeSourceKey = selectedAircraftVisible && selected
      ? `${selected.icaoHex}|${positionObservedAt(selected) ?? ""}|${selected.lat ?? ""}|${selected.lon ?? ""}|${selectedRouteAirportCodesKey}`
      : "";
    if (routeSource && routeSourceKeyRef.current !== routeSourceKey) {
      routeSource.setData(selectedAircraftVisible ? createRouteGeoJSON(
        selected?.enrichment?.route,
        selected && selected.lat !== null && selected.lon !== null ? { lat: selected.lat, lon: selected.lon } : null,
      ) : { type: "FeatureCollection", features: [] });
      routeSourceKeyRef.current = routeSourceKey;
    }
    const routeAirportSource = map.getSource(ROUTE_V2_AIRPORT_SOURCE_ID) as GeoJSONSource | undefined;
    const routeAirportSourceKey = selectedAircraftVisible ? selectedRouteAirportCodesKey : "";
    if (routeAirportSource && routeAirportSourceKeyRef.current !== routeAirportSourceKey) {
      const routeAirportGeoJson = selectedAircraftVisible
        ? createRouteAirportGeoJSON(selected?.enrichment?.route)
        : createRouteAirportGeoJSON(null);
      routeAirportGeoJsonRef.current = routeAirportGeoJson;
      routeAirportSource.setData(routeAirportGeoJson);
      routeAirportSourceKeyRef.current = routeAirportSourceKey;
      labelCollisionSchedulerRef.current?.();
    }
  }, [colorMode, currentRadarPadding, distanceFilter, isLiveAircraftWatchlisted, liveAircraftByHexRef, liveSnapshotRef, liveTrailsRef, mapFilters, mapReady, mapZoom, multiAircraftHexes, multiAircraftMode, pendingAircraftChangesRef, search, selectedHistoryTrail, selectedRouteAirportCodesKey, showAircraft, showAirports, selectedHex, selectAircraft, watchlistOnly]);

  useEffect(() => {
    aircraftMapSyncRef.current = syncAircraftMap;
    syncAircraftMap(true);
    return () => {
      if (aircraftMapSyncRef.current === syncAircraftMap) aircraftMapSyncRef.current = null;
    };
  }, [syncAircraftMap]);

  useEffect(() => {
    const visible = showAtsRoutes && atsRoutes?.available === true;
    const geojson = visible && atsRoutes?.segments && atsRoutes.labels && atsRoutes.points
      ? { segments: atsRoutes.segments, labels: atsRoutes.labels, points: atsRoutes.points }
      : { segments: EMPTY_ATS_GEOJSON, labels: EMPTY_ATS_GEOJSON, points: EMPTY_ATS_GEOJSON };
    atsGeoJsonRef.current = geojson;
    mapReplayRef.current.atsSegments.setData(geojson.segments as FeatureCollection);
    mapReplayRef.current.atsLabels.setData(geojson.labels as FeatureCollection);
    mapReplayRef.current.atsPoints.setData(geojson.points as FeatureCollection);
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource("ats-routes") as GeoJSONSource | undefined)?.setData(geojson.segments as FeatureCollection);
    (map.getSource("ats-route-labels") as GeoJSONSource | undefined)?.setData(geojson.labels as FeatureCollection);
    (map.getSource("ats-route-points") as GeoJSONSource | undefined)?.setData(geojson.points as FeatureCollection);
    if (map.getLayer("ats-routes-selected")) map.setFilter("ats-routes-selected", ["==", ["get", "routeDesignator"], selectedAtsRoute ?? ""]);
    for (const layer of ["ats-routes-line", "ats-routes-cdr", "ats-routes-selected", "ats-route-labels", "ats-route-points", "ats-route-points-label"] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", visible ? "visible" : "none");
    }
  }, [atsRoutes, mapReady, selectedAtsRoute, showAtsRoutes]);

  useEffect(() => {
    if (!atsPointFocus) return;
    setShowAtsRoutes(true);
    if (!mapReady || !atsRoutes?.points) return;
    const point = atsRoutes.points.features.find((feature) => {
      const properties = feature.properties ?? {};
      return `${String(properties.countryCode ?? "")}:${String(properties.name ?? "")}` === atsPointFocus;
    });
    const coordinates = point?.geometry?.type === "Point" ? point.geometry.coordinates : null;
    if (!coordinates || typeof coordinates[0] !== "number" || typeof coordinates[1] !== "number") return;
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [coordinates[0], coordinates[1]], zoom: Math.max(map.getZoom(), 9.5), duration: prefersReducedMotion() ? 0 : 700 });
  }, [atsPointFocus, atsRoutes, mapReady]);


  // Keep published ATC sector geometry independent from retired planned-activity feeds.
  const atcGeoJson = useMemo(
    () => createAtcGeoJSON(atcData.sectors, showAtc),
    [atcData.sectors, showAtc],
  );
  const transmitterGeoJson = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: showAtc ? atcData.transmitters.filter((transmitter) => Number.isFinite(transmitter.longitude) && Number.isFinite(transmitter.latitude)
      && transmitter.longitude >= -180 && transmitter.longitude <= 180
      && transmitter.latitude >= -90 && transmitter.latitude <= 90).map((transmitter) => ({
      type: "Feature" as const,
      properties: { name: transmitter.name, service: formatAtcService(transmitter.service), frequency: formatAtcFrequency(transmitter.frequencyMhz), notes: formatAtcNote(transmitter.notes), source: transmitter.source, sourceReference: transmitter.sourceReference, validFrom: transmitter.validFrom, validTo: transmitter.validTo, lastVerifiedAt: transmitter.lastVerifiedAt },
      geometry: { type: "Point" as const, coordinates: [transmitter.longitude, transmitter.latitude] },
    })) : [],
  }), [atcData.transmitters, showAtc]);

  useEffect(() => {
    atcGeoJsonRef.current = atcGeoJson;
    transmitterGeoJsonRef.current = transmitterGeoJson;
    // Map replay sets the source once when ready, and retains data until
    // style.load if the map is not ready. No second source.setData needed.
    mapReplayRef.current.atc.setData(atcGeoJson);
    mapReplayRef.current.transmitters.setData(transmitterGeoJson);
  }, [atcGeoJson, transmitterGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    for (const layer of ["atc-sectors-fill", "atc-sectors-line", "atc-sectors-label", "atc-transmitters-circle"] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", showAtc ? "visible" : "none");
    }
  }, [mapReady, showAtc]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    // Fit only when explicitly enabling ATC. Layout/panel changes no longer
    // trigger heavy source updates, even though camera padding can change.
    if (showAtc && !atcAutoFitRef.current && atcData.sectors.length) {
      const bounds = new maplibregl.LngLatBounds();
      for (const sector of atcData.sectors) for (const polygon of sector.polygons) {
        for (const [lon, lat] of polygon) {
          if (Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90) bounds.extend([lon, lat]);
        }
      }
      if (!bounds.isEmpty()) {
        atcAutoFitRef.current = true;
        map.fitBounds(bounds, { padding: currentRadarPadding({ top: 48, right: 48, bottom: 48, left: 48 }), maxZoom: 7.5, duration: 500 });
      }
    }
    if (!showAtc) atcAutoFitRef.current = false;
  }, [atcData.sectors, currentRadarPadding, mapReady, showAtc]);

  useEffect(() => {
    const selectedRouteAirportCodes = new Set(selectedRouteAirportCodesKey.split("|").filter(Boolean));
    const airportGeoJson = createAirportGeoJSON(airports, selectedRouteAirportCodes);
    airportGeoJsonRef.current = airportGeoJson;
    mapReplayRef.current.airports.setData(airportGeoJson);
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource("route-airports") as GeoJSONSource | undefined)?.setData(airportGeoJson);
  }, [airports, mapReady, selectedRouteAirportCodesKey, snapshot.receiver.lat, snapshot.receiver.lon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource("metar-airports") as GeoJSONSource | undefined)?.setData(createMetarGeoJSON(metarObservations));
    for (const layer of ["metar-symbols", "metar-labels"] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", showMetar ? "visible" : "none");
    }
  }, [mapReady, metarObservations, showMetar]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const sourceId = "aircraft-weather-observations";
    const layerId = "aircraft-weather-observation-points";
    if (showAircraftWeather && !map.getSource(sourceId)) {
      map.addSource(sourceId, { type: "geojson", data: createAircraftWeatherGeoJSON([], aircraftWeatherMapField) });
      map.addLayer({ id: layerId, type: "circle", source: sourceId, paint: {
        "circle-color": aircraftWeatherMapField === "temperature" ? AIRRADAR_MAP_THEME.weather : AIRRADAR_MAP_THEME.accent,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 3.5, 8, 5.5, 13, 7],
        "circle-opacity": 0.9,
        "circle-stroke-color": AIRRADAR_MAP_THEME.outline,
        "circle-stroke-width": 1.4,
      } });
    }
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(showAircraftWeather ? createAircraftWeatherGeoJSON(aircraftWeatherMapObservations, aircraftWeatherMapField) : createAircraftWeatherGeoJSON([], aircraftWeatherMapField));
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", showAircraftWeather ? "visible" : "none");
    if (!showAircraftWeather || !map.getLayer(layerId)) return;
    const onWeatherClick = (event: MapLayerMouseEvent) => {
      const properties = event.features?.[0]?.properties;
      if (!properties) return;
      setFocusedAircraftWeatherObservation(String(properties.key ?? ""));
    };
    map.on("click", layerId, onWeatherClick);
    map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
    return () => {
      map.off("click", layerId, onWeatherClick);
    };
  }, [aircraftWeatherMapField, aircraftWeatherMapObservations, mapReady, showAircraftWeather]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource("navigation-integrity") as GeoJSONSource | undefined)?.setData(createNavigationIntegrityGeoJSON(navigationIntegrityCells));
    for (const layer of ["navigation-integrity-fill", "navigation-integrity-line"]) if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", showNavigationIntegrity ? "visible" : "none");
  }, [mapReady, navigationIntegrityCells, showNavigationIntegrity]);

  const airportLayerVisibility = useMemo<AirportLayerVisibility>(() => ({
    showAirports,
    showSignificant: showSignificantAirports,
    showSmall: showSmallAirports,
    showHeliports,
  }), [showAirports, showHeliports, showSignificantAirports, showSmallAirports]);
  const airportFilter = useMemo(
    () => airportVisibilityFilter(mapZoom, airportLayerVisibility) as FilterSpecification,
    [airportLayerVisibility, mapZoom],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    for (const layer of ["route-airports-circle", "route-airports-label"] as const) {
      if (map.getLayer(layer)) {
        map.setFilter(layer, airportFilter);
        map.setLayoutProperty(layer, "visibility", showAirports ? "visible" : "none");
      }
    }
  }, [airportFilter, mapReady, showAirports]);

  const selectedAircraftSnapshot = snapshot.aircraft.find((aircraft) => aircraft.icaoHex === selectedHex) ?? null;
  const selectedAircraft = useMemo(() => selectedAircraftSnapshot && aircraftDetail?.liveEnrichment
    ? { ...selectedAircraftSnapshot, enrichment: aircraftDetail.liveEnrichment }
    : selectedAircraftSnapshot, [aircraftDetail, selectedAircraftSnapshot]);
  const selectedDatabaseAircraft = aircraftDetail?.aircraft ?? null;
  const selectedRoute = useSelectedRoute(selectedAircraft);
  const selectedSigmetContext = useMemo(() => aircraftSigmetContext(selectedAircraft, sigmetData), [selectedAircraft, sigmetData]);
  const selectedOgnTarget = ognSnapshot.targets.find((target) => target.id === selectedOgnId) ?? null;
  const selectedIdentity = selectedAircraft?.icaoHex ?? selectedDatabaseAircraft?.icaoHex ?? selectedHex;
  const contextAircraftHex = selectedAircraftSnapshot?.icaoHex ?? null;
  const contextHasPosition = selectedAircraftSnapshot?.lat !== null && selectedAircraftSnapshot?.lon !== null;
  const {
    atcContext: selectedAtcContext,
  } = useRadarAircraftContext({ aircraftHex: contextAircraftHex, hasPosition: contextHasPosition });
  const selectedAircraftVisible = Boolean(selectedAircraft && filteredAircraft.some((aircraft) => aircraft.icaoHex === selectedAircraft.icaoHex));
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(ROUTE_INTELLIGENCE_SOURCE_ID) as GeoJSONSource | undefined;
    const geojson = selectedAircraftVisible
      ? createRouteIntelligenceGeoJSON(selectedRoute.route)
      : emptyRouteIntelligenceGeoJSON();
    const active = selectedAircraftVisible && geojson.features.length > 0;
    routeIntelligenceActiveRef.current = active;
    source?.setData(geojson);
    for (const layer of [ROUTE_INTELLIGENCE_COMPLETED_LAYER_ID, ROUTE_INTELLIGENCE_CURRENT_LAYER_ID, ROUTE_INTELLIGENCE_REMAINING_LAYER_ID] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", active ? "visible" : "none");
    }
    for (const layer of [ROUTE_V2_COMPLETED_LAYER_ID, ROUTE_V2_REMAINING_LAYER_ID] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", selectedAircraftVisible && !active ? "visible" : "none");
    }
  }, [mapReady, selectedAircraftVisible, selectedRoute.route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const airspaceId = selectedAircraftVisible && selectedAtcContext?.status === "available" ? selectedAtcContext.primaryAirspace?.id ?? "__context-none__" : "__context-none__";
    const route = selectedAircraftVisible && selectedAtcContext?.status === "available" ? selectedAtcContext.atsRoute : null;
    const segmentId = route && (route.confidence === "high" || route.confidence === "medium") ? route.segmentId : "__context-none__";
    if (map.getLayer("atc-sectors-context-highlight")) {
      map.setFilter("atc-sectors-context-highlight", ["==", ["get", "id"], airspaceId]);
      map.setLayoutProperty("atc-sectors-context-highlight", "visibility", showAtc && airspaceId !== "__context-none__" ? "visible" : "none");
    }
    if (map.getLayer("ats-route-context-highlight")) {
      map.setFilter("ats-route-context-highlight", ["==", ["get", "segmentId"], segmentId]);
      map.setLayoutProperty("ats-route-context-highlight", "visibility", showAtsRoutes && segmentId !== "__context-none__" ? "visible" : "none");
    }
  }, [mapReady, selectedAircraftVisible, selectedAtcContext, showAtc, showAtsRoutes]);
  const hasActiveMapFilters = isMapAircraftFilterActive(mapFilters)
    || search.trim() !== ""
    || distanceFilter !== "all"
    || watchlistOnly;
  const activeFilterCount = [
    mapFilters.source !== "all",
    mapFilters.status !== "all",
    mapFilters.quick !== "all",
    mapFilters.minAltitude.trim() !== "",
    mapFilters.maxAltitude.trim() !== "",
    mapFilters.callsign.trim() !== "",
    mapFilters.registration.trim() !== "",
    mapFilters.icaoHex.trim() !== "",
    mapFilters.aircraftType.trim() !== "",
    mapFilters.operator.trim() !== "",
    mapFilters.emergencyOnly,
    search.trim() !== "",
    distanceFilter !== "all",
    watchlistOnly,
  ].filter(Boolean).length;
  const isDemo = snapshot.provider === "mock";
  const hasSourceSnapshot = snapshot.lastSourceUpdate !== null;
  const statusOffline = !isDemo && hasSourceSnapshot && !snapshot.sourceOnline;
  const sourceAgeMs = snapshot.lastSourceUpdate ? Math.max(0, Date.now() - Date.parse(snapshot.lastSourceUpdate)) : null;
  const statusStale = !isDemo && !statusOffline && sourceAgeMs !== null && sourceAgeMs > 30_000;
  const statusReconnecting = !isDemo && !statusOffline && !statusStale && hasSourceSnapshot && !streamConnected;
  const receiverStatusVariant = statusOffline ? "danger" : statusStale ? "stale" : statusReconnecting || !hasSourceSnapshot ? "warning" : isDemo ? "demo" : "live";
  const receiverStatusLabel = statusOffline ? t.status.receiverOffline : statusStale ? t.status.stale : statusReconnecting ? t.status.reconnecting : isDemo ? t.status.mockReceiver : streamConnected ? t.status.liveReceiver : t.status.connecting;
  const receiverStatusShort = statusOffline ? t.status.offlineShort : statusStale ? t.status.staleShort : statusReconnecting ? t.status.reconnectingShort : isDemo ? t.status.demoShort : streamConnected ? t.status.liveShort : t.status.connectingShort;
  const displayedAircraftCount = snapshot.coverageStats?.displayedAircraft ?? snapshot.stats.currentAircraft;
  const activeTrafficCount = trafficSource === "ogn" ? filteredOgnTargets.length : filteredAircraft.length;
  const drawerState: RadarDrawerState = selectedOgnTarget
    ? "ogn"
    : selectedAircraft || selectedDatabaseAircraft
      ? "aircraft"
      : trafficOpen
        ? "traffic"
        : "closed";
  useEffect(() => {
    if (drawerState !== "closed" && mapFocus) setMapFocus(false);
  }, [drawerState, mapFocus]);
  useEffect(() => {
    // A CSS grid width change needs one MapLibre resize, not a new map.
    const frame = window.requestAnimationFrame(() => mapRef.current?.resize());
    return () => window.cancelAnimationFrame(frame);
  }, [mapFocus, drawerState]);

  useRadarDrawerInteractions({
    drawerState,
    trafficSource,
    filtersOpen,
    setFiltersOpen,
    closeRadarDrawer,
    openTrafficDrawer,
    searchInputRef,
    focusSearchOnTrafficOpenRef,
    trafficTriggerRef,
    previousDrawerStateRef,
  });
  const networkStatus = snapshot.sources?.adsbLol.status;
  const networkNotice = activeCoverage === "extended" && networkStatus === "rate_limited"
    ? t.radar.networkRateLimited
    : activeCoverage === "extended" && networkStatus && ["timeout", "http_error", "invalid_response", "stale"].includes(networkStatus)
      ? t.radar.networkUnavailable
      : null;
  const selectedRadarFrame = radarStatus === "ready" || radarStatus === "stale"
    ? radarCatalog?.frames.find((frame) => frame.id === radarFrameId) ?? null
    : null;
  const weatherView = radarWeatherPresentation(showWeatherRadar, radarStatus, selectedRadarFrame);
  const aircraftWeatherCenter = snapshot.receiver.lat !== null && snapshot.receiver.lon !== null
    ? { lat: snapshot.receiver.lat, lon: snapshot.receiver.lon, name: snapshot.receiver.name }
    : null;
  const handleAircraftWeatherMapData = useCallback((observations: AircraftWeatherMapObservation[], field: "temperature" | "wind") => {
    setAircraftWeatherMapObservations(observations);
    setAircraftWeatherMapField(field);
  }, []);

  function chooseCoverage(nextCoverage: CoverageMode): void {
    if (!networkEnabled && nextCoverage === "extended") return;
    setCoverage(nextCoverage);
  }

  return (
    <main className="radar-shell" data-presentation-mode={presentationMode ? "true" : undefined}>
      <AirRadarTopbar heading radarPage meta={
        <>
          <div className="topbar-ops-meta">
            <StatusBadge className="topbar-live-status" variant={receiverStatusVariant} title={receiverStatusLabel} aria-label={receiverStatusLabel}>{receiverStatusShort}</StatusBadge>
            <UtcClock />
          </div>
          <details className="topbar-receiver topbar-receiver-menu">
            <summary title={snapshot.receiver.name}>
              <span className="topbar-receiver-label">{t.status.receiverLabel}</span>
              <span className="topbar-receiver-name">{snapshot.receiver.name}</span>
            </summary>
            <div className="topbar-receiver-popover">
              <strong>{snapshot.receiver.name}</strong>
              <span>{snapshot.receiver.lat === null || snapshot.receiver.lon === null ? t.common.unavailable : `${snapshot.receiver.lat.toFixed(4)}, ${snapshot.receiver.lon.toFixed(4)}`}</span>
              {serverAlertsEnabled !== null && <span>{serverAlertsEnabled ? t.status.serverAlertsActive : t.status.serverAlertsDisabled}</span>}
            </div>
          </details>
        </>
      } />

      <div className="radar-workspace" data-map-focus={mapFocus && drawerState === "closed" ? "true" : "false"}>
        <RadarNavRail showAtc={showAtc} onShowAtcChange={setShowAtc} showAirports={showAirports} onShowAirportsChange={setShowAirports} />
        <section ref={radarContentRef} className="radar-content" data-presentation-mode={presentationMode ? "true" : undefined}>
        <div className="map-panel">
          <div ref={mapContainerRef} className="map-container" />
          <div className="map-overlay">

            <RadarMapHud
              aircraftCount={displayedAircraftCount}
              activeTrafficCount={activeTrafficCount}
              showSourceBreakdown={activeCoverage === "extended"}
              sourceStats={snapshot.sourceStats}
              drawerOpen={drawerState !== "closed"}
              trafficTriggerRef={trafficTriggerRef}
              onOpenTraffic={openTrafficDrawer}
              presentationControls={<RadarPresentationControls active={presentationMode} paused={presentationPaused} scene={presentationScene} onToggle={togglePresentationMode} onTogglePause={() => setPresentationPaused((current) => !current)} />}
              presetMenu={<RadarPresetMenu presets={radarPresets} onSave={saveCurrentRadarPreset} onApply={applyRadarPreset} onDelete={deleteRadarPreset} />}
            >
              <RadarMapLayerMenu
                mapAppearance={mapAppearance}
                onMapAppearanceChange={chooseMapAppearance}
                showAircraft={showAircraft}
                onShowAircraftChange={setShowAircraft}
                showOgn={showOgn}
                onShowOgnChange={setShowOgn}
                showAirports={showAirports}
                onShowAirportsChange={setShowAirports}
                showSignificantAirports={showSignificantAirports}
                onShowSignificantAirportsChange={setShowSignificantAirports}
                showSmallAirports={showSmallAirports}
                onShowSmallAirportsChange={setShowSmallAirports}
                showHeliports={showHeliports}
                onShowHeliportsChange={setShowHeliports}
                airportsDataset={airportsDataset}
                showAtc={showAtc}
                onShowAtcChange={setShowAtc}
                atcDataset={atcDataset}
                showAtsRoutes={showAtsRoutes}
                onShowAtsRoutesChange={(value) => {
                  setShowAtsRoutes(value);
                  if (!value) setSelectedAtsRoute(null);
                }}
                atsDataset={atsDataset}
                atsRoutes={atsRoutes}
                showNavData={showNavData}
                onShowNavDataChange={setShowNavData}
                navDataDataset={navDataDataset}
                sigmetEnabled={sigmetEnabled}
                showSigmet={showSigmet}
                onShowSigmetChange={setShowSigmet}
                showWeatherRadar={showWeatherRadar}
                radarProduct={radarProduct}
                onRadarProductChange={(product) => { setRadarProduct(product); setRadarPlaying(false); }}
                onShowWeatherRadarChange={(value) => {
                  setShowWeatherRadar(value);
                  if (!value) setRadarPlaying(false);
                }}
                radarOpacity={radarOpacity}
                onRadarOpacityChange={setRadarOpacity}
                selectedRadarFrame={selectedRadarFrame}
                radarStatus={radarStatus}
                showMetar={showMetar}
                onShowMetarChange={setShowMetar}
                metarStatus={metarStatus}
                showAircraftWeather={showAircraftWeather}
                onShowAircraftWeatherChange={setShowAircraftWeather}
                showNavigationIntegrity={showNavigationIntegrity}
                onShowNavigationIntegrityChange={setShowNavigationIntegrity}
                colorMode={colorMode}
                onColorModeChange={setColorMode}
              />
            </RadarMapHud>
            <RadarQuickActions
              weatherEnabled={showWeatherRadar}
              weatherState={weatherView.state}
              atcEnabled={showAtc}
              activeFilterCount={activeFilterCount}
              filtersDisabled={trafficSource === "ogn"}
              selectionOpen={drawerState === "aircraft" || drawerState === "ogn"}
              mapFocus={mapFocus}
              onToggleMapFocus={() => setMapFocus((value) => !value)}
              onToggleWeather={() => {
                const enabled = !showWeatherRadar;
                setShowWeatherRadar(enabled);
                if (!enabled) setRadarPlaying(false);
              }}
              onToggleAtc={() => setShowAtc((current) => !current)}
              onOpenFilters={() => openTrafficDrawer("filters")}
            />
            <RadarMultiAircraft
              active={multiAircraftMode}
              hexes={multiAircraftHexes}
              aircraft={snapshot.aircraft}
              limit={MULTI_AIRCRAFT_LIMIT}
              onToggle={toggleMultiAircraft}
              onRemove={(hex) => setMultiAircraftHexes((current) => removeMultiAircraft(current, hex))}
              onClear={clearMultiAircraft}
              onSelect={selectAircraft}
              onFit={focusMultiAircraft}
            />
            {selectedAircraftVisible && selectedAircraft ? <RadarFlightFollowHud
              aircraft={selectedAircraft}
              compact={drawerState === "aircraft"}
              route={selectedRoute.route}
              following={followSelected}
              onToggle={() => setFollowSelected((value) => !value)}
            /> : null}
            {showWeatherRadar ? <div className="map-overlay-context-row" data-testid="radar-weather-map-status" data-state={weatherView.state}>
              {(weatherView.state === "ready" || weatherView.state === "stale") && radarCatalog?.frames.length && selectedRadarFrame ? <div className="weather-radar-timeline" aria-label={t.layers.weatherRadar}>
                <div className="weather-radar-timeline-heading">
                  <strong>{t.layers.weatherRadar}{weatherView.state === "stale" && <span className="weather-radar-stale-label">{t.radarQuickActions.weatherStale}</span>}</strong>
                  <span>{formatDateTime(selectedRadarFrame.observedAt, t)}</span>
                </div>
                <div className="weather-radar-timeline-controls">
                  <button type="button" aria-label={t.layers.previousFrame} onClick={() => { const index = radarCatalog.frames.findIndex((frame) => frame.id === radarFrameId); setRadarLatestMode(false); setRadarFrameId(radarCatalog.frames[Math.max(0, index - 1)].id); }}><UiIcon name="back" /></button>
                  <button type="button" aria-pressed={radarPlaying} aria-label={radarPlaying ? t.layers.pause : t.layers.play} onClick={() => { setRadarLatestMode(false); setRadarPlaying((value) => !value); }}><UiIcon name={radarPlaying ? "pause" : "play"} /></button>
                  <button type="button" aria-label={t.layers.nextFrame} onClick={() => { const index = radarCatalog.frames.findIndex((frame) => frame.id === radarFrameId); setRadarLatestMode(false); setRadarFrameId(radarCatalog.frames[Math.min(radarCatalog.frames.length - 1, index + 1)].id); }}><span className="ui-icon ui-icon-flipped"><UiIcon name="back" /></span></button>
                  <input type="range" min="0" max={Math.max(0, radarCatalog.frames.length - 1)} value={Math.max(0, radarCatalog.frames.findIndex((frame) => frame.id === radarFrameId))} aria-label={t.layers.weatherRadar} onChange={(event) => { setRadarLatestMode(false); setRadarPlaying(false); setRadarFrameId(radarCatalog.frames[Number(event.target.value)].id); }} />
                  <button type="button" className={radarLatestMode ? "active" : ""} aria-pressed={radarLatestMode} onClick={() => { setRadarLatestMode(true); setRadarPlaying(false); setRadarFrameId(radarCatalog.latestFrameId); }}>{t.layers.latest}</button>
                </div>
              </div> : <div className="map-layer-notice" role="status">{weatherView.state === "unavailable" ? t.layers.radarUnavailable : t.radarQuickActions.weatherLoading}</div>}
            </div> : null}
            {networkNotice && <div className="map-source-notice"><span className="network-notice">{networkNotice}</span></div>}
            {colorMode !== "default" || (selectedAircraftVisible && selectedAircraft?.enrichment?.route) || showAtc || showAtsRoutes || showMetar || showNavigationIntegrity ? <Panel className="map-overlay-card contextual-legend">
              {showAtc && <span className="layer-legend aviation-layer-legend"><strong>{t.layers.atc}</strong><span><i className="legend-line atc-context" /> {t.atc.sector}</span><span><i className="legend-line atc-background" /> {t.layers.atc}</span></span>}
              {showAtsRoutes && <span className="layer-legend aviation-layer-legend"><strong>{t.layers.atsRoutes}</strong><span><i className="legend-line ats-network" /> {t.layers.atsRoutes}</span><span><i className="legend-line ats-selected" /> {t.route.context}</span></span>}
              {showMetar && <span className="layer-legend aviation-layer-legend"><strong>{t.layers.metar}</strong><span><i className="metar-dot vfr" /> {t.layers.vfr}</span><span><i className="metar-dot mvfr" /> {t.layers.mvfr}</span><span><i className="metar-dot ifr" /> {t.layers.ifr}</span></span>}
              {showNavigationIntegrity && <span className="layer-legend aviation-layer-legend"><strong>{t.layers.navigationIntegrity}</strong><span><i className="legend-line planned" /> {t.layers.navigationIntegrityReduced}</span><small>{t.layers.navigationIntegrityDisclaimer}</small></span>}
              {colorMode !== "default" && <span className="color-mode-legend"><strong>{t.layers.colorModes[colorMode]}</strong><span><i className="color-legend-swatch low" /> {t.layers.colorLegendLow}</span><span><i className="color-legend-swatch high" /> {t.layers.colorLegendHigh}</span><span><i className="color-legend-swatch fallback" /> {t.layers.colorLegendFallback}</span></span>}
              {selectedAircraftVisible && selectedAircraft?.enrichment?.route && <span className="layer-legend radar-v5-route-evidence" data-testid="radar-v5-route-evidence">
                <strong>{visualSystemV5EText(t.locale).routeEvidence}</strong>
                <span><i className="legend-line actual" /> {visualSystemV5EText(t.locale).routeObserved}</span>
                <span><i className="legend-line completed" /> {t.route.originToCurrent}</span>
                <span><i className="legend-line remaining" /> {visualSystemV5EText(t.locale).routeEstimated}</span>
                {routeIntelligenceActiveRef.current && <span><i className="legend-line current-route" /> {visualSystemV5EText(t.locale).routeCurrent}</span>}
                <small>{visualSystemV5EText(t.locale).routeUncertainty}</small>
              </span>}
            </Panel> : null}
            {showAircraftWeather && <AircraftWeatherPanel
              center={aircraftWeatherCenter}
              onClose={() => { setShowAircraftWeather(false); setFocusedAircraftWeatherObservation(null); setAircraftWeatherMapObservations([]); }}
              onMapDataChange={handleAircraftWeatherMapData}
              focusedObservationKey={focusedAircraftWeatherObservation}
            />}
          </div>
        </div>

        <aside ref={sidebarRef} id="radar-sidebar" data-testid="radar-sidebar" aria-hidden={drawerState === "closed"} className={`sidebar drawer-${drawerState} ${mobileCompact ? "compact" : ""} ${selectedAircraft || selectedOgnTarget ? "has-selection" : ""}`}>
          <div className="sidebar-heading">
              <div className="sidebar-heading-main">
                <div className="sidebar-title">{t.radar.trafficNearby}</div>
                <div className="sidebar-count">{trafficSource === "ogn" ? t.ogn.count(formatNumber(activeTrafficCount)) : visibleAircraft(activeTrafficCount, snapshot.aircraft.length)}</div>
                <div className="traffic-source-tabs" role="tablist" aria-label={t.radar.trafficSourceLabel}>
                  <button type="button" role="tab" aria-selected={trafficSource === "adsb"} aria-controls="traffic-list" className={trafficSource === "adsb" ? "active" : ""} onClick={() => setTrafficSource("adsb")}>{t.radar.trafficSourceAdsb}<span>{formatNumber(snapshot.aircraft.length)}</span></button>
                  {ognEnabled === true && <button type="button" role="tab" aria-selected={trafficSource === "ogn"} aria-controls="traffic-list" className={trafficSource === "ogn" ? "active" : ""} onClick={() => setTrafficSource("ogn")}>{t.radar.trafficSourceOgn}<span>{formatNumber(ognSnapshot.targets.length)}</span></button>}
                </div>
                {trafficSource === "adsb" && networkEnabled && <div className="coverage-switch" role="group" aria-label={t.radar.coverageExtended}>
                  <button type="button" className={activeCoverage === "local" ? "active" : ""} aria-pressed={activeCoverage === "local"} onClick={() => chooseCoverage("local")}>{t.radar.coverageLocal}</button>
                  <button type="button" className={activeCoverage === "extended" ? "active" : ""} aria-pressed={activeCoverage === "extended"} onClick={() => chooseCoverage("extended")}>{t.radar.coverageExtended}</button>
                </div>}
                {trafficSource === "adsb" && activeCoverage === "extended" && snapshot.coverageStats && <div className="coverage-subcount">{t.radar.localOnlyCount(formatNumber(snapshot.coverageStats.localAircraft))} · {t.radar.networkOnlyCount(formatNumber(snapshot.coverageStats.networkOnlyAircraft))}</div>}
                {trafficSource === "adsb" && activeCoverage === "extended" && <div className="coverage-switch source-filter-switch" role="group" aria-label={t.uiExtras.sourceFilter}>
                  {(["all", "local", "network", "overlap"] as const).map((source) => <button key={source} type="button" className={mapFilters.source === source ? "active" : ""} aria-pressed={mapFilters.source === source} onClick={() => updateMapFilter("source", source)}>{source.toUpperCase()}</button>)}
                </div>}
              </div>
              <IconButton className="mobile-collapse" onClick={() => setMobileCompact((value) => !value)} aria-expanded={!mobileCompact} aria-label={mobileCompact ? t.radar.expandAircraftPanel : t.radar.collapseAircraftPanel}>
                {mobileCompact ? "↑" : "↓"}
              </IconButton>
              <button type="button" className="drawer-close-button" onClick={closeRadarDrawer} aria-label={drawerState === "traffic" ? t.history.closeTrafficPanel : drawerState === "ogn" ? t.history.closePanel : t.history.closeAircraftDetails}><UiIcon name="close" /></button>
            </div>
          <RadarTrafficBrowser
            trafficSource={trafficSource}
            search={search}
            onSearchChange={setSearch}
            searchInputRef={searchInputRef}
            sidebarBrowseRef={sidebarBrowseRef}
            mapFilters={mapFilters}
            onMapFilterChange={updateMapFilter}
            filtersOpen={filtersOpen}
            onFiltersOpenChange={setFiltersOpen}
            hasActiveMapFilters={hasActiveMapFilters}
            activeFilterCount={activeFilterCount}
            watchlistOnly={watchlistOnly}
            onWatchlistOnlyChange={setWatchlistOnly}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            distanceFilter={distanceFilter}
            onDistanceFilterChange={setDistanceFilter}
            onResetMapFilters={resetMapFilters}
            watchlist={watchlist}
            onWatchlistChange={setWatchlist}
            relevantAtcFrequencies={snapshot.relevantAtcFrequencies}
            atcExpanded={atcExpanded}
            onAtcOpen={() => setAtcExpanded(true)}
            filteredAircraft={filteredAircraft}
            totalAircraftCount={snapshot.aircraft.length}
            selectedHex={selectedHex}
            watchlistedHexes={watchlistedHexes}
            onSelectAircraft={selectAircraft}
            ognSnapshot={ognSnapshot}
            filteredOgnTargets={filteredOgnTargets}
            selectedOgnId={selectedOgnId}
            onSelectOgn={selectOgn}
            ognLabel={ognTargetLabel}
          />

          <RadarDrawerDetails
            drawerState={drawerState}
            selectedOgnTarget={selectedOgnTarget}
            ognLabel={ognTargetLabel}
            selectedIdentity={selectedIdentity}
            selectedAircraft={selectedAircraft}
            databaseAircraft={selectedDatabaseAircraft}
            historyTrail={selectedAircraft && selectedHistoryTrail?.icaoHex === selectedAircraft.icaoHex ? selectedHistoryTrail : null}
            atcContext={selectedAtcContext}
            sigmetContext={selectedSigmetContext}
            sigmetStale={sigmetData.stale}
            selectedRoute={selectedRoute.route}
            watchlisted={selectedAircraft ? isWatchlisted(selectedAircraft) : false}
            onBack={backToTraffic}
            onClose={closeRadarDrawer}
            onCenter={centerSelectedAircraft}
            following={followSelected}
            onToggleFollow={() => setFollowSelected((current) => !current)}
            onToggleWatchlist={() => {
              if (!selectedAircraft) return;
              setWatchlist((current) => current.some((rule) => rule.kind === "icao" && rule.value === selectedAircraft.icaoHex)
                ? current.filter((rule) => !(rule.kind === "icao" && rule.value === selectedAircraft.icaoHex))
                : [...current, { kind: "icao", value: selectedAircraft.icaoHex }]);
            }}
          />
        </aside>
        </section>
      </div>

      <MobileBottomNav />
    </main>
  );
}
