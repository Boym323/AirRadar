"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { FilterSpecification, GeoJSONSource, ImageSource, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import {
  formatAtcFrequency,
  formatAtcLimit,
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
import { aircraftMapLabelLevel, aircraftMapLabelText, trafficMapLabelText } from "@/lib/aircraft/map-labels";
import type { Airport } from "@/lib/airports/types";
import type { AtcDataResponse, AtcSector } from "@/lib/atc/types";
import type { AtcContextResult } from "@/lib/atc-context/types";
import type { AirspaceActivityResponse } from "@/lib/airspace-activity/types";
import { buildAirspacePlanMapIndex, matchAirspacePlanForSector } from "@/lib/airspace-activity/map";
import { airspaceActivityMapT as activityT } from "@/lib/i18n/airspace-activity";
import { matchesAircraftRule, normalizeAircraftRuleType, type AircraftMatchRule } from "@/lib/aircraft/watchlist";
import type { AircraftQuickDetailResponse, HistoryResponse } from "@/lib/server/history";
import type { FlightIntelligenceEvent } from "@/lib/intelligence/types";
import type { MetarMapObservation } from "@/lib/weather/types";
import { aircraftSigmetContext } from "@/lib/weather/aircraft-sigmet-context";
import type { RouteWeatherContext } from "@/lib/weather/route-weather-context";
import type { OperationalTwinApiResponse } from "@/lib/operational-twin";
import {
  createOperationalTwinMapGeoJSON,
  emptyOperationalTwinMapGeoJSON,
  OPERATIONAL_TWIN_EVENT_LAYER_ID,
  OPERATIONAL_TWIN_KINEMATIC_LAYER_ID,
  OPERATIONAL_TWIN_MAP_SOURCE_ID,
  OPERATIONAL_TWIN_MILESTONE_LABEL_LAYER_ID,
  OPERATIONAL_TWIN_MILESTONE_LAYER_ID,
  OPERATIONAL_TWIN_NAVIGATION_INTEGRITY_LAYER_ID,
  OPERATIONAL_TWIN_ROUTE_LAYER_ID,
  OPERATIONAL_TWIN_UNCERTAINTY_LAYER_ID,
  OPERATIONAL_TWIN_WEATHER_EVENT_LAYER_ID,
} from "@/lib/operational-twin/map";
import {
  compareAircraftOperationalFocus,
  type AircraftOperationalFocusChangeSummary,
} from "@/lib/operational-twin/aircraft-operational-focus-change";
import type { AircraftOperationalFocusSummary } from "@/lib/operational-twin/types";
import {
  AIRCRAFT_OPERATIONAL_FOCUS_MAP_LINE_LAYER_ID,
  AIRCRAFT_OPERATIONAL_FOCUS_MAP_POINT_LAYER_ID,
  AIRCRAFT_OPERATIONAL_FOCUS_MAP_SOURCE_ID,
  AIRCRAFT_OPERATIONAL_FOCUS_QUERY_PARAM,
  aircraftOperationalFocusClearHref,
  aircraftOperationalFocusRadarHref,
  createAircraftOperationalFocusMapGeoJSON,
  emptyAircraftOperationalFocusMapGeoJSON,
  resolveAircraftOperationalFocusMapTarget,
} from "@/lib/operational-twin/aircraft-operational-focus-ui";
import {
  createRegionalAttentionMapFocusGeoJSON,
  emptyRegionalAttentionMapFocusGeoJSON,
  REGIONAL_ATTENTION_MAP_AIRCRAFT_LAYER_ID,
  REGIONAL_ATTENTION_MAP_FOCUS_EVENT,
  REGIONAL_ATTENTION_MAP_LINE_LAYER_ID,
  REGIONAL_ATTENTION_MAP_SOURCE_ID,
  type RegionalAttentionMapFocusEventDetail,
} from "@/lib/operational-twin/regional-attention-ui";
import { detectSigmetTrajectoryDeviation } from "@/lib/weather/sigmet-trajectory-deviation";
import { buildWeatherAvoidanceIntelligence } from "@/lib/weather/avoidance-intelligence";
import { WEATHER_RADAR_BOUNDS } from "@/lib/server/weather-radar/types";
import type { WindLevelHpa } from "@/lib/server/wind-aloft";
import type { AircraftWeatherMapObservation } from "@/components/aircraft-weather-panel";
import type { OgnStateSnapshot, OgnTargetView } from "@/lib/ogn/types";
import { isOgnDuplicateOfAircraft } from "@/lib/ogn/deduplication";
import { canonicalAircraftGlyphPath } from "@/lib/aircraft/glyph-paths";
import { airportVisibilityFilter, airportVisibilityTier, DEFAULT_AIRPORT_LAYER_VISIBILITY, type AirportLayerVisibility, AIRPORT_MAP_RADIUS_NM } from "@/lib/airport-visibility";
import { createRangeRingsGeoJSON, RANGE_RING_RADII_KM } from "@/lib/range-rings";
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
import { radarWeatherPresentation } from "@/lib/radar/weather-layer-presentation";
import { RadarPresetMenu } from "@/components/radar/radar-preset-menu";
import { RadarOperationsCenter } from "@/components/radar/radar-operations-center";
import { RadarFlightFollowHud } from "@/components/radar/radar-flight-follow-hud";
import { RadarOperationalFocusCard } from "@/components/radar/radar-operational-focus-card";
import { useRadarDrawerInteractions, type RadarDrawerState, type RadarTrafficSource as TrafficSource } from "@/components/radar/use-radar-drawer-interactions";
import { useRadarLiveAircraft } from "@/components/radar/use-radar-live-aircraft";
import { EMPTY_SIGMET_DATA, useRadarWeatherContext, type WindResponse } from "@/components/radar/use-radar-weather-context";
import { useSelectedAircraftWindContext } from "@/components/radar/use-selected-aircraft-wind-context";
import { useRadarAtcMapContext, type SectorTrafficView } from "@/components/radar/use-radar-atc-map-context";
import { useRadarNavDataContext } from "@/components/radar/use-radar-nav-data-context";
import { useRouteCorridorIntelligence } from "@/components/radar/use-route-corridor-intelligence";
import { IconButton, MapControlGroup, Panel, StatusBadge, UiIcon } from "@/components/ui-primitives";
import { useDatasetQuery } from "@/components/use-dataset-query";
import { createMapDatasetReplay } from "@/lib/map-layer-reliability";
import { createAviationNavGeoJSON } from "@/lib/navigation-data/map";
import { routeReferencePointIds } from "@/lib/navigation-data/route-reference";
import { configureMapLibreWorker } from "@/lib/maplibre-worker";
import { createProcedureGeoJSON } from "@/lib/procedure-visualization";
import type { Procedure } from "@/lib/route-intelligence/contracts";
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
import { applyAircraftLabelCollisionLayout, type AircraftLabelCollisionHandle } from "@/lib/radar/aircraft-label-controller";
import { radarBottomControlOffset, radarCameraPadding, type RadarMapPadding } from "@/lib/radar/layout";
import type { RadarPerformanceDiagnosticsSession } from "@/lib/radar/performance-diagnostics";
import { createAircraftMotionRuntime, type AircraftMotionRuntime } from "@/lib/radar/aircraft-motion-runtime";
import { aircraftReportedTrueHeading } from "@/lib/aircraft/visual-heading";
import { AIRRADAR_MAP_THEME } from "@/lib/map-theme";
import { AIRRADAR_BASE_MAP_STYLE_URL, airRadarMapAttributions, applyAirRadarBasemapReadability } from "@/lib/map-style";
import { aircraftLabelOpacity, aircraftPositionIsStale } from "@/lib/radar-ui";
import { classifyAircraftSource } from "@/lib/aircraft/source-awareness";
import { ognIconKind, ognPrimaryLabel, radarTrafficAriaLabel, toOgnTrafficPresentation } from "@/lib/radar/traffic-presentation";
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
const EMPTY_PROCEDURE_GEOJSON = { type: "FeatureCollection" as const, features: [] };
const EMPTY_NAVIGATION_INTEGRITY_GEOJSON = { type: "FeatureCollection" as const, features: [] };
const OGN_LABEL_SOURCE_ID = "ogn-traffic-labels";
const OGN_LABEL_LAYER_ID = "ogn-traffic-labels-symbol";

function createNavigationIntegrityGeoJSON(cells: Array<{ latCell: number; lonCell: number; state: string; affectedAircraftCount: number }>): FeatureCollection {
  const size = 0.2;
  return {
    type: "FeatureCollection",
    features: cells.filter((cell) => cell.state !== "NORMAL").map((cell) => {
      const lat = cell.latCell * size;
      const lon = cell.lonCell * size;
      return { type: "Feature", properties: { state: cell.state, affectedAircraftCount: cell.affectedAircraftCount }, geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]] } };
    }),
  };
}
const EMPTY_RADAR_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const AtcVerticalTraffic = dynamic(() => import("@/components/atc-sector-traffic-panels").then((module) => module.AtcVerticalTraffic));
const SectorFlowsPanel = dynamic(() => import("@/components/atc-sector-traffic-panels").then((module) => module.SectorFlowsPanel));
const AircraftWeatherPanel = dynamic(() => import("@/components/aircraft-weather-panel").then((module) => module.AircraftWeatherPanel), { ssr: false });
const WEATHER_RADAR_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [WEATHER_RADAR_BOUNDS.west, WEATHER_RADAR_BOUNDS.north],
  [WEATHER_RADAR_BOUNDS.east, WEATHER_RADAR_BOUNDS.north],
  [WEATHER_RADAR_BOUNDS.east, WEATHER_RADAR_BOUNDS.south],
  [WEATHER_RADAR_BOUNDS.west, WEATHER_RADAR_BOUNDS.south],
];
const WIND_PRESSURE_LEVELS: WindLevelHpa[] = [850, 700, 500, 300, 200];
interface AtsRoutesResponse { available: boolean; source?: { name: string; reference: string; effectiveDate: string; aipAmendment: string | null; airacAmendment: string | null }; counts?: { routes: number; points: number; segments: number; cdrSegments: number; discontinuities: number }; segments?: FeatureCollection; labels?: FeatureCollection; points?: FeatureCollection; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseAirportDataset(value: unknown): value is Airport[] {
  return Array.isArray(value) && value.every((airport) => isRecord(airport)
    && typeof airport.icaoCode === "string"
    && typeof airport.name === "string"
    && typeof airport.latitude === "number"
    && Number.isFinite(airport.latitude)
    && typeof airport.longitude === "number"
    && Number.isFinite(airport.longitude));
}

function parseAtcDataset(value: unknown): value is AtcDataResponse {
  return isRecord(value)
    && Array.isArray(value.sectors)
    && Array.isArray(value.transmitters)
    && isRecord(value.metadata);
}

function parseAtsDataset(value: unknown): value is AtsRoutesResponse {
  return isRecord(value) && typeof value.available === "boolean";
}

async function parseJsonDataset<T>(response: Response, validator: (value: unknown) => value is T): Promise<T> {
  const value: unknown = await response.json();
  if (!validator(value)) throw new SyntaxError("malformed dataset response");
  return value;
}

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

function aircraftWebglLabelFeature(
  aircraft: AircraftView,
  zoom: number,
  renderedPosition?: { lon: number; lat: number } | null,
) {
  return {
    type: "Feature" as const,
    id: aircraft.icaoHex,
    properties: {
      icaoHex: aircraft.icaoHex,
      label: aircraftMapLabelText(aircraft, zoom, {
        suppressTelemetry: aircraftPositionIsStale(aircraft),
      }) ?? "",
      source: classifyAircraftSource(aircraft),
      stale: aircraftPositionIsStale(aircraft),
      labelOpacity: aircraftLabelOpacity(aircraft),
    },
    geometry: {
      type: "Point" as const,
      coordinates: [renderedPosition?.lon ?? aircraft.lon!, renderedPosition?.lat ?? aircraft.lat!] as [number, number],
    },
  };
}

function ognMapLabelFeature(target: OgnTargetView, zoom: number, selected: boolean) {
  const presentation = toOgnTrafficPresentation(target);
  return {
    type: "Feature" as const,
    id: target.id,
    properties: {
      targetId: target.id,
      label: selected ? "" : trafficMapLabelText({
        identity: presentation.primaryLabel,
        altitudeFt: presentation.altitudeFt,
        speedKt: presentation.speedKt,
      }, zoom, { suppressTelemetry: target.stale }) ?? "",
      stale: target.stale,
    },
    geometry: {
      type: "Point" as const,
      coordinates: [target.longitude, target.latitude] as [number, number],
    },
  };
}

function setOgnDomLabel(handle: OgnMarkerHandle, value: string | null): boolean {
  if (handle.labelText === value) return false;
  handle.labelText = value;
  const [primary = "", secondary = ""] = value?.split("\n", 2) ?? [];
  handle.labelPrimary.textContent = primary;
  handle.labelSecondary.textContent = secondary;
  handle.labelSecondary.hidden = !secondary;
  handle.label.dataset.contentEmpty = value ? "false" : "true";
  handle.labelWidth = null;
  handle.labelHeight = null;
  return true;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}


interface OgnMarkerHandle extends AircraftLabelCollisionHandle {
  marker: maplibregl.Marker;
  root: HTMLElement;
  icon: HTMLElement;
  rotator: HTMLElement;
  labelPrimary: HTMLElement;
  labelSecondary: HTMLElement;
  label: HTMLElement;
  labelText: string | null;
  labelPriority: "selected" | "normal" | "stale";
  labelWidth: number | null;
  labelHeight: number | null;
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

function labelForAircraft(aircraft: AircraftView): string {
  return aircraft.callsign || aircraft.registration || aircraft.enrichment?.metadata?.registration || aircraft.icaoHex;
}

const aircraftSearchTextCache = new WeakMap<AircraftView, string>();

function aircraftSearchText(aircraft: AircraftView): string {
  const cached = aircraftSearchTextCache.get(aircraft);
  if (cached !== undefined) return cached;
  const value = [aircraft.callsign, aircraft.registration, aircraft.enrichment?.metadata?.registration, aircraft.icaoHex]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  aircraftSearchTextCache.set(aircraft, value);
  return value;
}

function formatAirspaceUtc(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return t.common.emptyValue;
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
}

function createAtcGeoJSON(sectors: AtcSector[], visible: boolean, airspaceActivity: AirspaceActivityResponse | null = null, traffic = new Map<string, SectorTrafficView>()) {
  const planIndex = buildAirspacePlanMapIndex(airspaceActivity);
  return {
    type: "FeatureCollection" as const,
    features: visible ? sectors.flatMap((sector) => {
      const plan = matchAirspacePlanForSector(sector, planIndex);
      const planLabel = plan?.state === "planned-now" ? activityT.plannedNow : plan?.state === "upcoming" ? activityT.upcoming : null;
      return sector.polygons.filter((polygon) => polygon.length >= 3 && polygon.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)).map((polygon) => ({
        type: "Feature" as const,
        properties: {
          id: sector.id,
          countryCode: sector.country,
          name: sector.name,
          label: planLabel ? `${sector.name} · ${planLabel}` : sector.name,
          service: formatAtcService(sector.service ?? sector.atcCallsign),
          airspaceType: sector.airspaceType ?? null,
          airspaceClass: sector.airspaceClass ?? null,
          lowerAltitudeFt: sector.lowerAltitudeFt,
          upperAltitudeFt: sector.upperAltitudeFt,
          lowerAltitude: formatAtcLimit(sector.lowerAltitudeFt, sector.lowerAltitudeReference, t.common.unlimited),
          upperAltitude: formatAtcLimit(sector.upperAltitudeFt, sector.upperAltitudeReference, t.common.unlimited),
          primaryFrequency: formatAtcFrequency((sector.frequencies.find((frequency) => frequency.isPrimary) ?? sector.frequencies[0])?.frequencyMhz),
          alternateFrequencies: sector.frequencies.filter((frequency) => !frequency.isPrimary).map((frequency) => formatAtcFrequency(frequency.frequencyMhz)).join(", "),
          source: sector.source,
          sourceReference: sector.sourceReference,
          validFrom: sector.validFrom,
          validTo: sector.validTo,
          lastVerifiedAt: sector.lastVerifiedAt,
          activationStatus: sector.activationStatus ?? "UNKNOWN",
          trafficLevel: traffic.get(sector.id)?.trafficLevel ?? "NO_DATA",
          trafficAircraftCount: traffic.get(sector.id)?.traffic.aircraftCount ?? null,
          trafficAt: traffic.get(sector.id)?.at ?? null,
          airspacePlanState: plan?.state ?? "none",
          airspacePlanStale: plan?.stale ?? false,
          airspacePlanSource: plan?.source ?? "",
          airspacePlanSequence: plan?.sequence ?? 0,
          airspacePlanSourceReference: plan?.sourceReference ?? "",
          airspacePlanStartsAt: plan?.startsAt ?? "",
          airspacePlanEndsAt: plan?.endsAt ?? "",
          airspacePlanLowerLimit: plan?.lowerLimit ?? "",
          airspacePlanUpperLimit: plan?.upperLimit ?? "",
          airspacePlanResponsibleUnit: plan?.responsibleUnit ?? "",
          airspacePlanActivity: plan?.activity ?? "",
          airspacePlanDesignator: plan?.canonicalDesignator ?? "",
        },
        geometry: { type: "Polygon" as const, coordinates: [polygon] },
      }));
    }) : [],
  };
}

function createAirportGeoJSON(airports: Airport[], excludedAirportCodes: ReadonlySet<string> = new Set()) {
  const unique = new Map(airports
    .filter((airport) => Number.isFinite(airport.latitude) && Number.isFinite(airport.longitude)
      && airport.latitude >= -90 && airport.latitude <= 90
      && airport.longitude >= -180 && airport.longitude <= 180
      && !excludedAirportCodes.has(airport.icaoCode.trim().toUpperCase()))
    .map((airport) => [airport.icaoCode, airport]));
  return {
    type: "FeatureCollection" as const,
    features: [...unique.values()].map((airport) => ({
      type: "Feature" as const,
      properties: {
        code: airport.iataCode ? `${airport.iataCode}/${airport.icaoCode}` : airport.icaoCode,
        icao: airport.icaoCode,
        name: airport.name,
        tier: airportVisibilityTier(airport),
        important: false,
      },
      geometry: { type: "Point" as const, coordinates: [airport.longitude, airport.latitude] },
    })),
  };
}

function createMetarGeoJSON(observations: MetarMapObservation[]) {
  return {
    type: "FeatureCollection" as const,
    features: observations.flatMap((observation) => Number.isFinite(observation.lat) && Number.isFinite(observation.lon) ? [{
      type: "Feature" as const,
      properties: observation,
      geometry: { type: "Point" as const, coordinates: [observation.lon, observation.lat] },
    }] : []),
  };
}

function createWindGeoJSON(data: WindResponse | null) {
  return {
    type: "FeatureCollection" as const,
    features: (data?.points ?? []).flatMap((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon) ? [{
      type: "Feature" as const,
      properties: { speedKt: point.speedKt, directionDeg: point.directionDeg },
      geometry: { type: "Point" as const, coordinates: [point.lon, point.lat] },
    }] : []),
  };
}

function createAircraftWeatherGeoJSON(observations: AircraftWeatherMapObservation[], field: "temperature" | "wind") {
  return {
    type: "FeatureCollection" as const,
    features: observations.flatMap((observation) => Number.isFinite(observation.lat) && Number.isFinite(observation.lon) ? [{
      type: "Feature" as const,
      properties: {
        key: `${observation.aircraftHex}|${observation.observedAt}`,
        aircraftHex: observation.aircraftHex,
        callsign: observation.callsign,
        altitudeFt: observation.altitudeFt,
        observedAt: observation.observedAt,
        field,
        temperatureC: observation.staticAirTemperatureC,
        windDirectionDeg: observation.windDirectionDeg,
        windSpeedKt: observation.windSpeedKt,
        source: observation.source,
      },
      geometry: { type: "Point" as const, coordinates: [observation.lon, observation.lat] as [number, number] },
    }] : []),
  };
}

function parseNavPointFocus(value: string | null): { kind: "NAVAID" | "FIX"; id: string; lat: number; lon: number } | null {
  if (!value) return null;
  const [kind, id, latText, lonText, ...extra] = value.split(":");
  if (extra.length || (kind !== "NAVAID" && kind !== "FIX") || !/^[A-Z0-9]{2,8}$/.test(id ?? "")) return null;
  const lat = Number(latText);
  const lon = Number(lonText);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { kind, id, lat, lon };
}

function relativeTwinMapOffset(minutes: number): string {
  if (minutes <= 0.05) return "NOW";
  return `+${formatNumber(minutes, minutes < 10 ? 1 : 0)} min`;
}

function ognTargetLabel(target: OgnTargetView): string {
  return ognPrimaryLabel(target);
}

function ognGlyphMarkup(aircraftType: OgnTargetView["aircraftType"]): string {
  return `<svg class="aircraft-glyph aircraft-glyph-${ognIconKind(aircraftType)}" viewBox="0 0 32 32" aria-hidden="true"><path d="${canonicalAircraftGlyphPath(ognIconKind(aircraftType))}"></path></svg>`;
}

export function AirRadarApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const atsPointFocus = searchParams.get("atsPoint");
  const navPointFocus = searchParams.get("navPoint");
  const focusedNavPoint = useMemo(() => parseNavPointFocus(navPointFocus), [navPointFocus]);
  const aircraftFocus = searchParams.get("aircraft")?.trim().toUpperCase() ?? null;
  const operationalFocusMapId = searchParams.get(AIRCRAFT_OPERATIONAL_FOCUS_QUERY_PARAM);
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
  const [selectedAtcContext, setSelectedAtcContext] = useState<AtcContextResult | null>(null);
  const [selectedRouteWeather, setSelectedRouteWeather] = useState<RouteWeatherContext | null>(null);
  const [selectedOperationalTwin, setSelectedOperationalTwin] = useState<OperationalTwinApiResponse | null>(null);
  const [selectedOperationalFocusChanges, setSelectedOperationalFocusChanges] = useState<AircraftOperationalFocusChangeSummary | null>(null);
  const operationalFocusSnapshotsRef = useRef<Map<string, AircraftOperationalFocusSummary>>(new Map());
  const [operationalFocusRevealVersion, setOperationalFocusRevealVersion] = useState(0);
  const [selectedIntelligenceEvents, setSelectedIntelligenceEvents] = useState<FlightIntelligenceEvent[]>([]);
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
  const [showRangeRings, setShowRangeRings] = useState(true);
  const [showAtc, setShowAtc] = useState(false);
  const [showAtcTraffic, setShowAtcTraffic] = useState(false);
  const atcAutoFitRef = useRef(false);
  const [showSigmet, setShowSigmet] = useState(false);
  const [showWeatherRadar, setShowWeatherRadar] = useState(false);
  const [radarOpacity, setRadarOpacity] = useState(0.65);
  const [showMetar, setShowMetar] = useState(false);
  const [showWind, setShowWind] = useState(false);
  const [showAircraftWeather, setShowAircraftWeather] = useState(false);
  const [showNavigationIntegrity, setShowNavigationIntegrity] = useState(false);
  const [navigationIntegrityCells, setNavigationIntegrityCells] = useState<Array<{ latCell: number; lonCell: number; state: string; affectedAircraftCount: number }>>([]);
  const [aircraftWeatherMapObservations, setAircraftWeatherMapObservations] = useState<AircraftWeatherMapObservation[]>([]);
  const [aircraftWeatherMapField, setAircraftWeatherMapField] = useState<"temperature" | "wind">("temperature");
  const [focusedAircraftWeatherObservation, setFocusedAircraftWeatherObservation] = useState<string | null>(null);
  const [windLevel, setWindLevel] = useState<WindLevelHpa>(300);
  const [showAupUup, setShowAupUup] = useState(false);
  const {
    airspaceDataset,
    airspaceActivity,
    sectorTraffic,
    sectorTrafficState,
    sectorFlowWindow,
    setSectorFlowWindow,
    sectorFlows,
  } = useRadarAtcMapContext({
    showAtc,
    showAupUup,
    showAtcTraffic,
    searchParams,
  });
  const sectorTrafficRef = useRef<Map<string, SectorTrafficView>>(new Map());
  sectorTrafficRef.current = sectorTraffic;
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
    windValidAt,
    setWindValidAt,
    windData,
    windStatus,
    sigmetEnabled,
    sigmetData,
  } = useRadarWeatherContext({
    loadSigmet: showSigmet || selectedHex !== null,
    showWeatherRadar,
    showMetar,
    showWind,
    windLevel,
    onSigmetUnavailable: () => setShowSigmet(false),
  });
  const [showAtsRoutes, setShowAtsRoutes] = useState(false);
  const [showNavData, setShowNavData] = useState(false);
  const [showSids, setShowSids] = useState(false);
  const [showStars, setShowStars] = useState(false);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
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
  const receiverMarkerRef = useRef<maplibregl.Marker | null>(null);
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
  const operationalFocusMapCameraKeyRef = useRef<string | null>(null);
  const [regionalAttentionMapFocus, setRegionalAttentionMapFocus] = useState<RegionalAttentionMapFocusEventDetail>(null);

  useEffect(() => {
    const onRegionalAttentionMapFocus = (event: Event) => {
      setRegionalAttentionMapFocus((event as CustomEvent<RegionalAttentionMapFocusEventDetail>).detail ?? null);
    };
    window.addEventListener(REGIONAL_ATTENTION_MAP_FOCUS_EVENT, onRegionalAttentionMapFocus);
    return () => window.removeEventListener(REGIONAL_ATTENTION_MAP_FOCUS_EVENT, onRegionalAttentionMapFocus);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(REGIONAL_ATTENTION_MAP_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(createRegionalAttentionMapFocusGeoJSON(regionalAttentionMapFocus, snapshot.aircraft));
    const visible = regionalAttentionMapFocus !== null;
    if (map.getLayer(REGIONAL_ATTENTION_MAP_LINE_LAYER_ID)) {
      map.setLayoutProperty(REGIONAL_ATTENTION_MAP_LINE_LAYER_ID, "visibility", visible ? "visible" : "none");
    }
    if (map.getLayer(REGIONAL_ATTENTION_MAP_AIRCRAFT_LAYER_ID)) {
      map.setLayoutProperty(REGIONAL_ATTENTION_MAP_AIRCRAFT_LAYER_ID, "visibility", visible ? "visible" : "none");
    }
  }, [mapReady, regionalAttentionMapFocus, snapshot.aircraft]);

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
    enabled: showAtc || showAtcTraffic || showAupUup,
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
      const storedOpacity = Number(window.localStorage.getItem("airradar-weather-radar-opacity"));
      if (Number.isFinite(storedOpacity)) setRadarOpacity(Math.min(1, Math.max(0.2, storedOpacity)));
      setShowMetar(window.localStorage.getItem("airradar-metar-layer") === "true");
      setShowWind(window.localStorage.getItem("airradar-wind-layer") === "true");
      const storedWindLevel = Number(window.localStorage.getItem("airradar-wind-level"));
      if (WIND_PRESSURE_LEVELS.includes(storedWindLevel as WindLevelHpa)) setWindLevel(storedWindLevel as WindLevelHpa);
      setShowAupUup(window.localStorage.getItem("airradar-aup-uup-layer") === "true");
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
  useEffect(() => { try { window.localStorage.setItem("airradar-weather-radar-opacity", String(radarOpacity)); } catch { /* optional */ } }, [radarOpacity]);
  useEffect(() => { try { window.localStorage.setItem("airradar-metar-layer", String(showMetar)); } catch { /* optional */ } }, [showMetar]);
  useEffect(() => { try { window.localStorage.setItem("airradar-wind-layer", String(showWind)); } catch { /* optional */ } }, [showWind]);
  useEffect(() => { try { window.localStorage.setItem("airradar-wind-level", String(windLevel)); } catch { /* optional */ } }, [windLevel]);
  useEffect(() => { try { window.localStorage.setItem("airradar-aup-uup-layer", String(showAupUup)); } catch { /* optional */ } }, [showAupUup]);
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
        showAtcTraffic,
        showAtsRoutes,
        showNavData,
        showSids,
        showStars,
        showSigmet,
        showWeatherRadar,
        showMetar,
        showWind,
        showAircraftWeather,
        showNavigationIntegrity,
        showAupUup,
        showRangeRings,
      },
      display: { colorMode, radarOpacity, windLevel },
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
    showAtcTraffic,
    showAtsRoutes,
    showAupUup,
    showHeliports,
    showMetar,
    showNavData,
    showNavigationIntegrity,
    showOgn,
    showRangeRings,
    showSids,
    showSigmet,
    showSignificantAirports,
    showSmallAirports,
    showStars,
    showWeatherRadar,
    showWind,
    windLevel,
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
    setShowAtcTraffic(preset.layers.showAtcTraffic);
    setShowAtsRoutes(preset.layers.showAtsRoutes);
    setShowNavData(preset.layers.showNavData);
    setShowSids(preset.layers.showSids);
    setShowStars(preset.layers.showStars);
    setShowSigmet(preset.layers.showSigmet);
    setShowWeatherRadar(preset.layers.showWeatherRadar);
    setShowMetar(preset.layers.showMetar);
    setShowWind(preset.layers.showWind);
    setShowAircraftWeather(preset.layers.showAircraftWeather);
    setShowNavigationIntegrity(preset.layers.showNavigationIntegrity);
    setShowAupUup(preset.layers.showAupUup);
    setShowRangeRings(preset.layers.showRangeRings);
    setColorMode(preset.display.colorMode);
    setRadarOpacity(preset.display.radarOpacity);
    setWindLevel(preset.display.windLevel);
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

  useEffect(() => {
    if (ognEnabled !== true || !showOgn) return;
    let active = true;
    const source = new EventSource("/api/ogn/stream");
    const onSnapshot = (event: Event) => {
      try {
        const next = JSON.parse((event as MessageEvent<string>).data) as OgnStateSnapshot;
        if (active && next.enabled) setOgnSnapshot(next);
      } catch {
        // Ignore malformed events and allow EventSource to reconnect.
      }
    };
    source.addEventListener("snapshot", onSnapshot);
    return () => {
      active = false;
      source.removeEventListener("snapshot", onSnapshot);
      source.close();
    };
  }, [ognEnabled, showOgn]);

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
      if (mapDiagnostics) {
        window.__airradarMapStyleLoadedForDiagnostics = true;
        window.__airradarMapStyleLoadCountForDiagnostics = (window.__airradarMapStyleLoadCountForDiagnostics ?? 0) + 1;
      }
      map.addSource("map-tint", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]],
          },
        },
      });
      const firstBasemapSymbolLayerId = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
      map.addLayer(
        { id: "map-tint", type: "fill", source: "map-tint", paint: { "fill-color": AIRRADAR_MAP_THEME.mapTint, "fill-opacity": 0.13 } },
        firstBasemapSymbolLayerId,
      );
      applyAirRadarBasemapReadability(map);
      map.addSource("weather-radar-image", { type: "image", url: EMPTY_RADAR_PNG, coordinates: WEATHER_RADAR_COORDINATES });
      map.addLayer({ id: "weather-radar-layer", type: "raster", source: "weather-radar-image", layout: { visibility: "none" }, paint: { "raster-opacity": 0.42, "raster-fade-duration": 0 } });
      map.addSource("navigation-integrity", { type: "geojson", data: EMPTY_NAVIGATION_INTEGRITY_GEOJSON });
      map.addLayer({ id: "navigation-integrity-fill", type: "fill", source: "navigation-integrity", layout: { visibility: "none" }, paint: { "fill-color": ["match", ["get", "state"], "SEVERE", AIRRADAR_MAP_THEME.hazard, "DEGRADED", AIRRADAR_MAP_THEME.warning, AIRRADAR_MAP_THEME.warning], "fill-opacity": 0.14 } });
      map.addLayer({ id: "navigation-integrity-line", type: "line", source: "navigation-integrity", layout: { visibility: "none" }, paint: { "line-color": ["match", ["get", "state"], "SEVERE", AIRRADAR_MAP_THEME.hazard, AIRRADAR_MAP_THEME.warning], "line-opacity": 0.55, "line-width": 1.1, "line-dasharray": [2, 2] } });
      map.addSource("range-rings", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "range-rings-line",
        type: "line",
        source: "range-rings",
        paint: {
          "line-color": AIRRADAR_MAP_THEME.rangeRing,
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.04, 5, 0.16, 8, 0.26, 11, 0.2, 14, 0.1],
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.7, 8, 1, 13, 1.2],
          "line-dasharray": [2, 3],
        },
      });
      map.addLayer({
        id: "range-rings-label",
        type: "symbol",
        source: "range-rings",
        minzoom: 6.2,
        layout: {
          "text-field": ["concat", ["to-string", ["get", "radiusKm"]], " km"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 9,
          "symbol-placement": "line",
          "text-padding": 10,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": AIRRADAR_MAP_THEME.rangeRingLabel,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 6.2, 0.35, 8, 0.7, 12, 0.52, 15, 0.25],
          "text-halo-color": AIRRADAR_MAP_THEME.outline,
          "text-halo-width": 1,
        },
      });
      map.addSource("aviation-nav-data", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "aviation-nav-data-points", type: "circle", source: "aviation-nav-data", minzoom: 6.5, layout: { visibility: "none" }, paint: { "circle-color": ["case", ["==", ["get", "routeMatched"], true], AIRRADAR_MAP_THEME.accent, ["==", ["get", "kind"], "NAVAID"], AIRRADAR_MAP_THEME.routes.atsCdr, AIRRADAR_MAP_THEME.labelMuted], "circle-radius": ["interpolate", ["linear"], ["zoom"], 6.5, ["case", ["==", ["get", "routeMatched"], true], 3, 2], 10, ["case", ["==", ["get", "routeMatched"], true], 4, 3], 13, ["case", ["==", ["get", "routeMatched"], true], 5, 4]], "circle-stroke-color": AIRRADAR_MAP_THEME.outline, "circle-stroke-width": 1 } });
      map.addLayer({ id: "aviation-nav-data-labels", type: "symbol", source: "aviation-nav-data", minzoom: 8.5, layout: { visibility: "none", "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 9, "text-offset": [0, 1.1], "text-padding": 8, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": AIRRADAR_MAP_THEME.labelMuted, "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1 } });
      map.addSource("ats-routes", { type: "geojson", data: EMPTY_ATS_GEOJSON });
      map.addSource("procedures-sid", { type: "geojson", data: EMPTY_PROCEDURE_GEOJSON });
      map.addLayer({ id: "procedures-sid-line", type: "line", source: "procedures-sid", minzoom: 7.5, layout: { visibility: "none", "line-cap": "round", "line-join": "round" }, paint: { "line-color": AIRRADAR_MAP_THEME.procedures.sid, "line-opacity": 0.54, "line-width": ["interpolate", ["linear"], ["zoom"], 7.5, 1, 13, 1.8] } });
      map.addSource("procedures-star", { type: "geojson", data: EMPTY_PROCEDURE_GEOJSON });
      map.addLayer({ id: "procedures-star-line", type: "line", source: "procedures-star", minzoom: 7.5, layout: { visibility: "none", "line-cap": "round", "line-join": "round" }, paint: { "line-color": AIRRADAR_MAP_THEME.procedures.star, "line-opacity": 0.54, "line-width": ["interpolate", ["linear"], ["zoom"], 7.5, 1, 13, 1.8], "line-dasharray": [2, 1] } });
      map.addLayer({ id: "ats-routes-line", type: "line", source: "ats-routes", minzoom: 5.5, layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.routes.ats, "line-opacity": 0.58, "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 0.9, 8, 1.5, 13, 2.2] } });
      map.addLayer({ id: "ats-routes-cdr", type: "line", source: "ats-routes", minzoom: 5.5, filter: ["!=", ["get", "availabilityClass"], null], layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.routes.atsCdr, "line-opacity": 0.64, "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 0.9, 8, 1.6, 13, 2.4], "line-dasharray": [2, 2] } });
      map.addLayer({ id: "ats-routes-selected", type: "line", source: "ats-routes", filter: ["==", ["get", "routeDesignator"], ""], layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.selectedStrong, "line-opacity": 0.96, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.8, 8, 2.7, 13, 4] } });
      map.addLayer({ id: "ats-route-context-highlight", type: "line", source: "ats-routes", filter: ["==", ["get", "segmentId"], "__context-none__"], layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.selectedStrong, "line-opacity": 0.9, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2.5, 8, 4, 13, 6] } });
      map.addSource("ats-route-labels", { type: "geojson", data: EMPTY_ATS_GEOJSON });
      map.addLayer({ id: "ats-route-labels", type: "symbol", source: "ats-route-labels", minzoom: 7.5, layout: { visibility: "none", "symbol-placement": "line", "text-field": ["get", "routeDesignator"], "text-font": ["Noto Sans Regular"], "text-size": 10, "text-padding": 18, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": AIRRADAR_MAP_THEME.label, "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1.1 } });
      map.addSource("ats-route-points", { type: "geojson", data: EMPTY_ATS_GEOJSON });
      map.addLayer({ id: "ats-route-points", type: "circle", source: "ats-route-points", minzoom: 8.5, layout: { visibility: "none" }, paint: { "circle-color": ["case", ["==", ["get", "kind"], "NAVAID"], AIRRADAR_MAP_THEME.routes.atsCdr, AIRRADAR_MAP_THEME.labelMuted], "circle-radius": ["interpolate", ["linear"], ["zoom"], 8.5, 2.5, 13, 4], "circle-stroke-color": AIRRADAR_MAP_THEME.outline, "circle-stroke-width": 1 } });
      map.addLayer({ id: "ats-route-points-label", type: "symbol", source: "ats-route-points", minzoom: 10, layout: { visibility: "none", "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 9, "text-offset": [0, 1.1], "text-padding": 5, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": AIRRADAR_MAP_THEME.labelMuted, "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1 } });
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
      map.addSource("selected-trail", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "selected-trail-line", type: "line", source: "selected-trail", paint: { "line-color": AIRRADAR_MAP_THEME.selected, "line-opacity": 0.86, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.8, 8, 2.4, 13, 3.2] } });
      map.addSource("selected-trail-live-tail", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "selected-trail-live-tail-line", type: "line", source: "selected-trail-live-tail", paint: { "line-color": AIRRADAR_MAP_THEME.selectedStrong, "line-opacity": 0.92, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2, 8, 2.6, 13, 3.4] } });
      map.addSource(ROUTE_V2_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(ROUTE_INTELLIGENCE_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(OPERATIONAL_TWIN_MAP_SOURCE_ID, { type: "geojson", data: emptyOperationalTwinMapGeoJSON() });
      map.addSource(AIRCRAFT_OPERATIONAL_FOCUS_MAP_SOURCE_ID, { type: "geojson", data: emptyAircraftOperationalFocusMapGeoJSON() });
      map.addSource(REGIONAL_ATTENTION_MAP_SOURCE_ID, { type: "geojson", data: emptyRegionalAttentionMapFocusGeoJSON() });
      map.addLayer({
        id: REGIONAL_ATTENTION_MAP_LINE_LAYER_ID,
        type: "line",
        source: REGIONAL_ATTENTION_MAP_SOURCE_ID,
        filter: ["==", ["get", "kind"], "line"],
        layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": AIRRADAR_MAP_THEME.warning,
          "line-opacity": 0.72,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.4, 8, 2.2, 13, 3],
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: REGIONAL_ATTENTION_MAP_AIRCRAFT_LAYER_ID,
        type: "circle",
        source: REGIONAL_ATTENTION_MAP_SOURCE_ID,
        filter: ["==", ["get", "kind"], "aircraft"],
        layout: { visibility: "none" },
        paint: {
          "circle-color": AIRRADAR_MAP_THEME.warning,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3, 9, 4.5, 13, 6],
          "circle-opacity": 0.3,
          "circle-stroke-color": AIRRADAR_MAP_THEME.selectedStrong,
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: OPERATIONAL_TWIN_UNCERTAINTY_LAYER_ID,
        type: "fill",
        source: OPERATIONAL_TWIN_MAP_SOURCE_ID,
        filter: ["==", ["get", "kind"], "uncertainty"],
        layout: { visibility: "none" },
        paint: { "fill-color": AIRRADAR_MAP_THEME.selected, "fill-opacity": 0.075 },
      });
      map.addLayer({
        id: OPERATIONAL_TWIN_ROUTE_LAYER_ID,
        type: "line",
        source: OPERATIONAL_TWIN_MAP_SOURCE_ID,
        filter: ["all", ["==", ["get", "kind"], "corridor"], ["==", ["get", "mode"], "ROUTE_AWARE"]],
        layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": AIRRADAR_MAP_THEME.selectedStrong,
          "line-opacity": 0.9,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.6, 8, 2.4, 13, 3.4],
        },
      });
      map.addLayer({
        id: OPERATIONAL_TWIN_KINEMATIC_LAYER_ID,
        type: "line",
        source: OPERATIONAL_TWIN_MAP_SOURCE_ID,
        filter: ["all", ["==", ["get", "kind"], "corridor"], ["==", ["get", "mode"], "KINEMATIC"]],
        layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": AIRRADAR_MAP_THEME.selectedStrong,
          "line-opacity": 0.82,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.5, 8, 2.2, 13, 3.2],
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: OPERATIONAL_TWIN_MILESTONE_LAYER_ID,
        type: "circle",
        source: OPERATIONAL_TWIN_MAP_SOURCE_ID,
        filter: ["==", ["get", "kind"], "milestone"],
        layout: { visibility: "none" },
        paint: {
          "circle-color": AIRRADAR_MAP_THEME.selectedStrong,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.4, 9, 3.8, 13, 5],
          "circle-stroke-color": AIRRADAR_MAP_THEME.outline,
          "circle-stroke-width": 1.2,
        },
      });
      map.addLayer({
        id: OPERATIONAL_TWIN_MILESTONE_LABEL_LAYER_ID,
        type: "symbol",
        source: OPERATIONAL_TWIN_MAP_SOURCE_ID,
        minzoom: 5.5,
        filter: ["==", ["get", "kind"], "milestone"],
        layout: {
          visibility: "none",
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 9,
          "text-offset": [0, 1.1],
          "text-padding": 5,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": AIRRADAR_MAP_THEME.selectedStrong,
          "text-halo-color": AIRRADAR_MAP_THEME.outline,
          "text-halo-width": 1,
        },
      });
      map.addLayer({
        id: OPERATIONAL_TWIN_EVENT_LAYER_ID,
        type: "circle",
        source: OPERATIONAL_TWIN_MAP_SOURCE_ID,
        filter: ["==", ["get", "kind"], "event"],
        layout: { visibility: "none" },
        paint: {
          "circle-color": ["match", ["get", "eventType"],
            "SIGMET_INTERSECTION", AIRRADAR_MAP_THEME.hazard,
            "PLANNED_AIRSPACE", AIRRADAR_MAP_THEME.airspace,
            "ATC_SECTOR_ENTRY", AIRRADAR_MAP_THEME.atc.highlight,
            "RUNWAY_EXPECTATION", AIRRADAR_MAP_THEME.accent,
            AIRRADAR_MAP_THEME.weather],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3.2, 9, 4.6, 13, 6],
          "circle-stroke-color": AIRRADAR_MAP_THEME.outline,
          "circle-stroke-width": 1.4,
        },
      });
      map.addLayer({
        id: OPERATIONAL_TWIN_WEATHER_EVENT_LAYER_ID,
        type: "circle",
        source: OPERATIONAL_TWIN_MAP_SOURCE_ID,
        filter: ["==", ["get", "kind"], "weather-event"],
        layout: { visibility: "none" },
        paint: {
          "circle-color": ["match", ["get", "severity"],
            "SEVERE", AIRRADAR_MAP_THEME.hazard,
            "MODERATE", AIRRADAR_MAP_THEME.warning,
            AIRRADAR_MAP_THEME.weather],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 9, 5.5, 13, 7],
          "circle-opacity": 0.8,
          "circle-stroke-color": AIRRADAR_MAP_THEME.outline,
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: OPERATIONAL_TWIN_NAVIGATION_INTEGRITY_LAYER_ID,
        type: "circle",
        source: OPERATIONAL_TWIN_MAP_SOURCE_ID,
        filter: ["==", ["get", "kind"], "navigation-integrity-event"],
        layout: { visibility: "none" },
        paint: {
          "circle-color": ["match", ["get", "severity"],
            "SEVERE", AIRRADAR_MAP_THEME.hazard,
            "DEGRADED", AIRRADAR_MAP_THEME.warning,
            AIRRADAR_MAP_THEME.accent],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4.4, 9, 6, 13, 7.6],
          "circle-opacity": 0.86,
          "circle-stroke-color": AIRRADAR_MAP_THEME.outline,
          "circle-stroke-width": 1.6,
        },
      });
      map.addLayer({
        id: AIRCRAFT_OPERATIONAL_FOCUS_MAP_LINE_LAYER_ID,
        type: "line",
        source: AIRCRAFT_OPERATIONAL_FOCUS_MAP_SOURCE_ID,
        filter: ["==", ["get", "kind"], "corridor"],
        layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["match", ["get", "level"],
            "ATTENTION", AIRRADAR_MAP_THEME.hazard,
            AIRRADAR_MAP_THEME.warning],
          "line-opacity": 0.96,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 3, 8, 4.2, 13, 5.4],
        },
      });
      map.addLayer({
        id: AIRCRAFT_OPERATIONAL_FOCUS_MAP_POINT_LAYER_ID,
        type: "circle",
        source: AIRCRAFT_OPERATIONAL_FOCUS_MAP_SOURCE_ID,
        filter: ["==", ["get", "kind"], "target"],
        layout: { visibility: "none" },
        paint: {
          "circle-color": ["match", ["get", "level"],
            "ATTENTION", AIRRADAR_MAP_THEME.hazard,
            AIRRADAR_MAP_THEME.warning],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 6, 9, 8, 13, 10],
          "circle-opacity": 0.34,
          "circle-stroke-color": ["match", ["get", "level"],
            "ATTENTION", AIRRADAR_MAP_THEME.hazard,
            AIRRADAR_MAP_THEME.selectedStrong],
          "circle-stroke-width": 2.4,
        },
      });
      const revealOperationalFocusFromMap = (event: MapLayerMouseEvent) => {
        const itemId = event.features?.[0]?.properties?.itemId;
        const hex = selectedHexRef.current;
        if (typeof itemId !== "string" || !itemId || !hex) return;
        router.replace(aircraftOperationalFocusRadarHref(hex, itemId), { scroll: false });
        setOperationalFocusRevealVersion((value) => value + 1);
      };
      for (const layer of [
        AIRCRAFT_OPERATIONAL_FOCUS_MAP_LINE_LAYER_ID,
        AIRCRAFT_OPERATIONAL_FOCUS_MAP_POINT_LAYER_ID,
      ] as const) {
        map.on("click", layer, revealOperationalFocusFromMap);
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
      const openOperationalTwinMapEvent = (event: MapLayerMouseEvent) => {
        const properties = event.features?.[0]?.properties;
        if (!properties) return;
        const content = document.createElement("div");
        content.className = "map-popup";
        const title = document.createElement("strong");
        title.textContent = String(properties.title ?? properties.eventType ?? t.operationalTwin.title);
        const detail = document.createElement("span");
        const offset = Number(properties.offsetMinutes);
        const offsetLabel = Number.isFinite(offset) ? relativeTwinMapOffset(offset) : "";
        detail.textContent = [
          offsetLabel,
          properties.eventType ? String(properties.eventType).replaceAll("_", " ") : null,
          properties.confidence ? String(properties.confidence) : null,
          properties.provenance ? String(properties.provenance) : null,
          properties.severity ? String(properties.severity) : null,
          properties.source ? String(properties.source) : null,
          properties.detail ? String(properties.detail) : null,
        ].filter(Boolean).join(" · ");
        content.append(title, detail);
        new maplibregl.Popup({ closeButton: true, maxWidth: "320px" })
          .setLngLat(event.lngLat)
          .setDOMContent(content)
          .addTo(map);
      };
      for (const layer of [OPERATIONAL_TWIN_EVENT_LAYER_ID, OPERATIONAL_TWIN_WEATHER_EVENT_LAYER_ID, OPERATIONAL_TWIN_NAVIGATION_INTEGRITY_LAYER_ID] as const) {
        map.on("click", layer, openOperationalTwinMapEvent);
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
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
      map.addSource("atc-sectors", { type: "geojson", data: createAtcGeoJSON([], false) });
      const plannedFilter: FilterSpecification = ["any", ["==", ["get", "airspacePlanState"], "planned-now"], ["==", ["get", "airspacePlanState"], "upcoming"]];
      map.addLayer({ id: "airspace-plan-fill", type: "fill", source: "atc-sectors", filter: plannedFilter, layout: { visibility: "none" }, paint: { "fill-color": ["match", ["get", "airspacePlanState"], "planned-now", AIRRADAR_MAP_THEME.warning, AIRRADAR_MAP_THEME.weather], "fill-opacity": ["match", ["get", "airspacePlanState"], "planned-now", 0.12, 0.05] } });
      map.addLayer({ id: "airspace-plan-line", type: "line", source: "atc-sectors", filter: plannedFilter, layout: { visibility: "none" }, paint: { "line-color": ["match", ["get", "airspacePlanState"], "planned-now", AIRRADAR_MAP_THEME.selectedStrong, AIRRADAR_MAP_THEME.weather], "line-opacity": 0.66, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1, 8, 1.7, 13, 2.6], "line-dasharray": [2, 2] } });
      map.addLayer({ id: "airspace-plan-label", type: "symbol", source: "atc-sectors", minzoom: 6.5, filter: plannedFilter, layout: { visibility: "none", "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 10, "text-offset": [0, 0.8], "text-padding": 8, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": ["match", ["get", "airspacePlanState"], "planned-now", AIRRADAR_MAP_THEME.selectedStrong, AIRRADAR_MAP_THEME.label], "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1.2 } });
      map.addLayer({ id: "atc-sectors-fill", type: "fill", source: "atc-sectors", layout: { visibility: "none" }, paint: { "fill-color": AIRRADAR_MAP_THEME.atc.fill, "fill-opacity": ["match", ["get", "airspaceType"], "FIR", 0.012, "TMA", 0.022, "CTR", 0.03, 0.045] } });
      map.addLayer({ id: "atc-sectors-line", type: "line", source: "atc-sectors", layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.atc.line, "line-opacity": ["match", ["get", "airspacePlanState"], "planned-now", 0.82, "upcoming", 0.62, 0.48], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.75, 8, 1.25, 13, 2] } });
      map.addLayer({ id: "atc-sectors-label", type: "symbol", source: "atc-sectors", minzoom: 6.5, layout: { visibility: "none", "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 10, "text-offset": [0, 0.8], "text-padding": 8, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": AIRRADAR_MAP_THEME.atc.label, "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1.2 } });
      const trafficFilter: FilterSpecification = ["!=", ["get", "trafficLevel"], "NO_DATA"];
      map.addLayer({ id: "atc-sector-traffic-fill", type: "fill", source: "atc-sectors", filter: trafficFilter, layout: { visibility: "none" }, paint: { "fill-color": AIRRADAR_MAP_THEME.atc.trafficFill, "fill-opacity": 0.025 } });
      map.addLayer({ id: "atc-sector-traffic-line", type: "line", source: "atc-sectors", filter: trafficFilter, layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.atc.line, "line-opacity": 0.72, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.1, 10, 2.1, 13, 2.8] } });
      map.addLayer({ id: "atc-sector-traffic-label", type: "symbol", source: "atc-sectors", minzoom: 6.5, filter: trafficFilter, layout: { visibility: "none", "text-field": ["concat", ["get", "name"], " · ", ["to-string", ["get", "trafficAircraftCount"]]], "text-font": ["Noto Sans Regular"], "text-size": 10, "text-padding": 8, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": AIRRADAR_MAP_THEME.label, "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1.2 } });
      map.addLayer({ id: "atc-sectors-context-highlight", type: "line", source: "atc-sectors", filter: ["==", ["get", "id"], "__context-none__"], layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.atc.highlight, "line-opacity": 0.92, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.8, 8, 2.8, 13, 4.2] } });
      map.moveLayer("airspace-plan-fill");
      map.moveLayer("airspace-plan-line");
      map.moveLayer("airspace-plan-label");
      map.addSource("atc-transmitters", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "atc-transmitters-circle", type: "circle", source: "atc-transmitters", layout: { visibility: "none" }, paint: { "circle-color": AIRRADAR_MAP_THEME.atc.line, "circle-radius": 4, "circle-stroke-color": AIRRADAR_MAP_THEME.outline, "circle-stroke-width": 1.5 } });
      map.addSource("metar-airports", { type: "geojson", data: createMetarGeoJSON([]) });
      map.addLayer({ id: "metar-symbols", type: "circle", source: "metar-airports", layout: { visibility: "none" }, paint: { "circle-color": ["match", ["get", "flightCategory"], "VFR", AIRRADAR_MAP_THEME.metar.vfr, "MVFR", AIRRADAR_MAP_THEME.metar.mvfr, "IFR", AIRRADAR_MAP_THEME.metar.ifr, "LIFR", AIRRADAR_MAP_THEME.metar.lifr, AIRRADAR_MAP_THEME.metar.unknown], "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 3, 8, 5, 13, 7], "circle-opacity": ["case", ["get", "stale"], 0.38, 0.9], "circle-stroke-color": AIRRADAR_MAP_THEME.outline, "circle-stroke-width": 1.2 } });
      map.addLayer({ id: "metar-labels", type: "symbol", source: "metar-airports", minzoom: 8.5, layout: { visibility: "none", "text-field": ["concat", ["get", "stationId"], ["case", ["get", "stale"], " · STALE", ""]], "text-font": ["Noto Sans Regular"], "text-size": 10, "text-offset": [0, 1.25], "text-padding": 6, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": AIRRADAR_MAP_THEME.label, "text-opacity": ["case", ["get", "stale"], 0.45, 0.82], "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1 } });
      map.addSource("wind-aloft", { type: "geojson", data: createWindGeoJSON(null) });
      map.addLayer({ id: "wind-aloft-arrows", type: "symbol", source: "wind-aloft", minzoom: 5.5, layout: { visibility: "none", "text-field": ["case", ["has", "speedKt"], ["concat", "↑ ", ["to-string", ["round", ["get", "speedKt"]]], " kt"], "↑"], "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 5.5, 10, 10, 14], "text-rotate": ["coalesce", ["get", "directionDeg"], 0], "text-rotation-alignment": "map", "text-allow-overlap": false }, paint: { "text-color": AIRRADAR_MAP_THEME.weather, "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1.1 } });
      map.addSource("route-airports", { type: "geojson", data: createAirportGeoJSON([]) });
      map.addLayer({ id: "route-airports-circle", type: "circle", source: "route-airports", paint: { "circle-color": ["match", ["get", "tier"], "significant", AIRRADAR_MAP_THEME.airports.significant, "heliport", AIRRADAR_MAP_THEME.airports.heliport, AIRRADAR_MAP_THEME.airports.small], "circle-opacity": ["match", ["get", "tier"], "significant", 0.82, "heliport", 0.58, 0.52], "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.4, 9, 3.3, 13, 4.6], "circle-stroke-color": AIRRADAR_MAP_THEME.outline, "circle-stroke-width": 1.15 } });
      map.addLayer({ id: "route-airports-label", type: "symbol", source: "route-airports", minzoom: 6.2, layout: { "text-field": ["get", "code"], "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 6.2, 8, 10, 9, 13, 10], "text-offset": [0, 1.1], "text-padding": 7, "text-allow-overlap": false, "text-ignore-placement": false, "text-optional": true }, paint: { "text-color": AIRRADAR_MAP_THEME.airports.label, "text-opacity": ["interpolate", ["linear"], ["zoom"], 6.2, 0.52, 10, 0.72, 13, 0.86], "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 0.8 } });
      map.addSource("aviation-sigmet", { type: "geojson", data: EMPTY_SIGMET_DATA as unknown as FeatureCollection });
      map.addLayer({ id: "aviation-sigmet-fill", type: "fill", source: "aviation-sigmet", layout: { visibility: "none" }, paint: { "fill-color": AIRRADAR_MAP_THEME.hazard, "fill-opacity": 0.04 } });
      map.addLayer({ id: "aviation-sigmet-line", type: "line", source: "aviation-sigmet", layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.hazard, "line-opacity": 0.68, "line-width": 1.3, "line-dasharray": [2, 2] } });
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
        const planState = String(properties.airspacePlanState ?? "none");
        if (planState === "planned-now" || planState === "upcoming") {
          const plan = document.createElement("span");
          const planStatus = planState === "planned-now" ? activityT.plannedNow : activityT.upcoming;
          const staleNote = properties.airspacePlanStale === true ? ` · ${activityT.stale}: ${activityT.staleNote}` : "";
          const responsibleUnit = properties.airspacePlanResponsibleUnit ? ` · ${activityT.responsibleUnit}: ${String(properties.airspacePlanResponsibleUnit)}` : "";
          const activity = properties.airspacePlanActivity ? ` · ${activityT.activity}: ${String(properties.airspacePlanActivity)}` : "";
          plan.textContent = `${activityT.plannedAllocation}: ${planStatus} · ${activityT.timeWindow}: ${formatAirspaceUtc(String(properties.airspacePlanStartsAt))}–${formatAirspaceUtc(String(properties.airspacePlanEndsAt))} · ${activityT.levels}: ${String(properties.airspacePlanLowerLimit)}–${String(properties.airspacePlanUpperLimit)} · ${activityT.source}: ${String(properties.airspacePlanSource)} #${String(properties.airspacePlanSequence)}${responsibleUnit}${activity}${staleNote}. ${activityT.disclaimer}`;
          content.append(plan);
        }
        new maplibregl.Popup({ closeButton: true, maxWidth: "360px" }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
      });
      map.on("mouseenter", "atc-sectors-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "atc-sectors-fill", () => { map.getCanvas().style.cursor = ""; });
      map.on("click", "atc-sector-traffic-fill", (event: MapLayerMouseEvent) => {
        const properties = event.features?.[0]?.properties; if (!properties) return;
        const traffic = sectorTrafficRef.current.get(String(properties.id)); const content = document.createElement("div"); content.className = "map-popup";
        const title = document.createElement("strong"); title.textContent = `PRAHA ACC — ${String(properties.name)}`; content.append(title);
        const add = (label: string, value: unknown) => { const line = document.createElement("span"); line.textContent = `${label}: ${value == null || value === "" ? "—" : String(value)}`; content.append(line); };
        if (!traffic) add("Traffic", "NO DATA"); else { add("Vertical", `${traffic.vertical.lower ?? "—"}–${traffic.vertical.upper ?? "—"}`); add("Aircraft now", traffic.traffic.aircraftCount); add("Last 5 min", `+${traffic.traffic.entering5m} entered · -${traffic.traffic.leaving5m} left`); add("Vertical movement", `${traffic.traffic.climbing} climbing · ${traffic.traffic.descending} descending · ${traffic.traffic.level} level`); add("Altitude", `avg ${traffic.traffic.averageAltitude ?? "—"} · median ${traffic.traffic.medianAltitude ?? "—"}`); add("Ground speed", traffic.traffic.averageGroundSpeed == null ? "—" : `${traffic.traffic.averageGroundSpeed} kt`); add("Traffic", traffic.trafficLevel); add("Map time", traffic.at); add("Source", "Czech eAIP + AirRadar ADS-B"); }
        const note = document.createElement("small"); note.textContent = "Traffic statistics describe aircraft inside the published sector volume and do not represent the official operational sector configuration."; content.append(note);
        new maplibregl.Popup({ closeButton: true, maxWidth: "340px" }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
      });
      map.on("mouseenter", "atc-sector-traffic-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "atc-sector-traffic-fill", () => { map.getCanvas().style.cursor = ""; });
      map.on("click", "airspace-plan-fill", (event: MapLayerMouseEvent) => {
        const properties = event.features?.[0]?.properties;
        if (!properties) return;
        const content = document.createElement("div"); content.className = "map-popup";
        const title = document.createElement("strong"); title.textContent = String(properties.name ?? t.layers.airspaceActivity);
        const body = document.createElement("span");
        const planned = String(properties.airspacePlanState ?? "") === "planned-now";
        body.textContent = `${planned ? t.layers.airspacePlannedActive : t.layers.airspaceUnknown} · ${t.layers.valid}: ${formatAirspaceUtc(String(properties.airspacePlanStartsAt ?? ""))}–${formatAirspaceUtc(String(properties.airspacePlanEndsAt ?? ""))} · ${t.layers.source}: ${String(properties.airspacePlanSource ?? t.common.emptyValue)} · ${t.layers.airspaceDisclaimer}`;
        content.append(title, body);
        new maplibregl.Popup({ closeButton: true, maxWidth: "340px" }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
      });
      map.on("mouseenter", "airspace-plan-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "airspace-plan-fill", () => { map.getCanvas().style.cursor = ""; });
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
      (map.getSource("atc-sectors") as GeoJSONSource | undefined)?.setData(atcGeoJsonRef.current);
      (map.getSource("atc-transmitters") as GeoJSONSource | undefined)?.setData(transmitterGeoJsonRef.current);
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
      receiverMarkerRef.current?.remove();
      receiverMarkerRef.current = null;
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
    const rings = map.getSource("range-rings") as GeoJSONSource | undefined;
    const rangeLayer = map.getLayer("range-rings-line");
    if (receiver.lat === null || receiver.lon === null) {
      receiverMarkerRef.current?.remove();
      receiverMarkerRef.current = null;
      rings?.setData({ type: "FeatureCollection", features: [] });
      if (rangeLayer) map.setLayoutProperty("range-rings-line", "visibility", "none");
      if (map.getLayer("range-rings-label")) map.setLayoutProperty("range-rings-label", "visibility", "none");
      return;
    }
    const receiverWithCoordinates: ReceiverPosition = { name: receiver.name, lat: receiver.lat, lon: receiver.lon };
    if (!receiverMarkerRef.current) {
      const receiverElement = document.createElement("div");
      receiverElement.className = "receiver-marker";
      receiverElement.setAttribute("aria-label", t.radar.receiverPosition);
      receiverMarkerRef.current = new maplibregl.Marker({ element: receiverElement, anchor: "center" })
        .setLngLat([receiver.lon, receiver.lat])
        .addTo(map);
    }
    receiverMarkerRef.current?.setLngLat([receiver.lon, receiver.lat]);
    rings?.setData(createRangeRingsGeoJSON(receiverWithCoordinates, showRangeRings ? RANGE_RING_RADII_KM : []));
    if (rangeLayer) map.setLayoutProperty("range-rings-line", "visibility", showRangeRings ? "visible" : "none");
    if (map.getLayer("range-rings-label")) map.setLayoutProperty("range-rings-label", "visibility", showRangeRings ? "visible" : "none");
    if (shouldRecenterOnReceiver(snapshot.provider, centeredReceiverRef.current, receiver)) {
      map.jumpTo({ center: [receiver.lon, receiver.lat] });
      centeredReceiverRef.current = receiverWithCoordinates;
    }
  }, [mapReady, showRangeRings, snapshot.provider, snapshot.receiver]);

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
    const isHtmlSpecialAircraft = (aircraft: AircraftView) => aircraft.icaoHex === selectedHex
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
  }, [colorMode, currentRadarPadding, distanceFilter, isLiveAircraftWatchlisted, liveAircraftByHexRef, liveSnapshotRef, liveTrailsRef, mapFilters, mapReady, mapZoom, pendingAircraftChangesRef, search, selectedHistoryTrail, selectedRouteAirportCodesKey, showAircraft, showAirports, selectedHex, selectAircraft, watchlistOnly]);

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

  useEffect(() => {
    if (!showSids && !showStars) { setProcedures([]); return; }
    const controller = new AbortController();
    fetch("/api/procedures", { cache: "force-cache", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ procedures?: Procedure[] }> : { procedures: [] })
      .then((result) => setProcedures(result.procedures ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [showSids, showStars]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource("procedures-sid") as GeoJSONSource | undefined)?.setData(createProcedureGeoJSON(procedures.filter((procedure) => procedure.type === "SID"), "SID"));
    (map.getSource("procedures-star") as GeoJSONSource | undefined)?.setData(createProcedureGeoJSON(procedures.filter((procedure) => procedure.type === "STAR"), "STAR"));
    if (map.getLayer("procedures-sid-line")) map.setLayoutProperty("procedures-sid-line", "visibility", showSids ? "visible" : "none");
    if (map.getLayer("procedures-star-line")) map.setLayoutProperty("procedures-star-line", "visibility", showStars ? "visible" : "none");
  }, [mapReady, procedures, showSids, showStars]);

  useEffect(() => {
    const atcGeoJson = createAtcGeoJSON(atcData.sectors, showAtc || showAupUup || showAtcTraffic, airspaceActivity, sectorTraffic);
    const transmitterGeoJson: FeatureCollection = {
      type: "FeatureCollection",
      features: showAtc ? atcData.transmitters.filter((transmitter) => Number.isFinite(transmitter.longitude) && Number.isFinite(transmitter.latitude)
        && transmitter.longitude >= -180 && transmitter.longitude <= 180
        && transmitter.latitude >= -90 && transmitter.latitude <= 90).map((transmitter) => ({
        type: "Feature" as const,
        properties: { name: transmitter.name, service: formatAtcService(transmitter.service), frequency: formatAtcFrequency(transmitter.frequencyMhz), notes: formatAtcNote(transmitter.notes), source: transmitter.source, sourceReference: transmitter.sourceReference, validFrom: transmitter.validFrom, validTo: transmitter.validTo, lastVerifiedAt: transmitter.lastVerifiedAt },
        geometry: { type: "Point" as const, coordinates: [transmitter.longitude, transmitter.latitude] },
      })) : [],
    };
    atcGeoJsonRef.current = atcGeoJson;
    transmitterGeoJsonRef.current = transmitterGeoJson;
    mapReplayRef.current.atc.setData(atcGeoJson);
    mapReplayRef.current.transmitters.setData(transmitterGeoJson);
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource("atc-sectors") as GeoJSONSource | undefined)?.setData(atcGeoJson);
    (map.getSource("atc-transmitters") as GeoJSONSource | undefined)?.setData(transmitterGeoJson);
    for (const layer of ["atc-sectors-fill", "atc-sectors-line", "atc-sectors-label", "atc-transmitters-circle"] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", showAtc ? "visible" : "none");
    }
    for (const layer of ["atc-sector-traffic-fill", "atc-sector-traffic-line", "atc-sector-traffic-label"] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", showAtcTraffic ? "visible" : "none");
    }
    for (const layer of ["airspace-plan-fill", "airspace-plan-line", "airspace-plan-label"] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", showAupUup ? "visible" : "none");
    }
    // The initial radar view is receiver-centred on Czechia. Without this fit,
    // valid Slovak/Austrian sectors are loaded but remain outside the viewport.
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
  }, [airspaceActivity, atcData, currentRadarPadding, mapReady, sectorTraffic, showAtc, showAtcTraffic, showAupUup]);

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
    (map.getSource("wind-aloft") as GeoJSONSource | undefined)?.setData(createWindGeoJSON(windData));
    if (map.getLayer("wind-aloft-arrows")) map.setLayoutProperty("wind-aloft-arrows", "visibility", showWind && Boolean(windData) ? "visible" : "none");
  }, [mapReady, showWind, windData]);

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
  const selectedRouteCorridor = useRouteCorridorIntelligence(selectedAircraft);
  const selectedSigmetContext = useMemo(() => aircraftSigmetContext(selectedAircraft, sigmetData), [selectedAircraft, sigmetData]);
  const selectedSigmetDeviation = useMemo(() => detectSigmetTrajectoryDeviation(
    selectedAircraft,
    selectedHistoryTrail?.points ?? selectedAircraft?.trail ?? [],
    sigmetData,
  ), [selectedAircraft, selectedHistoryTrail, sigmetData]);
  const selectedWeatherAvoidance = useMemo(() => buildWeatherAvoidanceIntelligence({
    deviation: selectedSigmetDeviation,
    conformance: selectedRouteCorridor.conformance,
    weatherCorridor: selectedOperationalTwin?.status === "available"
      ? selectedOperationalTwin.weatherCorridor
      : null,
  }), [selectedOperationalTwin, selectedRouteCorridor.conformance, selectedSigmetDeviation]);
  const selectedDestination = selectedAircraft?.enrichment?.route?.destinationAirport ?? null;
  const selectedWind = useSelectedAircraftWindContext(
    selectedAircraft,
    selectedDestination ? { lat: selectedDestination.latitude, lon: selectedDestination.longitude } : null,
  );
  const selectedOgnTarget = ognSnapshot.targets.find((target) => target.id === selectedOgnId) ?? null;
  const selectedIdentity = selectedAircraft?.icaoHex ?? selectedDatabaseAircraft?.icaoHex ?? selectedHex;
  const contextAircraftHex = selectedAircraftSnapshot?.icaoHex ?? null;
  const contextHasPosition = selectedAircraftSnapshot?.lat !== null && selectedAircraftSnapshot?.lon !== null;

  useEffect(() => {
    setSelectedIntelligenceEvents([]);
    if (!contextAircraftHex) return;
    const controller = new AbortController();
    void fetch(`/api/intelligence/events?aircraft=${encodeURIComponent(contextAircraftHex)}&limit=8`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ events?: FlightIntelligenceEvent[] }> : null)
      .then((value) => { if (value?.events) setSelectedIntelligenceEvents(value.events); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [contextAircraftHex]);

  useEffect(() => {
    setSelectedAtcContext(null);
    if (!contextAircraftHex || !contextHasPosition) {
      return;
    }
    let active = true;
    const refresh = () => {
      void fetch(`/api/aircraft/${encodeURIComponent(contextAircraftHex)}/context`, { cache: "no-store" })
        .then((response) => response.json() as Promise<AtcContextResult>)
        .then((value) => { if (active) setSelectedAtcContext(value); })
        .catch(() => { if (active) setSelectedAtcContext(null); });
    };
    refresh();
    let timer: number | null = null;
    const schedule = () => {
      timer = window.setTimeout(() => { refresh(); schedule(); }, 5_000);
    };
    schedule();
    return () => { active = false; if (timer !== null) window.clearTimeout(timer); };
  }, [contextAircraftHex, contextHasPosition]);

  useEffect(() => {
    setSelectedRouteWeather(null);
    if (!contextAircraftHex || !contextHasPosition || selectedAtcContext?.status !== "available") return;
    let active = true;
    let timer: number | null = null;
    const refresh = () => {
      void fetch(`/api/aircraft/${encodeURIComponent(contextAircraftHex)}/route-weather`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok && response.status >= 500) throw new Error("route-weather unavailable");
          return await response.json() as RouteWeatherContext;
        })
        .then((value) => { if (active) setSelectedRouteWeather(value); })
        .catch(() => { if (active) setSelectedRouteWeather(null); });
    };
    refresh();
    const schedule = () => {
      timer = window.setTimeout(() => { refresh(); schedule(); }, 120_000);
    };
    schedule();
    return () => { active = false; if (timer !== null) window.clearTimeout(timer); };
  }, [contextAircraftHex, contextHasPosition, selectedAtcContext?.status]);

  useEffect(() => {
    setSelectedOperationalTwin(null);
    setSelectedOperationalFocusChanges(null);
    if (!contextAircraftHex || !contextHasPosition) return;
    let active = true;
    let timer: number | null = null;
    const refresh = () => {
      void fetch(`/api/aircraft/${encodeURIComponent(contextAircraftHex)}/situation`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok && response.status >= 500) throw new Error("operational twin unavailable");
          return await response.json() as OperationalTwinApiResponse;
        })
        .then((value) => {
          if (!active) return;
          setSelectedOperationalTwin(value);
          if (value.status !== "available" || !value.operationalFocus) {
            setSelectedOperationalFocusChanges(null);
            return;
          }
          const hex = value.aircraft.icaoHex.toUpperCase();
          const previous = operationalFocusSnapshotsRef.current.get(hex) ?? null;
          setSelectedOperationalFocusChanges(compareAircraftOperationalFocus(previous, value.operationalFocus));
          operationalFocusSnapshotsRef.current.set(hex, value.operationalFocus);
        })
        .catch(() => {
          if (!active) return;
          setSelectedOperationalTwin(null);
          setSelectedOperationalFocusChanges(null);
        });
    };
    refresh();
    const schedule = () => {
      timer = window.setTimeout(() => { refresh(); schedule(); }, 60_000);
    };
    schedule();
    return () => { active = false; if (timer !== null) window.clearTimeout(timer); };
  }, [contextAircraftHex, contextHasPosition]);

  const selectedAircraftVisible = Boolean(selectedAircraft && filteredAircraft.some((aircraft) => aircraft.icaoHex === selectedAircraft.icaoHex));
  const activeOperationalFocusItem = useMemo(() => {
    if (
      !selectedAircraftVisible
      || !operationalFocusMapId
      || selectedOperationalTwin?.status !== "available"
      || aircraftFocus !== selectedOperationalTwin.aircraft.icaoHex.toUpperCase()
    ) return null;
    return selectedOperationalTwin.operationalFocus?.items.find((item) => item.id === operationalFocusMapId) ?? null;
  }, [
    aircraftFocus,
    operationalFocusMapId,
    selectedAircraftVisible,
    selectedOperationalTwin,
  ]);
  const clearOperationalFocusMap = useCallback(() => {
    if (!aircraftFocus) return;
    router.replace(aircraftOperationalFocusClearHref(aircraftFocus), { scroll: false });
  }, [aircraftFocus, router]);
  const focusOperationalItemFromDrawer = useCallback((itemId: string) => {
    if (!selectedAircraft) return;
    router.replace(aircraftOperationalFocusRadarHref(selectedAircraft.icaoHex, itemId), { scroll: false });
  }, [router, selectedAircraft]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const availableTwin = selectedAircraftVisible && selectedOperationalTwin?.status === "available"
      ? selectedOperationalTwin
      : null;
    const twinSource = map.getSource(OPERATIONAL_TWIN_MAP_SOURCE_ID) as GeoJSONSource | undefined;
    twinSource?.setData(createOperationalTwinMapGeoJSON(availableTwin));
    const visibility = availableTwin ? "visible" : "none";
    for (const layer of [
      OPERATIONAL_TWIN_UNCERTAINTY_LAYER_ID,
      OPERATIONAL_TWIN_ROUTE_LAYER_ID,
      OPERATIONAL_TWIN_KINEMATIC_LAYER_ID,
      OPERATIONAL_TWIN_MILESTONE_LAYER_ID,
      OPERATIONAL_TWIN_MILESTONE_LABEL_LAYER_ID,
      OPERATIONAL_TWIN_EVENT_LAYER_ID,
      OPERATIONAL_TWIN_WEATHER_EVENT_LAYER_ID,
      OPERATIONAL_TWIN_NAVIGATION_INTEGRITY_LAYER_ID,
    ] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", visibility);
    }
  }, [mapReady, selectedAircraftVisible, selectedOperationalTwin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const availableTwin = selectedAircraftVisible
      && selectedOperationalTwin?.status === "available"
      && aircraftFocus === selectedOperationalTwin.aircraft.icaoHex.toUpperCase()
      ? selectedOperationalTwin
      : null;
    const target = resolveAircraftOperationalFocusMapTarget(availableTwin, operationalFocusMapId);
    const source = map.getSource(AIRCRAFT_OPERATIONAL_FOCUS_MAP_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(createAircraftOperationalFocusMapGeoJSON(availableTwin, operationalFocusMapId));
    const visibility = target ? "visible" : "none";
    for (const layer of [
      AIRCRAFT_OPERATIONAL_FOCUS_MAP_LINE_LAYER_ID,
      AIRCRAFT_OPERATIONAL_FOCUS_MAP_POINT_LAYER_ID,
    ] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", visibility);
    }

    if (!target || !availableTwin) {
      if (!operationalFocusMapId) operationalFocusMapCameraKeyRef.current = null;
      return;
    }
    const cameraKey = `${availableTwin.aircraft.icaoHex}:${target.itemId}`;
    if (operationalFocusMapCameraKeyRef.current === cameraKey) return;
    operationalFocusMapCameraKeyRef.current = cameraKey;
    map.easeTo({
      center: [target.lon, target.lat],
      zoom: Math.max(map.getZoom(), 9),
      padding: currentRadarPadding(),
      duration: prefersReducedMotion() ? 0 : 650,
    });
  }, [
    aircraftFocus,
    currentRadarPadding,
    mapReady,
    operationalFocusMapId,
    selectedAircraftVisible,
    selectedOperationalTwin,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(ROUTE_INTELLIGENCE_SOURCE_ID) as GeoJSONSource | undefined;
    const geojson = selectedAircraftVisible
      ? createRouteIntelligenceGeoJSON(selectedRouteCorridor.route)
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
  }, [mapReady, selectedAircraftVisible, selectedRouteCorridor.route]);

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
    <main className="radar-shell">
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

      <div className="radar-workspace">
        <RadarNavRail showAtc={showAtc} onShowAtcChange={setShowAtc} showAirports={showAirports} onShowAirportsChange={setShowAirports} />
        <section ref={radarContentRef} className="radar-content">
        <div className="map-panel">
          <div ref={mapContainerRef} className="map-container" />
          <div className="map-overlay">
            {showAtcTraffic && <><AtcVerticalTraffic traffic={sectorTraffic} /><SectorFlowsPanel flows={sectorFlows} windowMinutes={sectorFlowWindow} onWindowChange={setSectorFlowWindow} /></>}
            <div className="map-overlay-primary" data-testid="radar-map-hud">
              <Panel className="map-overlay-card map-summary-card">
                <div className="map-summary-item map-summary-count"><strong>{formatNumber(displayedAircraftCount)}</strong><span>{t.stats.trackingNow}</span></div>
                {activeCoverage === "extended" && snapshot.sourceStats && <details className="source-counter-details">
                  <summary aria-label={t.radar.trafficSourceLabel} title={t.radar.trafficSourceLabel}>
                    <UiIcon name="statistics" />
                    <span className="source-counter-label">{t.aircraft.source}</span>
                  </summary>
                  <div className="source-counter-strip" aria-label={t.radar.trafficSourceLabel}>
                    <span><strong>{formatNumber(snapshot.sourceStats.local)}</strong><small>LOCAL</small></span>
                    <span><strong>{formatNumber(snapshot.sourceStats.network)}</strong><small>NETWORK</small></span>
                    <span><strong>{formatNumber(snapshot.sourceStats.overlap)}</strong><small>OVERLAP</small></span>
                    <span><strong>{formatNumber(snapshot.sourceStats.total)}</strong><small>TOTAL</small></span>
                  </div>
                </details>}
              </Panel>
              <MapControlGroup className="map-control-group-primary">
              <RadarOperationsCenter />
              <button ref={trafficTriggerRef} type="button" className={`traffic-trigger map-control ${drawerState !== "closed" ? "active" : ""}`} aria-expanded={drawerState !== "closed"} aria-controls="radar-sidebar" aria-label={t.radar.trafficNearby} data-testid="traffic-trigger" onClick={() => openTrafficDrawer()}>
                <span className="traffic-trigger-label">{t.radar.trafficNearby}</span>
                <strong>{formatNumber(activeTrafficCount)}</strong>
              </button>
              </MapControlGroup>
              <RadarPresetMenu presets={radarPresets} onSave={saveCurrentRadarPreset} onApply={applyRadarPreset} onDelete={deleteRadarPreset} />
              <RadarMapLayerMenu
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
                showAtcTraffic={showAtcTraffic}
                onShowAtcTrafficChange={setShowAtcTraffic}
                atcDataset={atcDataset}
                sectorTrafficState={sectorTrafficState}
                airspaceActivity={airspaceActivity}
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
                showSids={showSids}
                onShowSidsChange={setShowSids}
                showStars={showStars}
                onShowStarsChange={setShowStars}
                sigmetEnabled={sigmetEnabled}
                showSigmet={showSigmet}
                onShowSigmetChange={setShowSigmet}
                showWeatherRadar={showWeatherRadar}
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
                showWind={showWind}
                onShowWindChange={setShowWind}
                windLevel={windLevel}
                windPressureLevels={WIND_PRESSURE_LEVELS}
                onWindLevelChange={setWindLevel}
                windValidAt={windValidAt}
                onWindValidAtChange={setWindValidAt}
                windData={windData}
                windStatus={windStatus}
                showAircraftWeather={showAircraftWeather}
                onShowAircraftWeatherChange={setShowAircraftWeather}
                showNavigationIntegrity={showNavigationIntegrity}
                onShowNavigationIntegrityChange={setShowNavigationIntegrity}
                showAupUup={showAupUup}
                onShowAupUupChange={setShowAupUup}
                airspaceDataset={airspaceDataset}
                receiverPositionAvailable={receiverPositionAvailable}
                showRangeRings={showRangeRings}
                onShowRangeRingsChange={setShowRangeRings}
                colorMode={colorMode}
                onColorModeChange={setColorMode}
              />
            </div>
            <RadarQuickActions
              weatherEnabled={showWeatherRadar}
              weatherState={weatherView.state}
              atcEnabled={showAtc}
              activeFilterCount={activeFilterCount}
              filtersDisabled={trafficSource === "ogn"}
              selectionOpen={drawerState === "aircraft" || drawerState === "ogn"}
              onToggleWeather={() => {
                const enabled = !showWeatherRadar;
                setShowWeatherRadar(enabled);
                if (!enabled) setRadarPlaying(false);
              }}
              onToggleAtc={() => setShowAtc((current) => !current)}
              onOpenFilters={() => openTrafficDrawer("filters")}
            />
            {activeOperationalFocusItem ? (
              <RadarOperationalFocusCard
                item={activeOperationalFocusItem}
                onClear={clearOperationalFocusMap}
              />
            ) : null}
            {selectedAircraftVisible && selectedAircraft ? <RadarFlightFollowHud
              aircraft={selectedAircraft}
              compact={drawerState === "aircraft"}
              corridor={selectedRouteCorridor.corridor}
              conformance={selectedRouteCorridor.conformance}
              operationalTwin={selectedOperationalTwin}
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
            {showRangeRings || colorMode !== "default" || (selectedAircraftVisible && selectedAircraft?.enrichment?.route) || (selectedAircraftVisible && selectedOperationalTwin?.status === "available") || showAtc || showAtsRoutes || showMetar || showAupUup || showNavigationIntegrity ? <Panel className="map-overlay-card contextual-legend">
              {showRangeRings && receiverPositionAvailable && <span className="range-legend-item"><strong>{t.layers.rangeRings}</strong><span><i className="legend-line range-ring" /> {RANGE_RING_RADII_KM.join(" · ")} km</span></span>}
              {(showAtc || showAupUup) && <span className="layer-legend aviation-layer-legend"><strong>{t.layers.atc}</strong><span><i className="legend-line atc-context" /> {t.atc.sector}</span><span><i className="legend-line atc-background" /> {t.layers.atc}</span>{showAupUup && <span><i className="legend-line planned" /> {activityT.legendUpcoming}</span>}</span>}
              {showAtsRoutes && <span className="layer-legend aviation-layer-legend"><strong>{t.layers.atsRoutes}</strong><span><i className="legend-line ats-network" /> {t.layers.atsRoutes}</span><span><i className="legend-line ats-selected" /> {t.route.context}</span></span>}
              {showMetar && <span className="layer-legend aviation-layer-legend"><strong>{t.layers.metar}</strong><span><i className="metar-dot vfr" /> {t.layers.vfr}</span><span><i className="metar-dot mvfr" /> {t.layers.mvfr}</span><span><i className="metar-dot ifr" /> {t.layers.ifr}</span></span>}
              {showNavigationIntegrity && <span className="layer-legend aviation-layer-legend"><strong>{t.layers.navigationIntegrity}</strong><span><i className="legend-line planned" /> {t.layers.navigationIntegrityReduced}</span><small>{t.layers.navigationIntegrityDisclaimer}</small></span>}
              {colorMode !== "default" && <span className="color-mode-legend"><strong>{t.layers.colorModes[colorMode]}</strong><span><i className="color-legend-swatch low" /> {t.layers.colorLegendLow}</span><span><i className="color-legend-swatch high" /> {t.layers.colorLegendHigh}</span><span><i className="color-legend-swatch fallback" /> {t.layers.colorLegendFallback}</span></span>}
              {selectedAircraftVisible && selectedAircraft?.enrichment?.route && <span className="layer-legend"><span><i className="legend-line actual" /> {t.route.actualTrail}</span><span><i className="legend-line completed" /> {t.route.originToCurrent}</span><span><i className="legend-line remaining" /> {t.route.currentToDestination}</span><small>{t.route.contextDisclaimer}</small></span>}
              {selectedAircraftVisible && selectedOperationalTwin?.status === "available" && <span className="layer-legend" data-testid="operational-twin-map-legend"><strong>{t.operationalTwin.title}</strong><span><i className="legend-line remaining" /> {selectedOperationalTwin.corridor.mode === "ROUTE_AWARE" ? t.operationalTwin.routeAware : t.operationalTwin.kinematic}</span><small>± {formatNumber(selectedOperationalTwin.corridor.maxUncertaintyNm, 1)} NM · {selectedOperationalTwin.corridor.horizonMinutes} min</small></span>}
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
            sigmetDeviation={selectedSigmetDeviation}
            weatherAvoidance={selectedWeatherAvoidance}
            sigmetStale={sigmetData.stale}
            windContext={selectedWind.context}
            windAhead={selectedWind.ahead}
            destinationWind={selectedWind.destination}
            windStatus={selectedWind.status}
            routeWeather={selectedRouteWeather}
            routeCorridor={selectedRouteCorridor.corridor}
            routeConformance={selectedRouteCorridor.conformance}
            intelligenceEvents={selectedIntelligenceEvents}
            operationalTwin={selectedOperationalTwin}
            operationalFocusChanges={selectedOperationalFocusChanges}
            operationalFocusItemId={operationalFocusMapId}
            operationalFocusRevealVersion={operationalFocusRevealVersion}
            onOperationalFocus={focusOperationalItemFromDrawer}
            sectorTraffic={sectorTraffic}
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