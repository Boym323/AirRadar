"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import * as maplibregl from "maplibre-gl";
import type { FilterSpecification, GeoJSONSource, ImageSource, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import {
  formatAge,
  formatAltitude,
  formatAtcFrequency,
  formatAtcLimit,
  formatAtcNote,
  formatAtcService,
  formatCoordinate,
  formatDateTime,
  formatDistance,
  formatNumber,
  formatSpeed,
  formatTrack,
  t,
  visibleAircraft,
  watchlistKindLabel,
  watchlistSummary,
} from "@/lib/i18n";
import { haversineDistanceKm } from "@/lib/geo";
import { MAX_PREDICTION_CORRECTION_KM, correctionFor, motionAt, normalizeHeading, predictedPosition, shortestLongitudeDelta, createMotionHistory, updateMotionHistory, AIRCRAFT_ICON_ROTATION_OFFSET_DEG, type MotionHistory } from "@/lib/aircraft/motion";
import { shouldRecenterOnReceiver } from "@/lib/receiver";
import type { AircraftView, CoverageMode, PublicReceiverPosition, PublicStateSnapshot, ReceiverPosition, TrailPoint } from "@/lib/aircraft/types";
import { positionObservedAt } from "@/lib/aircraft/source-merge";
import { TAR1090_UNKNOWN_ICON_ASSET } from "@/lib/aircraft/tar1090-icon-map";
import { classifyAircraftIcon } from "@/lib/aircraft/icon-classification";
import { boundTrailPoints, selectedTrail } from "@/lib/aircraft/trail";
import type { Airport } from "@/lib/airports/types";
import type { AtcDataResponse, AtcSector } from "@/lib/atc/types";
import type { AtcContextResult } from "@/lib/atc-context/types";
import type { AirspaceActivityResponse } from "@/lib/airspace-activity/types";
import { buildAirspacePlanMapIndex, matchAirspacePlanForSector } from "@/lib/airspace-activity/map";
import { airspaceActivityMapT as activityT } from "@/lib/i18n/airspace-activity";
import { RelevantAtcPanel } from "@/components/relevant-atc-panel";
import { AircraftRadarQuickDetail } from "@/components/aircraft-radar-quick-detail";
import { AtcVerticalTraffic, SectorFlowsPanel, type SectorFlow } from "@/components/atc-sector-traffic-panels";
import { matchesAircraftRule, normalizeAircraftRuleType } from "@/lib/aircraft/watchlist";
import type { AircraftQuickDetailResponse, HistoryResponse } from "@/lib/server/history";
import type { MetarMapObservation, SigmetSnapshot } from "@/lib/weather/types";
import { WEATHER_RADAR_BOUNDS } from "@/lib/server/weather-radar/types";
import type { WindLevelHpa } from "@/lib/server/wind-aloft";
import type { OgnStateSnapshot, OgnTargetView } from "@/lib/ogn/types";
import { airportVisibilityFilter, airportVisibilityTier, DEFAULT_AIRPORT_LAYER_VISIBILITY, type AirportLayerVisibility, AIRPORT_MAP_RADIUS_NM } from "@/lib/airport-visibility";
import { aircraftMarkerClassNames } from "@/lib/radar-ui";
import { createRangeRingsGeoJSON, RANGE_RING_RADII_KM } from "@/lib/range-rings";
import { aircraftColor, type AircraftColorMode } from "@/lib/aircraft/color-mode";
import { aircraftMapLabel } from "@/lib/aircraft/map-labels";
import {
  createRouteAirportGeoJSON,
  createRouteGeoJSON,
  ROUTE_V2_AIRPORT_CIRCLE_LAYER_ID,
  ROUTE_V2_AIRPORT_LABEL_LAYER_ID,
  ROUTE_V2_AIRPORT_SOURCE_ID,
  ROUTE_V2_COMPLETED_LAYER_ID,
  ROUTE_V2_REMAINING_LAYER_ID,
  ROUTE_V2_SOURCE_ID,
} from "@/lib/route-visualization";
import { AirRadarTopbar, MobileBottomNav } from "@/components/airradar-shell";
import { IconButton, MapControl, MapControlGroup, Panel, StatusBadge, UiIcon } from "@/components/ui-primitives";
import { LogbookSummary } from "@/components/logbook-summary";
import { IntelligenceFeed } from "@/components/intelligence-feed";
import { useAircraftStream } from "@/components/use-aircraft-stream";
import { useDatasetQuery, type DatasetState } from "@/components/use-dataset-query";
import { createMapDatasetReplay } from "@/lib/map-layer-reliability";
import { configureMapLibreWorker } from "@/lib/maplibre-worker";
import { createProcedureGeoJSON } from "@/lib/procedure-visualization";
import type { Procedure } from "@/lib/route-intelligence/contracts";
import {
  DEFAULT_MAP_AIRCRAFT_FILTERS,
  filterAircraftForMap,
  isMapAircraftFilterActive,
  type AircraftQuickFilter,
  type MapAircraftFilters,
} from "@/lib/aircraft/map-filters";
import { aircraftPositionSourceLabel, aircraftSourceLabel, classifyAircraftSource, type AircraftSourceFilter } from "@/lib/aircraft/source-awareness";

declare global {
  interface Window {
    __airradarMapForDiagnostics?: maplibregl.Map;
  }
}

const DEMO_RECEIVER: ReceiverPosition = { lat: 50.0755, lon: 14.4378, name: t.radar.receiverName };
const EMPTY_RECEIVER: PublicReceiverPosition = { lat: null, lon: null, name: t.radar.receiverName };
const EMPTY_ATC_DATA: AtcDataResponse = {
  sectors: [],
  transmitters: [],
  metadata: { status: "unavailable", source: null, sourceReference: null, effectiveDate: null, lastVerifiedAt: null, sectorCount: 0, transmitterCount: 0 },
};
const EMPTY_SIGMET_DATA: SigmetSnapshot = { type: "FeatureCollection", features: [], fetchedAt: new Date(0).toISOString(), stale: false };
const EMPTY_OGN_SNAPSHOT: OgnStateSnapshot = { enabled: false, status: "disabled", fetchedAt: new Date(0).toISOString(), targets: [] };
const EMPTY_ATS_GEOJSON = { type: "FeatureCollection" as const, features: [] };
const EMPTY_PROCEDURE_GEOJSON = { type: "FeatureCollection" as const, features: [] };
const EMPTY_RADAR_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const WEATHER_RADAR_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [WEATHER_RADAR_BOUNDS.west, WEATHER_RADAR_BOUNDS.north],
  [WEATHER_RADAR_BOUNDS.east, WEATHER_RADAR_BOUNDS.north],
  [WEATHER_RADAR_BOUNDS.east, WEATHER_RADAR_BOUNDS.south],
  [WEATHER_RADAR_BOUNDS.west, WEATHER_RADAR_BOUNDS.south],
];
interface WeatherRadarCatalogResponse { available: boolean; frames: Array<{ id: string; observedAt: string; imageUrl: string; latest: boolean; stale: boolean }>; latestFrameId: string | null; bounds: typeof WEATHER_RADAR_BOUNDS; }
interface WindResponse { model: string; modelRun: string | null; validAt: string; availableValidTimes: string[]; levelHpa: WindLevelHpa; points: Array<{ lat: number; lon: number; speedKt: number | null; directionDeg: number | null }>; stale: boolean; }
interface SectorTrafficView { sectorId: string; name: string; at: string; vertical: { lower: string | null; upper: string | null }; traffic: { aircraftCount: number; entering1m: number; entering5m: number; entering15m: number; leaving1m: number; leaving5m: number; leaving15m: number; climbing: number; descending: number; level: number; averageAltitude: number | null; medianAltitude: number | null; averageGroundSpeed: number | null }; trafficLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH"; frequencies: Array<{ channel: string }>; source: { airspace: string; traffic: string }; }
const WIND_PRESSURE_LEVELS: WindLevelHpa[] = [850, 700, 500, 300, 200];
interface AtsRoutesResponse { available: boolean; source?: { name: string; reference: string; effectiveDate: string; aipAmendment: string | null; airacAmendment: string | null }; counts?: { routes: number; points: number; segments: number; cdrSegments: number; discontinuities: number }; segments?: FeatureCollection; labels?: FeatureCollection; points?: FeatureCollection; }

const airportDatasetSchema = z.array(z.object({
  icaoCode: z.string(), name: z.string(), latitude: z.number().finite(), longitude: z.number().finite(),
}).passthrough());
const atcDatasetSchema = z.object({ sectors: z.array(z.unknown()), transmitters: z.array(z.unknown()), metadata: z.record(z.string(), z.unknown()) }).passthrough();
const atsDatasetSchema = z.object({ available: z.boolean() }).passthrough();
const airspaceDatasetSchema = z.object({ planned: z.unknown(), historicalActual: z.unknown() }).passthrough();

function parseAirportDataset(value: unknown): value is Airport[] { return airportDatasetSchema.safeParse(value).success; }

function parseAtcDataset(value: unknown): value is AtcDataResponse {
  return atcDatasetSchema.safeParse(value).success;
}

function parseAtsDataset(value: unknown): value is AtsRoutesResponse {
  return atsDatasetSchema.safeParse(value).success;
}

function parseAirspaceDataset(value: unknown): value is AirspaceActivityResponse {
  return airspaceDatasetSchema.safeParse(value).success;
}

async function parseJsonDataset<T>(response: Response, validator: (value: unknown) => value is T): Promise<T> {
  const value: unknown = await response.json();
  if (!validator(value)) throw new SyntaxError("malformed dataset response");
  return value;
}

function datasetStateLabel(label: string, dataset: DatasetState<unknown>, countLabel: (count: number) => string): string {
  if ((dataset.status === "ready" || dataset.status === "stale") && dataset.itemCount > 0) return `${label} · ${countLabel(dataset.itemCount)}`;
  if (dataset.status === "retrying" || dataset.status === "loading" || dataset.status === "stale") return `${label} · ${t.layers.reconnecting}`;
  if (dataset.status === "unavailable") return `${label} · ${t.layers.unavailable}`;
  return label;
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

const MIN_AIRCRAFT_ANIMATION_MS = 650;
const MAX_AIRCRAFT_ANIMATION_MS = 8_000;
const EMPTY_TRAIL: TrailPoint[] = [];

function trailEndpointKey(point: TrailPoint | undefined): string {
  return point ? `${point.recordedAt}|${point.lat}|${point.lon}` : "";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hasRenderableAircraftMotion(source: { track: number | null; groundSpeed: number | null }): boolean {
  return source.track !== null && source.groundSpeed !== null && Number.isFinite(source.groundSpeed) && source.groundSpeed >= 0.5;
}

type TrafficSource = "adsb" | "ogn";
type RadarDrawerState = "closed" | "traffic" | "aircraft" | "ogn";

interface AircraftAnimationJob {
  marker: maplibregl.Marker;
  source: {
    lat: number;
    lon: number;
    observedAt: number | null;
    groundSpeed: number | null;
    track: number | null;
    positionOrigin: string | null;
    positionSource: string | null;
  };
  correctionLon: number;
  correctionLat: number;
  correctionStartedAt: number;
  correctionDurationMs: number;
  sourceReceivedAt: number;
  history: MotionHistory;
}

function sourceObservedPerformanceTime(aircraft: AircraftView, receivedAt: number): number | null {
  const observedAt = positionObservedAt(aircraft);
  return observedAt === null ? null : receivedAt - Math.max(0, Date.now() - observedAt);
}

function predictedMarkerPosition(job: AircraftAnimationJob, timestamp: number): [number, number] {
  const motion = motionAt(job.source, timestamp, { lon: job.correctionLon, lat: job.correctionLat, startedAt: job.correctionStartedAt, durationMs: job.correctionDurationMs }, job.history);
  return [motion.lon, motion.lat];
}

function hasContinuousPrediction(job: AircraftAnimationJob, timestamp: number): boolean {
  const motion = motionAt(job.source, timestamp, { lon: job.correctionLon, lat: job.correctionLat, startedAt: job.correctionStartedAt, durationMs: job.correctionDurationMs }, job.history);
  return motion.predictionActive || motion.correctionActive;
}

const MAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "/fonts/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#07111d" } },
    { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.44, "raster-saturation": -1, "raster-contrast": 0.22, "raster-brightness-min": 0.025, "raster-brightness-max": 0.68, "raster-hue-rotate": 8 } },
  ],
};

function labelForAircraft(aircraft: AircraftView): string {
  return aircraft.callsign || aircraft.registration || aircraft.enrichment?.metadata?.registration || aircraft.icaoHex;
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

function ognTargetLabel(target: OgnTargetView): string {
  if (target.identityVisible) return target.registration || target.competitionNumber || target.model || target.senderCallsign || target.aircraftType.toUpperCase();
  return target.aircraftType.toUpperCase();
}

function ognGlyphPath(aircraftType: OgnTargetView["aircraftType"]): string {
  return aircraftType === "glider" || aircraftType === "paraglider" || aircraftType === "hang_glider"
    ? "M16 3 19 14 29 19 19 20 16 29 13 20 3 19 13 14Z"
    : aircraftType === "helicopter"
      ? "M5 9h22M16 9v5m-7 0h14l3 5H6l3-5Zm7 5v8m-5 0h10"
      : aircraftType === "balloon" || aircraftType === "airship"
        ? "M16 3c5 0 8 4 8 9 0 5-3 8-8 8s-8-3-8-8c0-5 3-9 8-9Zm0 17v6m-4 0h8"
        : "M16 3 19 14 29 19 19 20 16 29 13 20 3 19 13 14Z";
}

function OgnGlyph({ aircraftType }: { aircraftType: OgnTargetView["aircraftType"] }) {
  return <svg className="ogn-glyph" viewBox="0 0 32 32" aria-hidden="true"><path d={ognGlyphPath(aircraftType)} /></svg>;
}

function ognGlyphMarkup(aircraftType: OgnTargetView["aircraftType"]): string {
  return `<svg class="ogn-glyph" viewBox="0 0 32 32" aria-hidden="true"><path d="${ognGlyphPath(aircraftType)}"></path></svg>`;
}

type AircraftMarkerKind = "airplane" | "a220" | "a320" | "a330" | "a350" | "a380" | "b717" | "b727" | "b737" | "b747" | "b757" | "b767" | "b777" | "b787" | "regional" | "turboprop" | "business-jet" | "general-aviation" | "helicopter" | "glider" | "drone" | "ground";

const AIRCRAFT_GLYPH_PATHS: Record<AircraftMarkerKind, string> = {
  // Every silhouette points north at 0°, matching ADS-B track semantics.
  airplane: "m16 2 4 12 8 5-1 2-9-2-2 10-2-10-9 2-1-2 8-5 4-12Z",
  a220: "m16 2 3 12 8 5-1 2-9-2-1 11h-2l-1-11-9 2-1-2 8-5 3-12Z",
  a320: "m16 2 3 12 9 5-1 2-10-2-1 11-2 0-1-11-10 2-1-2 9-5 3-12ZM10 15a1 1 0 1 0 2 0m8 0a1 1 0 1 0 2 0",
  a330: "m16 2 4 11 9 5-1 3-10-2-1 11h-2l-1-11-10 2-1-3 9-5 4-11ZM10 15a1 1 0 1 0 2 0m8 0a1 1 0 1 0 2 0",
  a350: "m16 2 4 11 9 5-1 3-10-2-1 11h-2l-1-11-10 2-1-3 9-5 4-11ZM11 16l-3 1m13-1 3 1M10 15a1 1 0 1 0 2 0m8 0a1 1 0 1 0 2 0",
  a380: "m16 1 5 12 10 5-1 3-11-2-1 12h-2l-1-12-11 2-1-3 10-5 5-12ZM9 15a1 1 0 1 0 2 0m3 0a1 1 0 1 0 2 0m4 0a1 1 0 1 0 2 0m3 0a1 1 0 1 0 2 0M14 6h4",
  b717: "m16 3 2 12 8 4-1 2-9-2-1 9h-1l-1-9-9 2-1-2 8-4 2-12Z",
  b727: "m16 2 3 12 9 5-1 2-10-2-1 11h-2l-1-11-10 2-1-2 9-5 3-12ZM13 24l-3 2m9-2 3 2",
  b737: "m16 2 3 12 9 5-1 2-10-2-1 11h-2l-1-11-10 2-1-2 9-5 3-12ZM11 16l-2 1m12-1 2 1M12 15a1 1 0 1 0 2 0m6 0a1 1 0 1 0 2 0",
  b747: "m16 2 5 11 9 5-1 3-11-2-1 11h-2l-1-11-11 2-1-3 9-5 5-11ZM14 7h4M10 15a1 1 0 1 0 2 0m8 0a1 1 0 1 0 2 0",
  b757: "m16 2 3 12 10 5-1 2-11-2-1 11h-2l-1-11-11 2-1-2 10-5 3-12Z",
  b767: "m16 2 4 11 9 5-1 3-10-2-1 11h-2l-1-11-10 2-1-3 9-5 4-11ZM10 17l-2 1m14-1 2 1",
  b777: "m16 2 4 11 10 5-1 3-11-2-1 11h-2l-1-11-11 2-1-3 10-5 4-11Z",
  b787: "m16 2 4 11 9 5-1 3-10-2-1 11h-2l-1-11-10 2-1-3 9-5 4-11ZM11 17l-3 1m13-1 3 1",
  regional: "m16 3 2 12 8 4-1 2-9-2-1 9h-1l-1-9-9 2-1-2 8-4 2-12Z",
  turboprop: "m16 4 2 11 8 4-1 2-9-2-1 9h-1l-1-9-9 2-1-2 8-4 2-11ZM8 13H4m4 3H4m20-3h4m-4 3h4",
  "business-jet": "m16 2 2 13 8 5-1 2-9-3-1 9h-1l-1-9-9 3-1-2 8-5 2-13Z",
  "general-aviation": "m16 3 1 13 9 4-1 2-10-2-1 8h-1l-1-8-10 2-1-2 9-4 1-13Z",
  helicopter: "M16 8v15M9 12h14M6 8h20M16 5v3M12 23h8l3 4H9l3-4Z",
  glider: "m16 3 3 12 10 5-1 2-10-2-2 9-2-9-10 2-1-2 10-5 3-12Z",
  drone: "M16 8v16M8 16h16M10 10h4v4h-4zM18 10h4v4h-4zM10 18h4v4h-4zM18 18h4v4h-4z",
  ground: "M10 11h12l3 8v5H7v-5l3-8Zm1 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
};

type AircraftIconInput = Pick<AircraftView, "aircraftType" | "aircraftDescription" | "enrichment" | "category" | "onGround">;

function aircraftIconAsset(aircraft: AircraftIconInput): string {
  return classifyAircraftIcon(aircraft).asset ?? TAR1090_UNKNOWN_ICON_ASSET;
}

function aircraftMarkerKind(aircraft: AircraftIconInput): AircraftMarkerKind {
  const canonical = classifyAircraftIcon(aircraft);
  return canonical.presentationKind as AircraftMarkerKind;
}

function AircraftGlyph({ kind = "airplane" }: { kind?: AircraftMarkerKind }) {
  return <svg className={`aircraft-glyph aircraft-glyph-${kind}`} viewBox="0 0 32 32" aria-hidden="true"><path d={AIRCRAFT_GLYPH_PATHS[kind]} /></svg>;
}

function AircraftIcon({ aircraft }: { aircraft: AircraftView }) {
  const asset = aircraftIconAsset(aircraft);
  return asset
    ? <Image className="aircraft-glyph aircraft-glyph-asset" src={asset} alt="" width={21} height={21} draggable={false} unoptimized />
    : <AircraftGlyph kind={aircraftMarkerKind(aircraft)} />;
}

function aircraftGlyphMarkup(aircraft: AircraftView): string {
  const asset = aircraftIconAsset(aircraft);
  if (asset) return `<img class="aircraft-glyph aircraft-glyph-asset" src="${asset}" alt="" draggable="false" />`;
  const kind = aircraftMarkerKind(aircraft);
  return `<svg class="aircraft-glyph aircraft-glyph-${kind}" viewBox="0 0 32 32" aria-hidden="true"><path d="${AIRCRAFT_GLYPH_PATHS[kind]}" /></svg>`;
}

export function AirRadarApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const atsPointFocus = searchParams.get("atsPoint");
  const aircraftFocus = searchParams.get("aircraft")?.trim().toUpperCase() ?? null;
  const [snapshot, setSnapshot] = useState<PublicStateSnapshot>(EMPTY_SNAPSHOT);
  const [ognSnapshot, setOgnSnapshot] = useState<OgnStateSnapshot>(EMPTY_OGN_SNAPSHOT);
  const [ognEnabled, setOgnEnabled] = useState<boolean | null>(null);
  const [showOgn, setShowOgn] = useState(false);
  const ognLoadStartedRef = useRef(false);
  const [intelligenceOpened, setIntelligenceOpened] = useState(false);
  const [logbookOpened, setLogbookOpened] = useState(false);
  const [trafficSource, setTrafficSource] = useState<TrafficSource>("adsb");
  const [selectedOgnId, setSelectedOgnId] = useState<string | null>(null);
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [aircraftDetail, setAircraftDetail] = useState<AircraftQuickDetailResponse | null>(null);
  const [selectedAtcContext, setSelectedAtcContext] = useState<AtcContextResult | null>(null);
  const [selectedHistoryTrail, setSelectedHistoryTrail] = useState<{ icaoHex: string; points: TrailPoint[]; flight: HistoryResponse["flight"] } | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"distance" | "altitude" | "callsign">("distance");
  const [distanceFilter, setDistanceFilter] = useState("all");
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [mapFilters, setMapFilters] = useState<MapAircraftFilters>(DEFAULT_MAP_AIRCRAFT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [watchlist, setWatchlist] = useState<Array<{ kind: string; value: string }>>([]);
  const [watchlistKind, setWatchlistKind] = useState("callsign");
  const [watchlistValue, setWatchlistValue] = useState("");
  const [showAircraft, setShowAircraft] = useState(true);
  const [colorMode, setColorMode] = useState<AircraftColorMode>("default");
  const [showRangeRings, setShowRangeRings] = useState(true);
  const [showAtc, setShowAtc] = useState(false);
  const [showAtcTraffic, setShowAtcTraffic] = useState(false);
  const [sectorTraffic, setSectorTraffic] = useState<Map<string, SectorTrafficView>>(new Map());
  const sectorTrafficRef = useRef<Map<string, SectorTrafficView>>(new Map());
  const [sectorTrafficState, setSectorTrafficState] = useState<"idle" | "loading" | "ready" | "stale" | "unavailable">("idle");
  const [sectorFlowWindow, setSectorFlowWindow] = useState<1 | 5 | 15>(5);
  const [sectorFlows, setSectorFlows] = useState<SectorFlow[]>([]);
  sectorTrafficRef.current = sectorTraffic;
  const atcAutoFitRef = useRef(false);
  const [showSigmet, setShowSigmet] = useState(false);
  const [showWeatherRadar, setShowWeatherRadar] = useState(false);
  const [radarOpacity, setRadarOpacity] = useState(0.65);
  const [radarCatalog, setRadarCatalog] = useState<WeatherRadarCatalogResponse | null>(null);
  const [radarFrameId, setRadarFrameId] = useState<string | null>(null);
  const [radarLatestMode, setRadarLatestMode] = useState(true);
  const [radarPlaying, setRadarPlaying] = useState(false);
  const [radarStatus, setRadarStatus] = useState<"idle" | "loading" | "ready" | "stale" | "unavailable">("idle");
  const [showMetar, setShowMetar] = useState(false);
  const [metarObservations, setMetarObservations] = useState<MetarMapObservation[]>([]);
  const [metarStatus, setMetarStatus] = useState<"idle" | "loading" | "ready" | "stale" | "unavailable">("idle");
  const [showWind, setShowWind] = useState(false);
  const [windLevel, setWindLevel] = useState<WindLevelHpa>(300);
  const [windValidAt, setWindValidAt] = useState<string | null>(null);
  const [windData, setWindData] = useState<WindResponse | null>(null);
  const [windStatus, setWindStatus] = useState<"idle" | "loading" | "ready" | "stale" | "unavailable">("idle");
  const [showAupUup, setShowAupUup] = useState(false);
  const [showAtsRoutes, setShowAtsRoutes] = useState(false);
  const [showSids, setShowSids] = useState(false);
  const [showStars, setShowStars] = useState(false);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [selectedAtsRoute, setSelectedAtsRoute] = useState<string | null>(null);
  const [sigmetEnabled, setSigmetEnabled] = useState<boolean | null>(null);
  const [sigmetData, setSigmetData] = useState<SigmetSnapshot>(EMPTY_SIGMET_DATA);
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
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const centeredTrafficRef = useRef(false);
  const focusedAircraftRef = useRef<string | null>(null);
  const receiverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const aircraftMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const ognMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const animationJobsRef = useRef<Map<string, AircraftAnimationJob>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const animationHiddenAtRef = useRef<number | null>(null);
  const animationSchedulerRef = useRef<(() => void) | null>(null);
  const liveTrailsRef = useRef<Map<string, TrailPoint[]>>(new Map());
  const liveAircraftByHexRef = useRef<Map<string, AircraftView>>(new Map());
  const pendingAircraftChangesRef = useRef<{ full: boolean; changedHexes: Set<string>; removedHexes: Set<string> } | null>(null);
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
  const selectedHexRef = useRef<string | null>(null);
  const receiverRef = useRef<PublicReceiverPosition>(snapshot.receiver);
  const centeredReceiverRef = useRef<ReceiverPosition | null>(null);
  const [mapZoom, setMapZoom] = useState(7.4);
  const [mapReady, setMapReady] = useState(false);
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
  const sigmetGenerationRef = useRef(0);
  const radarGenerationRef = useRef(0);
  const radarFrameGenerationRef = useRef(0);
  const windGenerationRef = useRef(0);
  const networkEnabled = Boolean(snapshot.sources?.adsbLol.enabled);
  const activeCoverage: CoverageMode = preferencesResolved ? coverage : "local";
  const onSelectedAircraftRemoved = useCallback(() => {
    selectedHexRef.current = null;
    setSelectedHex(null);
  }, []);
  const onAircraftSnapshot = useCallback((next: PublicStateSnapshot, change: { full: boolean; changedAircraft: AircraftView[]; removedHexes: string[] }) => {
    const aircraftByHex = liveAircraftByHexRef.current;
    if (change.full) aircraftByHex.clear();
    for (const hex of change.removedHexes) aircraftByHex.delete(hex);
    for (const aircraft of change.changedAircraft) aircraftByHex.set(aircraft.icaoHex, aircraft);
    const pending = pendingAircraftChangesRef.current ?? { full: false, changedHexes: new Set<string>(), removedHexes: new Set<string>() };
    pending.full ||= change.full;
    for (const aircraft of change.changedAircraft) pending.changedHexes.add(aircraft.icaoHex);
    for (const hex of change.removedHexes) pending.removedHexes.add(hex);
    pendingAircraftChangesRef.current = pending;
    setSnapshot(next);
  }, []);
  const { connected: streamConnected } = useAircraftStream({
    enabled: preferencesResolved,
    activeCoverage,
    liveTrailsRef,
    selectedHexRef,
    onSelectedAircraftRemoved,
    onSnapshot: onAircraftSnapshot,
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
  const airspaceDataset = useDatasetQuery<AirspaceActivityResponse>({
    url: "/api/airspace/activity",
    enabled: showAtc || showAupUup,
    cache: "no-store",
    parse: (response) => parseJsonDataset(response, parseAirspaceDataset),
    itemCount: () => 1,
  });
  const airports = useMemo(() => airportsDataset.data ?? [], [airportsDataset.data]);
  const atcData = atcDataset.data ?? EMPTY_ATC_DATA;
  const atsRoutes = atsDataset.data;
  const airspaceActivity = airspaceDataset.data;

  useEffect(() => {
    if (!showAtcTraffic) return;
    let active = true;
    let controller: AbortController | null = null;
    const requestedAt = searchParams.get("at");
    const load = async () => {
      controller?.abort(); controller = new AbortController();
      setSectorTrafficState((value) => value === "ready" ? value : "loading");
      try {
        const query = requestedAt ? `?at=${encodeURIComponent(new Date(requestedAt).toISOString())}` : "";
        const response = await fetch(`/api/atc/sectors/traffic${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("traffic unavailable");
        const payload = await response.json() as { sectors?: SectorTrafficView[] };
        if (!active || !Array.isArray(payload.sectors)) throw new Error("invalid traffic response");
        setSectorTraffic(new Map(payload.sectors.map((item) => [item.sectorId, item])));
        setSectorTrafficState("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (active) setSectorTrafficState((value) => value === "ready" ? "stale" : "unavailable");
      }
    };
    let timer: number | undefined;
    const schedule = () => {
      if (!requestedAt && active) timer = window.setTimeout(async () => { await load(); schedule(); }, 12000);
    };
    void load().then(schedule);
    return () => { active = false; controller?.abort(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [searchParams, showAtcTraffic]);

  useEffect(() => {
    if (!showAtcTraffic) {
      setSectorFlows([]);
      return;
    }
    let active = true; let controller: AbortController | null = null;
    const requestedAt = searchParams.get("at");
    const load = async () => {
      controller?.abort(); controller = new AbortController();
      try { const query = `${requestedAt ? `&at=${encodeURIComponent(new Date(requestedAt).toISOString())}` : ""}`; const response = await fetch(`/api/atc/sectors/transitions?window=${sectorFlowWindow}m${query}`, { cache: "no-store", signal: controller.signal }); if (!response.ok) throw new Error("flows unavailable"); const payload = await response.json() as { transitions?: SectorFlow[] }; if (active) setSectorFlows(Array.isArray(payload.transitions) ? payload.transitions : []); } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError") && active) setSectorFlows([]); }
    };
    let timer: number | undefined;
    const schedule = () => {
      if (!requestedAt && active) timer = window.setTimeout(async () => { await load(); schedule(); }, 15000);
    };
    void load().then(schedule);
    return () => { active = false; controller?.abort(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [searchParams, sectorFlowWindow, showAtcTraffic]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("airradar-watchlist");
      if (stored) setWatchlist(JSON.parse(stored) as Array<{ kind: string; value: string }>);
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
    const generation = ++radarGenerationRef.current;
    if (!showWeatherRadar) { setRadarPlaying(false); return; }
    let active = true;
    const load = async (): Promise<void> => {
      setRadarStatus((current) => current === "ready" || current === "stale" ? current : "loading");
      try {
        const response = await fetch("/api/weather/radar/frames", { cache: "no-store" });
        if (!response.ok) throw new Error("radar catalog unavailable");
        const catalog = await response.json() as WeatherRadarCatalogResponse;
        if (!active || generation !== radarGenerationRef.current) return;
        setRadarCatalog(catalog);
        setRadarStatus(catalog.available && catalog.frames.length ? (catalog.frames.some((frame) => frame.stale) ? "stale" : "ready") : "unavailable");
        setRadarFrameId((current) => radarLatestMode ? catalog.latestFrameId : current && catalog.frames.some((frame) => frame.id === current) ? current : catalog.latestFrameId);
      } catch {
        if (active && generation === radarGenerationRef.current) setRadarStatus("unavailable");
      }
    };
    let timer: number | null = null;
    const schedule = () => { if (active) timer = window.setTimeout(() => { void load().finally(schedule); }, 60_000); };
    void load().finally(schedule);
    return () => { active = false; if (timer !== null) window.clearTimeout(timer); };
  }, [radarLatestMode, showWeatherRadar]);

  useEffect(() => {
    if (!showWeatherRadar || !radarPlaying || !radarCatalog?.frames.length) return;
    let active = true;
    let timer: number | null = null;
    const advance = () => {
      if (!active) return;
      setRadarFrameId((current) => {
        const index = radarCatalog.frames.findIndex((frame) => frame.id === current);
        return radarCatalog.frames[(index < 0 ? 0 : (index + 1) % radarCatalog.frames.length)].id;
      });
      timer = window.setTimeout(advance, 650);
    };
    timer = window.setTimeout(advance, 650);
    return () => { active = false; if (timer !== null) window.clearTimeout(timer); };
  }, [radarCatalog, radarPlaying, showWeatherRadar]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("weather-radar-image") as ImageSource | undefined;
    const frame = radarCatalog?.frames.find((candidate) => candidate.id === radarFrameId);
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
  }, [mapReady, radarCatalog, radarFrameId, radarOpacity, showWeatherRadar]);

  useEffect(() => {
    if (!showMetar) return;
    let active = true;
    let controller: AbortController | null = null;
    const load = async (): Promise<void> => {
      controller?.abort();
      controller = new AbortController();
      setMetarStatus("loading");
      try {
        const response = await fetch("/api/weather/metar-map", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("METAR map unavailable");
        const data = await response.json() as { observations?: MetarMapObservation[]; stale?: boolean };
        if (!active || !Array.isArray(data.observations)) return;
        setMetarObservations(data.observations);
        setMetarStatus(data.stale || data.observations.some((item) => item.stale) ? "stale" : "ready");
      } catch { if (active && !controller.signal.aborted) setMetarStatus("unavailable"); }
    };
    let timer: number | null = null;
    const schedule = () => { if (active) timer = window.setTimeout(() => { void load().finally(schedule); }, 5 * 60_000); };
    void load().finally(schedule);
    return () => { active = false; controller?.abort(); if (timer !== null) window.clearTimeout(timer); };
  }, [showMetar]);

  useEffect(() => {
    if (!showWind) return;
    const generation = ++windGenerationRef.current;
    const controller = new AbortController();
    setWindStatus("loading");
    const params = new URLSearchParams({ level: String(windLevel) });
    if (windValidAt) params.set("valid", windValidAt);
    fetch(`/api/weather/wind?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("wind unavailable"); return await response.json() as WindResponse; })
      .then((data) => { if (generation !== windGenerationRef.current || controller.signal.aborted) return; setWindData(data); setWindValidAt(data.validAt); setWindStatus(data.stale ? "stale" : "ready"); })
      .catch(() => { if (!controller.signal.aborted && generation === windGenerationRef.current) setWindStatus("unavailable"); });
    return () => controller.abort();
  }, [showWind, windLevel, windValidAt]);

  useEffect(() => {
    try { window.localStorage.setItem("airradar-ogn-layer", String(showOgn)); } catch { /* optional */ }
  }, [showOgn]);

  useEffect(() => { try { window.localStorage.setItem("airradar-weather-radar-layer", String(showWeatherRadar)); } catch { /* optional */ } }, [showWeatherRadar]);
  useEffect(() => { try { window.localStorage.setItem("airradar-weather-radar-opacity", String(radarOpacity)); } catch { /* optional */ } }, [radarOpacity]);
  useEffect(() => { try { window.localStorage.setItem("airradar-metar-layer", String(showMetar)); } catch { /* optional */ } }, [showMetar]);
  useEffect(() => { try { window.localStorage.setItem("airradar-wind-layer", String(showWind)); } catch { /* optional */ } }, [showWind]);
  useEffect(() => { try { window.localStorage.setItem("airradar-wind-level", String(windLevel)); } catch { /* optional */ } }, [windLevel]);
  useEffect(() => { try { window.localStorage.setItem("airradar-aup-uup-layer", String(showAupUup)); } catch { /* optional */ } }, [showAupUup]);

  useEffect(() => {
    const generation = ++sigmetGenerationRef.current;
    if (!showSigmet) {
      setSigmetData(EMPTY_SIGMET_DATA);
      return;
    }
    const controller = new AbortController();
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch("/api/weather/sigmet", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("SIGMET request failed");
        const data = await response.json() as Partial<SigmetSnapshot> & { enabled?: boolean; available?: boolean };
        if (!active || generation !== sigmetGenerationRef.current || controller.signal.aborted) return;
        if (data.enabled === false || data.available === false) {
          setSigmetEnabled(false);
          setShowSigmet(false);
          setSigmetData(EMPTY_SIGMET_DATA);
        } else if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
          setSigmetEnabled(true);
          setSigmetData(data as SigmetSnapshot);
        }
      } catch {
        // A transient client/API failure must not erase the last good layer.
      } finally {
        if (active && generation === sigmetGenerationRef.current && !controller.signal.aborted) timer = setTimeout(() => { void load(); }, 5 * 60_000);
      }
    };
    void load();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [showSigmet]);

  const isWatchlisted = useCallback((aircraft: AircraftView) => watchlist.some((rule) => {
    const value = rule.value.trim().toUpperCase();
    if (!value) return false;
    const type = normalizeAircraftRuleType(rule.kind);
    return type ? matchesAircraftRule(aircraft, { type, value }) : false;
  }), [watchlist]);

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

  function addWatchlistRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = watchlistValue.trim().toUpperCase();
    if (!value || watchlist.some((rule) => rule.kind === watchlistKind && rule.value === value)) return;
    setWatchlist((current) => [...current, { kind: watchlistKind, value }]);
    setWatchlistValue("");
  }

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
    setSelectedOgnId(id);
    setFiltersOpen(false);
    setMobileCompact(false);
    setTrafficOpen(true);
  }, []);

  const closeRadarDrawer = useCallback(() => {
    drawerActionGenerationRef.current += 1;
    setTrafficOpen(false);
    setFiltersOpen(false);
    setSelectedHex(null);
    setSelectedOgnId(null);
    setMobileCompact(true);
  }, []);

  const openTrafficDrawer = useCallback((shortcut?: "search" | "filters") => {
    const actionGeneration = ++drawerActionGenerationRef.current;
    setSelectedHex(null);
    setSelectedOgnId(null);
    setTrafficOpen(true);
    setMobileCompact(false);
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
    setSelectedOgnId(null);
    setFiltersOpen(false);
    setTrafficOpen(true);
    setMobileCompact(false);
  }, []);

  function centerSelectedAircraft(): void {
    const map = mapRef.current;
    const aircraft = snapshot.aircraft.find((item) => item.icaoHex === selectedHex);
    if (!map || !aircraft || aircraft.lat === null || aircraft.lon === null) return;
    map.easeTo({ center: [aircraft.lon, aircraft.lat], padding: { top: 70, bottom: 40, left: 40, right: 40 }, duration: prefersReducedMotion() ? 0 : 350 });
  }

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
      style: MAP_STYLE,
      center: [startingReceiver.lon, startingReceiver.lat],
      zoom: 7.4,
      minZoom: 3,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;
    if (new URLSearchParams(window.location.search).get("mapDiagnostics") === "1") {
      window.__airradarMapForDiagnostics = map;
    }
    const animationJobs = animationJobsRef.current;
    const aircraftMarkers = aircraftMarkersRef.current;
    const ognMarkers = ognMarkersRef.current;
    const liveTrails = liveTrailsRef.current;
    const mapReplays = mapReplayRef.current;

    const runAnimations = (timestamp: number) => {
      animationFrameRef.current = null;
      if (document.hidden) {
        animationHiddenAtRef.current ??= timestamp;
        return;
      }
      if (prefersReducedMotion()) {
        for (const job of animationJobs.values()) job.marker.setLngLat([job.source.lon, job.source.lat]);
        animationJobs.clear();
        return;
      }
      let continueAnimation = false;
      const selectedAnimationHex = selectedHexRef.current;
      const selectedAnimationJob = selectedAnimationHex ? animationJobs.get(selectedAnimationHex) : undefined;
      let selectedAnimationMotion: ReturnType<typeof motionAt> | null = null;
      for (const job of animationJobs.values()) {
        const motion = motionAt(job.source, timestamp, {
          lon: job.correctionLon,
          lat: job.correctionLat,
          startedAt: job.correctionStartedAt,
          durationMs: job.correctionDurationMs,
        }, job.history);
        job.marker.setLngLat([motion.lon, motion.lat]);
        // Position and heading must be rendered from the same frame of the
        // motion model. Updating rotation only from the SSE/React effect made
        // turns appear to snap at packet boundaries.
        if (motion.heading !== null) job.marker.setRotation(motion.heading + AIRCRAFT_ICON_ROTATION_OFFSET_DEG);
        if (job === selectedAnimationJob) selectedAnimationMotion = motion;
        if (timestamp - job.correctionStartedAt >= job.correctionDurationMs) {
          job.correctionLon = 0;
          job.correctionLat = 0;
        }
        if (motion.predictionActive || motion.correctionActive) continueAnimation = true;
      }
      const selectedTrailTailSource = map.getSource("selected-trail-live-tail") as GeoJSONSource | undefined;
      if (selectedTrailTailSource && selectedAnimationHex && selectedAnimationJob) {
        const confirmed = selectedConfirmedTrailRef.current;
        const rendered = selectedAnimationMotion
          ? [selectedAnimationMotion.lon, selectedAnimationMotion.lat] as [number, number]
          : predictedMarkerPosition(selectedAnimationJob, timestamp);
        const last = confirmed.at(-1);
        const coordinates = last && (Math.abs(last.lon - rendered[0]) > 0.000001 || Math.abs(last.lat - rendered[1]) > 0.000001)
          ? [[last.lon, last.lat], rendered]
          : [];
        selectedTrailTailSource.setData(coordinates.length > 1
          ? { type: "Feature", properties: { icaoHex: selectedAnimationHex }, geometry: { type: "LineString", coordinates } }
          : { type: "FeatureCollection", features: [] });
      }
      if (continueAnimation) animationFrameRef.current = window.requestAnimationFrame(runAnimations);
    };
    const ensureAnimationFrame = () => {
      if (document.hidden) return;
      const hiddenAt = animationHiddenAtRef.current;
      if (hiddenAt !== null) animationHiddenAtRef.current = null;
      if (animationJobs.size && [...animationJobs.values()].some((job) => hasContinuousPrediction(job, performance.now())) && animationFrameRef.current === null) {
        animationFrameRef.current = window.requestAnimationFrame(runAnimations);
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        animationHiddenAtRef.current = performance.now();
        if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        return;
      }
      ensureAnimationFrame();
    };
    animationSchedulerRef.current = ensureAnimationFrame;
    document.addEventListener("visibilitychange", onVisibilityChange);

    map.on("load", () => {
      map.addSource("weather-radar-image", { type: "image", url: EMPTY_RADAR_PNG, coordinates: WEATHER_RADAR_COORDINATES });
      map.addLayer({ id: "weather-radar-layer", type: "raster", source: "weather-radar-image", layout: { visibility: "none" }, paint: { "raster-opacity": 0.42, "raster-fade-duration": 0 } });
      map.addSource("range-rings", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "range-rings-line",
        type: "line",
        source: "range-rings",
        paint: { "line-color": "#37d6c0", "line-opacity": 0.24, "line-width": 1, "line-dasharray": [2, 3] },
      });
      map.addSource("ats-routes", { type: "geojson", data: EMPTY_ATS_GEOJSON });
      map.addSource("procedures-sid", { type: "geojson", data: EMPTY_PROCEDURE_GEOJSON });
      map.addLayer({ id: "procedures-sid-line", type: "line", source: "procedures-sid", minzoom: 7.5, layout: { visibility: "none", "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f0b35d", "line-opacity": 0.62, "line-width": ["interpolate", ["linear"], ["zoom"], 7.5, 1.2, 13, 2.2] } });
      map.addSource("procedures-star", { type: "geojson", data: EMPTY_PROCEDURE_GEOJSON });
      map.addLayer({ id: "procedures-star-line", type: "line", source: "procedures-star", minzoom: 7.5, layout: { visibility: "none", "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#b98be8", "line-opacity": 0.62, "line-width": ["interpolate", ["linear"], ["zoom"], 7.5, 1.2, 13, 2.2], "line-dasharray": [2, 1] } });
      map.addLayer({ id: "ats-routes-line", type: "line", source: "ats-routes", minzoom: 5.5, layout: { visibility: "none" }, paint: { "line-color": "#37d6c0", "line-opacity": 0.68, "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 1, 8, 1.7, 13, 2.6] } });
      map.addLayer({ id: "ats-routes-cdr", type: "line", source: "ats-routes", minzoom: 5.5, filter: ["!=", ["get", "availabilityClass"], null], layout: { visibility: "none" }, paint: { "line-color": "#f3b95f", "line-opacity": 0.72, "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 1, 8, 1.8, 13, 2.8], "line-dasharray": [2, 2] } });
      map.addLayer({ id: "ats-routes-selected", type: "line", source: "ats-routes", filter: ["==", ["get", "routeDesignator"], ""], layout: { visibility: "none" }, paint: { "line-color": "#ffe08a", "line-opacity": 1, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2, 8, 3, 13, 4.5] } });
      map.addLayer({ id: "ats-route-context-highlight", type: "line", source: "ats-routes", filter: ["==", ["get", "segmentId"], "__context-none__"], layout: { visibility: "none" }, paint: { "line-color": "#fff0a6", "line-opacity": 1, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 3, 8, 4.5, 13, 7] } });
      map.addSource("ats-route-labels", { type: "geojson", data: EMPTY_ATS_GEOJSON });
      map.addLayer({ id: "ats-route-labels", type: "symbol", source: "ats-route-labels", minzoom: 7.5, layout: { visibility: "none", "symbol-placement": "line", "text-field": ["get", "routeDesignator"], "text-font": ["Open Sans Semibold"], "text-size": 10, "text-padding": 18, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": "#c1d4de", "text-halo-color": "#07111d", "text-halo-width": 1.1 } });
      map.addSource("ats-route-points", { type: "geojson", data: EMPTY_ATS_GEOJSON });
      map.addLayer({ id: "ats-route-points", type: "circle", source: "ats-route-points", minzoom: 8.5, layout: { visibility: "none" }, paint: { "circle-color": ["case", ["==", ["get", "kind"], "NAVAID"], "#d2b56f", "#82a9bd"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 8.5, 2.5, 13, 4], "circle-stroke-color": "#07111d", "circle-stroke-width": 1 } });
      map.addLayer({ id: "ats-route-points-label", type: "symbol", source: "ats-route-points", minzoom: 10, layout: { visibility: "none", "text-field": ["get", "name"], "text-font": ["Open Sans Semibold"], "text-size": 9, "text-offset": [0, 1.1], "text-padding": 5, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": "#a8c2ce", "text-halo-color": "#07111d", "text-halo-width": 1 } });
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
      map.addLayer({ id: "selected-trail-line", type: "line", source: "selected-trail", paint: { "line-color": "#f3b95f", "line-opacity": 0.85, "line-width": 2.5 } });
      map.addSource("selected-trail-live-tail", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "selected-trail-live-tail-line", type: "line", source: "selected-trail-live-tail", paint: { "line-color": "#f3b95f", "line-opacity": 0.85, "line-width": 2.5 } });
      map.addSource(ROUTE_V2_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: ROUTE_V2_COMPLETED_LAYER_ID,
        type: "line",
        source: ROUTE_V2_SOURCE_ID,
        filter: ["==", ["get", "segment"], "completed"],
        paint: { "line-color": "#7ea9bd", "line-opacity": 0.58, "line-width": 1.8, "line-dasharray": [1.5, 2.5] },
      });
      map.addLayer({
        id: ROUTE_V2_REMAINING_LAYER_ID,
        type: "line",
        source: ROUTE_V2_SOURCE_ID,
        filter: ["==", ["get", "segment"], "remaining"],
        paint: { "line-color": "#a7b6c7", "line-opacity": 0.68, "line-width": 2, "line-dasharray": [2, 3] },
      });
      map.addSource("atc-sectors", { type: "geojson", data: createAtcGeoJSON([], false) });
      const plannedFilter: FilterSpecification = ["any", ["==", ["get", "airspacePlanState"], "planned-now"], ["==", ["get", "airspacePlanState"], "upcoming"]];
      map.addLayer({ id: "airspace-plan-fill", type: "fill", source: "atc-sectors", filter: plannedFilter, layout: { visibility: "none" }, paint: { "fill-color": ["match", ["get", "airspacePlanState"], "planned-now", "#f3b95f", "#6caed0"], "fill-opacity": ["match", ["get", "airspacePlanState"], "planned-now", 0.16, 0.07] } });
      map.addLayer({ id: "airspace-plan-line", type: "line", source: "atc-sectors", filter: plannedFilter, layout: { visibility: "none" }, paint: { "line-color": ["match", ["get", "airspacePlanState"], "planned-now", "#ffd27a", "#8bd2ed"], "line-opacity": 0.78, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.2, 8, 2, 13, 3], "line-dasharray": [2, 2] } });
      map.addLayer({ id: "airspace-plan-label", type: "symbol", source: "atc-sectors", minzoom: 6.5, filter: plannedFilter, layout: { visibility: "none", "text-field": ["get", "label"], "text-font": ["Open Sans Semibold"], "text-size": 10, "text-offset": [0, 0.8], "text-padding": 8, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": ["match", ["get", "airspacePlanState"], "planned-now", "#ffe2a6", "#b8e7f7"], "text-halo-color": "#08111d", "text-halo-width": 1.2 } });
      map.addLayer({ id: "atc-sectors-fill", type: "fill", source: "atc-sectors", layout: { visibility: "none" }, paint: { "fill-color": ["match", ["get", "airspacePlanState"], "planned-now", "#f3b95f", "upcoming", "#4fb3d8", "#8068ff"], "fill-opacity": ["match", ["get", "airspaceType"], "FIR", 0.015, "TMA", 0.025, "CTR", 0.035, 0.055] } });
      map.addLayer({ id: "atc-sectors-line", type: "line", source: "atc-sectors", layout: { visibility: "none" }, paint: { "line-color": ["match", ["get", "airspacePlanState"], "planned-now", "#ffd27a", "upcoming", "#79cbe8", "#b899ef"], "line-opacity": ["match", ["get", "airspacePlanState"], "planned-now", 1, "upcoming", 0.78, 0.58], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 8, 1.35, 13, 2.2] } });
      map.addLayer({ id: "atc-sectors-label", type: "symbol", source: "atc-sectors", minzoom: 6.5, layout: { visibility: "none", "text-field": ["get", "label"], "text-font": ["Open Sans Semibold"], "text-size": 10, "text-offset": [0, 0.8], "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": ["match", ["get", "airspacePlanState"], "planned-now", "#ffe2a6", "upcoming", "#a8dcf0", "#d7caff"], "text-halo-color": "#08111d", "text-halo-width": 1.2 } });
      const trafficFilter: FilterSpecification = ["!=", ["get", "trafficLevel"], "NO_DATA"];
      map.addLayer({ id: "atc-sector-traffic-fill", type: "fill", source: "atc-sectors", filter: trafficFilter, layout: { visibility: "none" }, paint: { "fill-color": "#8b7bc7", "fill-opacity": 0.015 } });
      map.addLayer({ id: "atc-sector-traffic-line", type: "line", source: "atc-sectors", filter: trafficFilter, layout: { visibility: "none" }, paint: { "line-color": ["match", ["get", "trafficLevel"], "NONE", "#7b8794", "LOW", "#5ca9c9", "MEDIUM", "#d2b56f", "HIGH", "#d58c63", "VERY_HIGH", "#b86f93", "#596575"], "line-opacity": 0.82, "line-width": 2 } });
      map.addLayer({ id: "atc-sector-traffic-label", type: "symbol", source: "atc-sectors", minzoom: 6.5, filter: trafficFilter, layout: { visibility: "none", "text-field": ["concat", ["get", "name"], " · ", ["to-string", ["get", "trafficAircraftCount"]]], "text-font": ["Open Sans Semibold"], "text-size": 10, "text-padding": 8, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": "#e1edf2", "text-halo-color": "#08111d", "text-halo-width": 1.2 } });
      map.addLayer({ id: "atc-sectors-context-highlight", type: "line", source: "atc-sectors", filter: ["==", ["get", "id"], "__context-none__"], layout: { visibility: "none" }, paint: { "line-color": "#d8b4fe", "line-opacity": 1, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2, 8, 3, 13, 4.5] } });
      map.moveLayer("airspace-plan-fill");
      map.moveLayer("airspace-plan-line");
      map.moveLayer("airspace-plan-label");
      map.addSource("atc-transmitters", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "atc-transmitters-circle", type: "circle", source: "atc-transmitters", layout: { visibility: "none" }, paint: { "circle-color": "#f3b95f", "circle-radius": 5, "circle-stroke-color": "#08111d", "circle-stroke-width": 1.5 } });
      map.addSource("metar-airports", { type: "geojson", data: createMetarGeoJSON([]) });
      map.addLayer({ id: "metar-symbols", type: "circle", source: "metar-airports", layout: { visibility: "none" }, paint: { "circle-color": ["match", ["get", "flightCategory"], "VFR", "#42d392", "MVFR", "#f4c95d", "IFR", "#ef8f6b", "LIFR", "#dd6b93", "#9da9b5"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 3, 8, 5, 13, 7], "circle-opacity": ["case", ["get", "stale"], 0.38, 0.9], "circle-stroke-color": "#08111d", "circle-stroke-width": 1.2 } });
      map.addLayer({ id: "metar-labels", type: "symbol", source: "metar-airports", minzoom: 8.5, layout: { visibility: "none", "text-field": ["concat", ["get", "stationId"], ["case", ["get", "stale"], " · STALE", ""]], "text-font": ["Open Sans Semibold"], "text-size": 10, "text-offset": [0, 1.25], "text-padding": 6, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": "#dce9ee", "text-opacity": ["case", ["get", "stale"], 0.45, 0.9], "text-halo-color": "#08111d", "text-halo-width": 1 } });
      map.addSource("wind-aloft", { type: "geojson", data: createWindGeoJSON(null) });
      map.addLayer({ id: "wind-aloft-arrows", type: "symbol", source: "wind-aloft", minzoom: 5.5, layout: { visibility: "none", "text-field": ["case", ["has", "speedKt"], ["concat", "↑ ", ["to-string", ["round", ["get", "speedKt"]]], " kt"], "↑"], "text-font": ["Open Sans Semibold"], "text-size": ["interpolate", ["linear"], ["zoom"], 5.5, 10, 10, 14], "text-rotate": ["coalesce", ["get", "directionDeg"], 0], "text-rotation-alignment": "map", "text-allow-overlap": false }, paint: { "text-color": "#9bd4ff", "text-halo-color": "#08111d", "text-halo-width": 1.1 } });
      map.addSource("route-airports", { type: "geojson", data: createAirportGeoJSON([]) });
      map.addLayer({ id: "route-airports-circle", type: "circle", source: "route-airports", paint: { "circle-color": "#d2b56f", "circle-opacity": 0.72, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3, 12, 4.5], "circle-stroke-color": "#08111d", "circle-stroke-width": 1.2 } });
      map.addLayer({ id: "route-airports-label", type: "symbol", source: "route-airports", layout: { "text-field": ["get", "code"], "text-font": ["Open Sans Semibold"], "text-size": ["interpolate", ["linear"], ["zoom"], 5, 8, 10, 9, 13, 10], "text-offset": [0, 1.1], "text-padding": 7, "text-allow-overlap": false, "text-ignore-placement": false, "text-optional": true }, paint: { "text-color": "#cfbd8b", "text-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.52, 10, 0.72, 13, 0.82], "text-halo-color": "#08111d", "text-halo-width": 0.7 } });
      map.addSource("aviation-sigmet", { type: "geojson", data: EMPTY_SIGMET_DATA as unknown as FeatureCollection });
      map.addLayer({ id: "aviation-sigmet-fill", type: "fill", source: "aviation-sigmet", layout: { visibility: "none" }, paint: { "fill-color": "#ef8f6b", "fill-opacity": 0.045 } });
      map.addLayer({ id: "aviation-sigmet-line", type: "line", source: "aviation-sigmet", layout: { visibility: "none" }, paint: { "line-color": "#ef8f6b", "line-opacity": 0.72, "line-width": 1.4, "line-dasharray": [2, 2] } });
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
      map.addLayer({ id: ROUTE_V2_AIRPORT_CIRCLE_LAYER_ID, type: "circle", source: ROUTE_V2_AIRPORT_SOURCE_ID, paint: { "circle-color": "#37d6c0", "circle-opacity": 0.92, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4.5, 12, 6], "circle-stroke-color": "#08111d", "circle-stroke-width": 1.8 } });
      map.addLayer({ id: ROUTE_V2_AIRPORT_LABEL_LAYER_ID, type: "symbol", source: ROUTE_V2_AIRPORT_SOURCE_ID, layout: { "text-field": ["get", "code"], "text-font": ["Open Sans Semibold"], "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9, 10, 10, 13, 11], "text-offset": [0, 1.25], "text-padding": 6, "text-allow-overlap": false, "text-ignore-placement": false, "text-optional": true }, paint: { "text-color": "#72e5d3", "text-opacity": 0.9, "text-halo-color": "#08111d", "text-halo-width": 1 } });
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
      map.on("zoomend", () => setMapZoom(map.getZoom()));
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
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      animationHiddenAtRef.current = null;
      animationSchedulerRef.current = null;
      animationJobs.clear();
      receiverMarkerRef.current?.remove();
      receiverMarkerRef.current = null;
      for (const marker of aircraftMarkers.values()) marker.remove();
      aircraftMarkers.clear();
      for (const marker of ognMarkers.values()) marker.remove();
      ognMarkers.clear();
      liveTrails.clear();
      map.remove();
      if (window.__airradarMapForDiagnostics === map) delete window.__airradarMapForDiagnostics;
      mapRef.current = null;
      setMapReady(false);
    };
  }, [router, selectAircraft, selectOgn]);

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

    for (const target of ognSnapshot.targets) {
      if (!Number.isFinite(target.latitude) || !Number.isFinite(target.longitude)) continue;
      currentIds.add(target.id);
      let marker = ognMarkers.get(target.id);
      if (!marker) {
        const root = document.createElement("div");
        root.className = "ogn-marker";
        root.setAttribute("role", "button");
        root.setAttribute("tabindex", "0");
        const icon = document.createElement("div");
        icon.className = "ogn-marker-icon";
        root.appendChild(icon);
        const label = document.createElement("div");
        label.className = "ogn-marker-label";
        root.appendChild(label);
        root.addEventListener("click", () => selectOgn(target.id));
        root.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectOgn(target.id);
          }
        });
        marker = new maplibregl.Marker({ element: root, anchor: "center" })
          .setLngLat([target.longitude, target.latitude])
          .addTo(map);
        ognMarkers.set(target.id, marker);
      } else {
        marker.setLngLat([target.longitude, target.latitude]);
      }
      const root = marker.getElement();
      root.setAttribute("aria-label", ognTargetLabel(target));
      root.setAttribute("aria-pressed", String(target.id === selectedOgnId));
      root.classList.toggle("selected", target.id === selectedOgnId);
      root.classList.toggle("stale", target.stale);
      root.style.visibility = visible ? "visible" : "hidden";
      const icon = root.querySelector<HTMLElement>(".ogn-marker-icon");
      if (icon && icon.dataset.aircraftType !== target.aircraftType) {
        icon.dataset.aircraftType = target.aircraftType;
        icon.innerHTML = ognGlyphMarkup(target.aircraftType);
      }
      const label = root.querySelector<HTMLElement>(".ogn-marker-label");
      if (label) label.textContent = ognTargetLabel(target);
    }

    for (const [id, marker] of ognMarkers) {
      if (currentIds.has(id)) continue;
      marker.remove();
      ognMarkers.delete(id);
    }
  }, [mapReady, ognEnabled, ognSnapshot.targets, selectOgn, selectedOgnId, showOgn]);

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
      const searchable = [aircraft.callsign, aircraft.registration, aircraft.enrichment?.metadata?.registration, aircraft.icaoHex].filter(Boolean).join(" ").toUpperCase();
      if (query && !searchable.includes(query)) return false;
      if (distanceFilter !== "all" && (aircraft.distanceKm === null || aircraft.distanceKm > Number(distanceFilter))) return false;
      if (watchlistOnly && !isWatchlisted(aircraft)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sortBy === "callsign") return labelForAircraft(a).localeCompare(labelForAircraft(b));
      if (sortBy === "altitude") return (b.altitude ?? -Infinity) - (a.altitude ?? -Infinity);
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    });
  }, [distanceFilter, isWatchlisted, mapFilteredAircraft, search, sortBy, watchlistOnly]);
  const filteredAircraftByHex = useMemo(
    () => new Map(filteredAircraft.map((aircraft) => [aircraft.icaoHex, aircraft] as const)),
    [filteredAircraft],
  );
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const mobile = window.matchMedia("(max-width: 820px)").matches;
    const panelHeight = mobile ? document.querySelector(".sidebar")?.getBoundingClientRect().height ?? 0 : 0;
    if (!centeredTrafficRef.current && (snapshot.receiver.lat === null || snapshot.receiver.lon === null) && snapshot.aircraft.length) {
      const positioned = snapshot.aircraft.filter((aircraft) => aircraft.lat !== null && aircraft.lon !== null
        && Number.isFinite(aircraft.lat) && Number.isFinite(aircraft.lon));
      if (positioned.length) {
        const bounds = new maplibregl.LngLatBounds();
        for (const aircraft of positioned) bounds.extend([aircraft.lon!, aircraft.lat!]);
        map.fitBounds(bounds, { padding: { top: 100, bottom: panelHeight + 40, left: 45, right: 45 }, maxZoom: 8, duration: 0 });
        centeredTrafficRef.current = true;
      }
    }
    if (selectedHex !== focusedAircraftRef.current) {
      const aircraft = snapshot.aircraft.find((item) => item.icaoHex === selectedHex);
      if (!selectedHex) focusedAircraftRef.current = null;
      else if (aircraft?.lat != null && aircraft.lon != null) {
        // Keep the selected aircraft in the visible map above the mobile panel.
        const expandedHeight = mobile ? Math.min(window.innerHeight * 0.46, 440) : 0;
        map.easeTo({ center: [aircraft.lon, aircraft.lat], padding: { top: 70, bottom: expandedHeight + 20, left: 40, right: 40 }, duration: prefersReducedMotion() ? 0 : 350 });
        focusedAircraftRef.current = selectedHex;
      }
    }
    const animationJobs = animationJobsRef.current;
    const pending = pendingAircraftChangesRef.current;
    pendingAircraftChangesRef.current = null;
    const fullMarkerUpdate = pending === null || pending.full;
    const currentHexes = fullMarkerUpdate ? new Set(filteredAircraft.map((aircraft) => aircraft.icaoHex)) : null;
    const aircraftToUpdate = fullMarkerUpdate
      ? filteredAircraft
      : [...(pending?.changedHexes ?? [])]
        .map((hex) => liveAircraftByHexRef.current.get(hex))
        .filter((aircraft): aircraft is AircraftView => Boolean(aircraft && filteredAircraftByHex.has(aircraft.icaoHex)));
    const upsertPrediction = (aircraft: AircraftView, marker: maplibregl.Marker) => {
      const now = performance.now();
      const target: [number, number] = [aircraft.lon!, aircraft.lat!];
      const source: AircraftAnimationJob["source"] = {
        lat: aircraft.lat!,
        lon: aircraft.lon!,
        observedAt: sourceObservedPerformanceTime(aircraft, now),
        groundSpeed: aircraft.groundSpeed,
        track: aircraft.track,
        positionOrigin: aircraft.provenance?.positionOrigin ?? null,
        positionSource: aircraft.provenance?.positionSource ?? null,
      };
      const previous = animationJobs.get(aircraft.icaoHex);

      if (prefersReducedMotion()) {
        marker.setLngLat(target);
        animationJobs.delete(aircraft.icaoHex);
        return;
      }

      if (document.hidden) {
        marker.setLngLat(target);
        animationJobs.set(aircraft.icaoHex, {
          marker,
          source,
          correctionLon: 0,
          correctionLat: 0,
          correctionStartedAt: now,
          correctionDurationMs: MIN_AIRCRAFT_ANIMATION_MS,
          sourceReceivedAt: now,
          history: updateMotionHistory(createMotionHistory(), source),
        });
        return;
      }

      if (previous) {
        const current = marker.getLngLat();
        const sourceChanged = previous.source.positionOrigin !== source.positionOrigin || previous.source.positionSource !== source.positionSource;
        const delayedPosition = !sourceChanged
          && previous.source.observedAt !== null
          && source.observedAt !== null
          && source.observedAt < previous.source.observedAt;
        if (delayedPosition) return;
        // Without a current track and groundspeed there is no safe way to
        // extrapolate or animate a correction. Interpolating such a packet
        // from the previous predicted position makes the aircraft visibly
        // move backwards, especially for readsb position-only updates.
        if (!hasRenderableAircraftMotion(source)) {
          previous.history = updateMotionHistory(previous.history, source);
          previous.source = source;
          previous.sourceReceivedAt = now;
          previous.correctionLon = 0;
          previous.correctionLat = 0;
          previous.correctionStartedAt = now;
          previous.correctionDurationMs = MIN_AIRCRAFT_ANIMATION_MS;
          marker.setLngLat(target);
          const heading = motionAt(source, now, undefined, previous.history).heading;
          if (heading !== null) marker.setRotation(heading + AIRCRAFT_ICON_ROTATION_OFFSET_DEG);
          return;
        }
        if (sourceChanged) {
          const nextHistory = updateMotionHistory(previous.history, source);
          const correctionDurationMs = Math.min(
            MAX_AIRCRAFT_ANIMATION_MS,
            Math.max(MIN_AIRCRAFT_ANIMATION_MS, now - previous.sourceReceivedAt),
          );
          const correction = correctionFor({ lon: current.lng, lat: current.lat }, source, now, correctionDurationMs, nextHistory);
          previous.history = nextHistory;
          previous.source = source;
          previous.correctionLon = correction?.lon ?? 0;
          previous.correctionLat = correction?.lat ?? 0;
          previous.correctionStartedAt = now;
          previous.correctionDurationMs = correctionDurationMs;
          previous.sourceReceivedAt = now;
          if (!correction) marker.setLngLat(predictedPosition(source, now, nextHistory));
          animationSchedulerRef.current?.();
          return;
        }
        previous.history = updateMotionHistory(previous.history, source);
        const [predictedLon, predictedLat] = predictedPosition(source, now, previous.history);
        const correctionDistance = haversineDistanceKm(current.lat, current.lng, predictedLat, predictedLon);
        const correctionDurationMs = Math.min(
          MAX_AIRCRAFT_ANIMATION_MS,
          Math.max(MIN_AIRCRAFT_ANIMATION_MS, now - previous.sourceReceivedAt),
        );
        previous.source = source;
        previous.sourceReceivedAt = now;
        previous.correctionStartedAt = now;
        previous.correctionDurationMs = correctionDurationMs;
        if (correctionDistance <= MAX_PREDICTION_CORRECTION_KM) {
          previous.correctionLon = shortestLongitudeDelta(current.lng, predictedLon);
          previous.correctionLat = current.lat - predictedLat;
        } else {
          // A large discrepancy usually means a stale/changed source position,
          // not a correction that should be animated across the map.
          marker.setLngLat(predictedPosition(source, now, previous.history));
          previous.correctionLon = 0;
          previous.correctionLat = 0;
        }
      } else {
        const initialPosition = predictedPosition(source, now);
        marker.setLngLat(initialPosition);
        animationJobs.set(aircraft.icaoHex, {
          marker,
          source,
          correctionLon: 0,
          correctionLat: 0,
          correctionStartedAt: now,
          correctionDurationMs: MIN_AIRCRAFT_ANIMATION_MS,
          sourceReceivedAt: now,
          history: updateMotionHistory(createMotionHistory(), source),
        });
      }
      animationSchedulerRef.current?.();
    };

    const selectedAircraftInSnapshot = selectedHex ? liveAircraftByHexRef.current.get(selectedHex) ?? snapshot.aircraft.find((aircraft) => aircraft.icaoHex === selectedHex) : undefined;
    const selectedAircraftVisible = Boolean(selectedAircraftInSnapshot && selectedHex && filteredAircraftByHex.has(selectedHex));
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
      let marker = aircraftMarkersRef.current.get(aircraft.icaoHex);
      const target: [number, number] = [aircraft.lon, aircraft.lat];
      if (!marker) {
        const root = document.createElement("div");
        root.className = aircraftMarkerClassNames({ selected: false, watchlisted: false, emergency: false, source: classifyAircraftSource(aircraft) }).join(" ");
        root.setAttribute("role", "button");
        root.setAttribute("tabindex", "0");
        root.setAttribute("aria-label", labelForAircraft(aircraft));
        const plane = document.createElement("div");
        plane.className = "aircraft-plane";
        const markerKind = aircraftMarkerKind(aircraft);
        plane.dataset.kind = markerKind;
        const iconAsset = aircraftIconAsset(aircraft);
        plane.dataset.iconAsset = iconAsset ?? "fallback";
        plane.innerHTML = aircraftGlyphMarkup(aircraft);
        root.appendChild(plane);
        const label = document.createElement("div");
        label.className = "aircraft-label";
        label.setAttribute("aria-hidden", "true");
        root.appendChild(label);
        root.addEventListener("click", () => selectAircraft(aircraft.icaoHex));
        root.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectAircraft(aircraft.icaoHex);
          }
        });
        marker = new maplibregl.Marker({ element: root, anchor: "center", rotationAlignment: "map" })
          .setLngLat(target)
          .addTo(map);
        aircraftMarkersRef.current.set(aircraft.icaoHex, marker);
      }
      // Pass a shallow copy because React's immutability lint treats snapshot
      // values as render-owned when they cross the animation helper boundary.
      upsertPrediction({ ...aircraft }, marker);
      const root = marker.getElement();
      const aircraftLabel = labelForAircraft(aircraft);
      if (root.getAttribute("aria-label") !== aircraftLabel) root.setAttribute("aria-label", aircraftLabel);
      const selectedState = aircraft.icaoHex === selectedHex;
      const ariaPressed = String(selectedState);
      if (root.getAttribute("aria-pressed") !== ariaPressed) root.setAttribute("aria-pressed", ariaPressed);
      root.classList.toggle("selected", selectedState);
      root.classList.toggle("watchlisted", isWatchlisted(aircraft));
      root.classList.toggle("emergency", Boolean(aircraft.emergency));
      const sourceClass = classifyAircraftSource(aircraft);
      root.classList.toggle("network-only", sourceClass === "NETWORK_ONLY");
      root.classList.toggle("source-overlap", sourceClass === "OVERLAP");
      const markerVisibility = showAircraft ? "visible" : "hidden";
      if (root.style.visibility !== markerVisibility) root.style.visibility = markerVisibility;
      const plane = root.querySelector<HTMLElement>(".aircraft-plane");
      if (plane) {
        const markerKind = aircraftMarkerKind(aircraft);
        const iconAsset = aircraftIconAsset(aircraft);
        if (plane.dataset.kind !== markerKind || plane.dataset.iconAsset !== (iconAsset ?? "fallback")) {
          plane.dataset.kind = markerKind;
          plane.dataset.iconAsset = iconAsset ?? "fallback";
          plane.innerHTML = aircraftGlyphMarkup(aircraft);
        }
        const color = aircraftColor(aircraft, colorMode);
        if (color) plane.style.setProperty("--aircraft-color", color);
        else plane.style.removeProperty("--aircraft-color");
      }
      const label = root.querySelector<HTMLElement>(".aircraft-label");
      if (label) {
        const labelText = aircraftMapLabel(aircraft, mapZoom, formatAltitude(aircraft.altitude));
        const nextLabelText = labelText ?? "";
        if (label.textContent !== nextLabelText) label.textContent = nextLabelText;
        const labelHidden = labelText === null;
        if (label.hidden !== labelHidden) label.hidden = labelHidden;
      }
      // readsb's track is clockwise from geographic north. Let MapLibre apply
      // it in map coordinates, so it remains correct when the user rotates map.
      const motionJob = animationJobs.get(aircraft.icaoHex);
      const renderedMotion = motionJob ? motionAt(motionJob.source, performance.now(), {
        lon: motionJob.correctionLon, lat: motionJob.correctionLat,
        startedAt: motionJob.correctionStartedAt, durationMs: motionJob.correctionDurationMs,
      }, motionJob.history) : null;
      const renderedHeading = renderedMotion?.heading ?? normalizeHeading(aircraft.track);
      if (renderedHeading !== null) marker.setRotation(renderedHeading + AIRCRAFT_ICON_ROTATION_OFFSET_DEG);
    }

    const markerRemovalCandidates = fullMarkerUpdate
      ? [...aircraftMarkersRef.current.keys()]
      : [...new Set([
        ...(pending?.removedHexes ?? []),
        ...[...(pending?.changedHexes ?? [])].filter((hex) => {
          const aircraft = filteredAircraftByHex.get(hex);
          return !aircraft || aircraft.lat === null || aircraft.lon === null || !Number.isFinite(aircraft.lat) || !Number.isFinite(aircraft.lon);
        }),
      ])];
    for (const hex of markerRemovalCandidates) {
      const marker = aircraftMarkersRef.current.get(hex);
      if (!marker || (fullMarkerUpdate && currentHexes?.has(hex))) continue;
      if (hex === selectedHex && selectedAircraftVisible && selectedTrailForMap.length > 0) {
        const lastKnown = selectedTrailForMap[selectedTrailForMap.length - 1];
        marker.setLngLat([lastKnown.lon, lastKnown.lat]);
        marker.getElement().style.visibility = showAircraft ? "visible" : "hidden";
        continue;
      }
      animationJobsRef.current.delete(hex);
      marker.remove();
      aircraftMarkersRef.current.delete(hex);
    }

    const selected = selectedAircraftVisible ? selectedAircraftInSnapshot : undefined;
    const trailSource = map.getSource("selected-trail") as GeoJSONSource | undefined;
    if (trailSource && selectedTrailSourceRef.current !== selectedTrailForMap) {
      trailSource.setData(selectedAircraftVisible && selectedTrailForMap.length > 1
        ? { type: "Feature", properties: { icaoHex: selectedHex }, geometry: { type: "LineString", coordinates: selectedTrailForMap.map((point) => [point.lon, point.lat]) } }
        : { type: "FeatureCollection", features: [] });
      selectedTrailSourceRef.current = selectedTrailForMap;
    }
    for (const layer of ["selected-trail-line", "selected-trail-live-tail-line", ROUTE_V2_COMPLETED_LAYER_ID, ROUTE_V2_REMAINING_LAYER_ID] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", selectedAircraftVisible ? "visible" : "none");
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
      routeAirportSource.setData(selectedAircraftVisible ? createRouteAirportGeoJSON(selected?.enrichment?.route) : createRouteAirportGeoJSON(null));
      routeAirportSourceKeyRef.current = routeAirportSourceKey;
    }
  }, [colorMode, filteredAircraft, filteredAircraftByHex, isWatchlisted, mapZoom, selectedHistoryTrail, selectedRouteAirportCodesKey, showAircraft, showAirports, snapshot.aircraft, snapshot.receiver.lat, snapshot.receiver.lon, selectedHex, mapReady, selectAircraft]);

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
        map.fitBounds(bounds, { padding: 48, maxZoom: 7.5, duration: 500 });
      }
    }
    if (!showAtc) atcAutoFitRef.current = false;
  }, [airspaceActivity, atcData, mapReady, sectorTraffic, showAtc, showAtcTraffic, showAupUup]);

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
  const selectedOgnTarget = ognSnapshot.targets.find((target) => target.id === selectedOgnId) ?? null;
  const selectedIdentity = selectedAircraft?.icaoHex ?? selectedDatabaseAircraft?.icaoHex ?? selectedHex;
  const contextAircraftHex = selectedAircraftSnapshot?.icaoHex ?? null;
  const contextHasPosition = selectedAircraftSnapshot?.lat !== null && selectedAircraftSnapshot?.lon !== null;

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

  const selectedAircraftVisible = Boolean(selectedAircraft && filteredAircraft.some((aircraft) => aircraft.icaoHex === selectedAircraft.icaoHex));

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
  const quickFilterLabels: Record<AircraftQuickFilter, string> = {
    all: t.filters.quickAll,
    airborne: t.filters.quickAirborne,
    onGround: t.filters.quickOnGround,
    helicopters: t.filters.quickHelicopters,
    gliders: t.filters.quickGliders,
    uav: t.filters.quickUav,
    emergency: t.filters.quickEmergency,
  };
  const activeFilterChips: Array<{ id: string; label: string; onRemove: () => void }> = [
    mapFilters.source !== "all" ? { id: "source", label: mapFilters.source.toUpperCase(), onRemove: () => updateMapFilter("source", "all") } : null,
    mapFilters.quick !== "all" ? { id: "quick", label: quickFilterLabels[mapFilters.quick], onRemove: () => updateMapFilter("quick", "all") } : null,
    mapFilters.status !== "all" ? { id: "status", label: mapFilters.status === "airborne" ? t.filters.statusAirborne : t.filters.statusOnGround, onRemove: () => updateMapFilter("status", "all") } : null,
    mapFilters.minAltitude.trim() ? { id: "min-altitude", label: `≥ ${mapFilters.minAltitude} ft`, onRemove: () => updateMapFilter("minAltitude", "") } : null,
    mapFilters.maxAltitude.trim() ? { id: "max-altitude", label: `≤ ${mapFilters.maxAltitude} ft`, onRemove: () => updateMapFilter("maxAltitude", "") } : null,
    mapFilters.callsign.trim() ? { id: "callsign", label: `${t.filters.callsign}: ${mapFilters.callsign.trim()}`, onRemove: () => updateMapFilter("callsign", "") } : null,
    mapFilters.registration.trim() ? { id: "registration", label: `${t.filters.registrationInput}: ${mapFilters.registration.trim()}`, onRemove: () => updateMapFilter("registration", "") } : null,
    mapFilters.icaoHex.trim() ? { id: "icao", label: `${t.filters.icaoHexInput}: ${mapFilters.icaoHex.trim()}`, onRemove: () => updateMapFilter("icaoHex", "") } : null,
    mapFilters.aircraftType.trim() ? { id: "type", label: mapFilters.aircraftType.trim(), onRemove: () => updateMapFilter("aircraftType", "") } : null,
    mapFilters.operator.trim() ? { id: "operator", label: mapFilters.operator.trim(), onRemove: () => updateMapFilter("operator", "") } : null,
    mapFilters.emergencyOnly ? { id: "emergency", label: t.filters.emergencyOnly, onRemove: () => updateMapFilter("emergencyOnly", false) } : null,
    watchlistOnly ? { id: "watchlist", label: t.filters.watchlistOnly, onRemove: () => setWatchlistOnly(false) } : null,
    search.trim() ? { id: "search", label: `${t.search.aircraftLabel}: ${search.trim()}`, onRemove: () => setSearch("") } : null,
    distanceFilter !== "all" ? { id: "distance", label: `${t.filters.maximumDistance}: ${distanceFilter} km`, onRemove: () => setDistanceFilter("all") } : null,
  ].filter((value): value is { id: string; label: string; onRemove: () => void } => Boolean(value));

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
    if (drawerState === "closed" && previousDrawerStateRef.current !== "closed") {
      const trigger = trafficTriggerRef.current;
      if (trigger?.getClientRects().length && !trigger.disabled) trigger.focus();
    }
    previousDrawerStateRef.current = drawerState;
  }, [drawerState]);
  useEffect(() => {
    if (drawerState !== "traffic" || !focusSearchOnTrafficOpenRef.current) return;
    const focusSearch = window.setTimeout(() => {
      if (drawerState === "traffic" && searchInputRef.current) {
        searchInputRef.current.focus();
        focusSearchOnTrafficOpenRef.current = false;
      }
    }, 0);
    return () => window.clearTimeout(focusSearch);
  }, [drawerState]);
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      const element = target instanceof HTMLElement ? target : null;
      if (!element) return false;
      return element instanceof HTMLInputElement
        || element instanceof HTMLTextAreaElement
        || element instanceof HTMLSelectElement
        || element.isContentEditable;
    }

    function handleKeyboardShortcut(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (event.key === "Escape") {
        if (filtersOpen) {
          setFiltersOpen(false);
          event.preventDefault();
        } else if (drawerState !== "closed") {
          closeRadarDrawer();
          event.preventDefault();
        }
        return;
      }
      if (isEditableTarget(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        if (window.matchMedia("(min-width: 821px)").matches && drawerState !== "traffic") {
          openTrafficDrawer("search");
        } else {
          searchInputRef.current?.focus();
        }
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (window.matchMedia("(min-width: 821px)").matches && drawerState !== "traffic") {
          openTrafficDrawer("filters");
        } else if (trafficSource === "adsb") {
          setFiltersOpen((current) => !current);
        }
      }
    }

    // Handle Escape before document-level details/popup handlers can consume it.
    window.addEventListener("keydown", handleKeyboardShortcut, true);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut, true);
  }, [closeRadarDrawer, drawerState, filtersOpen, openTrafficDrawer, trafficSource]);
  const networkStatus = snapshot.sources?.adsbLol.status;
  const networkNotice = activeCoverage === "extended" && networkStatus === "rate_limited"
    ? t.radar.networkRateLimited
    : activeCoverage === "extended" && networkStatus && ["timeout", "http_error", "invalid_response", "stale"].includes(networkStatus)
      ? t.radar.networkUnavailable
      : null;
  const selectedRadarFrame = radarCatalog?.frames.find((frame) => frame.id === radarFrameId) ?? null;

  function chooseCoverage(nextCoverage: CoverageMode): void {
    if (!networkEnabled && nextCoverage === "extended") return;
    setCoverage(nextCoverage);
  }

  return (
    <main className="radar-shell">
      <AirRadarTopbar heading meta={
        <>
          <span className="topbar-receiver"><span className="topbar-receiver-label">{t.status.receiverLabel}</span><span className="topbar-receiver-name">{snapshot.receiver.name}</span></span>
          <StatusBadge variant={receiverStatusVariant} title={receiverStatusLabel} aria-label={receiverStatusLabel}>{receiverStatusShort}</StatusBadge>
          <details className="topbar-secondary-status">
            <summary>{t.status.secondaryStatus}</summary>
            <div>
              <span>{snapshot.receiver.lat === null || snapshot.receiver.lon === null ? t.common.unavailable : `${snapshot.receiver.lat.toFixed(4)}, ${snapshot.receiver.lon.toFixed(4)}`}</span>
              {serverAlertsEnabled !== null && <span>{serverAlertsEnabled ? t.status.serverAlertsActive : t.status.serverAlertsDisabled}</span>}
            </div>
          </details>
        </>
      } />

      <section className="radar-content">
        <div className="map-panel">
          <div ref={mapContainerRef} className="map-container" />
          <div className="map-overlay">
            {showAtcTraffic && <><AtcVerticalTraffic traffic={sectorTraffic} /><SectorFlowsPanel flows={sectorFlows} windowMinutes={sectorFlowWindow} onWindowChange={setSectorFlowWindow} /></>}
            <div className="map-overlay-primary">
              <Panel className="map-overlay-card map-summary-card">
                <div className="map-summary-item map-summary-count"><strong>{formatNumber(displayedAircraftCount)}</strong><span>{t.stats.trackingNow}</span></div>
                {activeCoverage === "extended" && snapshot.sourceStats && <div className="source-counter-strip" aria-label="Aircraft source counters">
                  <span><strong>{formatNumber(snapshot.sourceStats.local)}</strong><small>LOCAL</small></span>
                  <span><strong>{formatNumber(snapshot.sourceStats.network)}</strong><small>NETWORK</small></span>
                  <span><strong>{formatNumber(snapshot.sourceStats.overlap)}</strong><small>OVERLAP</small></span>
                  <span><strong>{formatNumber(snapshot.sourceStats.total)}</strong><small>TOTAL</small></span>
                </div>}
                {hasActiveMapFilters && <div className="map-summary-filter-state" aria-label={`${t.filters.active}: ${activeFilterCount}`}>
                  <span>{t.filters.title}</span><strong>{activeFilterCount}</strong>
                </div>}
              </Panel>
              <MapControlGroup className="map-control-group-primary">
              <button ref={trafficTriggerRef} type="button" className={`traffic-trigger map-control ${drawerState !== "closed" ? "active" : ""}`} aria-expanded={drawerState !== "closed"} aria-controls="radar-sidebar" data-testid="traffic-trigger" onClick={() => openTrafficDrawer()}>
                <span className="traffic-trigger-label">{t.radar.trafficNearby}</span>
                <strong>{formatNumber(activeTrafficCount)}</strong>
              </button>
              </MapControlGroup>
              {showWeatherRadar && radarCatalog?.frames.length ? <div className="weather-radar-timeline" aria-label={t.layers.weatherRadar}>
                <div className="weather-radar-timeline-heading"><strong>{t.layers.weatherRadar}</strong><span>{selectedRadarFrame ? formatDateTime(selectedRadarFrame.observedAt, t) : t.common.loading}</span></div>
                <div className="weather-radar-timeline-controls">
                  <button type="button" aria-label={t.layers.previousFrame} onClick={() => { const index = radarCatalog.frames.findIndex((frame) => frame.id === radarFrameId); setRadarLatestMode(false); setRadarFrameId(radarCatalog.frames[Math.max(0, index - 1)].id); }}><UiIcon name="back" /></button>
                  <button type="button" aria-pressed={radarPlaying} aria-label={radarPlaying ? t.layers.pause : t.layers.play} onClick={() => { setRadarLatestMode(false); setRadarPlaying((value) => !value); }}><UiIcon name={radarPlaying ? "pause" : "play"} /></button>
                  <button type="button" aria-label={t.layers.nextFrame} onClick={() => { const index = radarCatalog.frames.findIndex((frame) => frame.id === radarFrameId); setRadarLatestMode(false); setRadarFrameId(radarCatalog.frames[Math.min(radarCatalog.frames.length - 1, index + 1)].id); }}><span className="ui-icon ui-icon-flipped"><UiIcon name="back" /></span></button>
                  <input type="range" min="0" max={Math.max(0, radarCatalog.frames.length - 1)} value={Math.max(0, radarCatalog.frames.findIndex((frame) => frame.id === radarFrameId))} aria-label={t.layers.weatherRadar} onChange={(event) => { setRadarLatestMode(false); setRadarPlaying(false); setRadarFrameId(radarCatalog.frames[Number(event.target.value)].id); }} />
                  <button type="button" className={radarLatestMode ? "active" : ""} aria-pressed={radarLatestMode} onClick={() => { setRadarLatestMode(true); setRadarPlaying(false); setRadarFrameId(radarCatalog.latestFrameId); }}>{t.layers.latest}</button>
                </div>
              </div> : showWeatherRadar && radarStatus === "unavailable" ? <div className="map-layer-notice">{t.layers.radarUnavailable}</div> : null}
              <details className="map-layers">
                <MapControl as="summary"><UiIcon name="layers" />{t.layers.title}</MapControl>
                <div className="map-layers-menu" role="group" aria-label={t.layers.title}>
                  <div className="map-layer-group">
                    <span className="map-layer-group-title">{t.layers.groups.traffic}</span>
                    <label><input type="checkbox" checked={showAircraft} onChange={(event) => setShowAircraft(event.target.checked)} /> {t.layers.aircraft}</label>
                    <label><input type="checkbox" checked={showOgn} onChange={(event) => setShowOgn(event.target.checked)} /> {t.layers.ogn}</label>
                  </div>
                  <div className="map-layer-group">
                    <span className="map-layer-group-title">{t.layers.groups.aviation}</span>
                    <label data-testid="map-layer-airports"><input type="checkbox" checked={showAirports} onChange={(event) => setShowAirports(event.target.checked)} /> {datasetStateLabel(t.layers.airports, airportsDataset, (count) => t.layers.airportsCount(formatNumber(count)))}</label>
                    <label className="map-layer-sublevel"><input type="checkbox" checked={showSignificantAirports} disabled={!showAirports} onChange={(event) => setShowSignificantAirports(event.target.checked)} /> {t.layers.significantAirports}</label>
                    <label className="map-layer-sublevel"><input type="checkbox" checked={showSmallAirports} disabled={!showAirports} onChange={(event) => setShowSmallAirports(event.target.checked)} /> {t.layers.smallAirports}</label>
                    <label className="map-layer-sublevel"><input type="checkbox" checked={showHeliports} disabled={!showAirports} onChange={(event) => setShowHeliports(event.target.checked)} /> {t.layers.heliports}</label>
                    <div className="map-layer-subgroup-heading">{t.layers.groups.atcAirspace}</div>
                    <label data-testid="map-layer-atc"><input type="checkbox" checked={showAtc} onChange={(event) => setShowAtc(event.target.checked)} /> {datasetStateLabel(t.layers.atc, atcDataset, (count) => t.layers.sectorsCount(formatNumber(count)))}</label>
                    <label data-testid="map-layer-atc-traffic"><input type="checkbox" checked={showAtcTraffic} onChange={(event) => setShowAtcTraffic(event.target.checked)} /> {t.layers.atcTraffic}</label>
                    {showAtcTraffic && <div className="map-layer-sublevel">{t.layers.atcTrafficLegend}<br /><small>{t.layers.atcTrafficDescription}<br />{t.layers.atcTrafficDisclaimer}{sectorTrafficState === "stale" ? " · STALE" : sectorTrafficState === "unavailable" ? ` · ${t.layers.atcTrafficNoData}` : ""}</small></div>}
                    {showAtc && airspaceActivity?.planned.status !== "unavailable" && <div className="map-layer-sublevel">{activityT.legendCurrent} · {activityT.legendUpcoming}{airspaceActivity?.planned.status === "stale" ? ` · ${activityT.stale}` : ""}<br /><small>{activityT.disclaimer}</small></div>}
                    <div className="map-layer-subgroup-heading">{t.layers.groups.atsProcedures}</div>
                    <label data-testid="map-layer-ats"><input type="checkbox" checked={showAtsRoutes} onChange={(event) => { setShowAtsRoutes(event.target.checked); if (!event.target.checked) setSelectedAtsRoute(null); }} /> {datasetStateLabel(t.layers.atsRoutes, atsDataset, (count) => t.layers.routesCount(formatNumber(count)))}</label>
                    <label data-testid="map-layer-sid"><input type="checkbox" checked={showSids} onChange={(event) => setShowSids(event.target.checked)} /> {t.layers.sids}</label>
                    <label data-testid="map-layer-star"><input type="checkbox" checked={showStars} onChange={(event) => setShowStars(event.target.checked)} /> {t.layers.stars}</label>
                    {showAtsRoutes && atsRoutes?.available && atsRoutes.counts && atsRoutes.source && <div className="map-layer-sublevel">{t.layers.atsRoutesSummary(String(atsRoutes.counts.routes), String(atsRoutes.counts.segments), atsRoutes.source.effectiveDate)}<br /><a href={atsRoutes.source.reference} target="_blank" rel="noreferrer">{t.layers.atsSource}</a></div>}
                    {showAtsRoutes && atsRoutes && !atsRoutes.available && <div className="map-layer-sublevel">{t.layers.atsRoutesUnavailable}</div>}
                    {sigmetEnabled !== false && <label data-testid="map-layer-sigmet"><input type="checkbox" checked={showSigmet} onChange={(event) => setShowSigmet(event.target.checked)} /> {t.layers.sigmet}</label>}
                  </div>
                  <div className="map-layer-group">
                    <span className="map-layer-group-title">{t.layers.groups.weather}</span>
                    <label data-testid="map-layer-weather-radar"><input type="checkbox" checked={showWeatherRadar} onChange={(event) => { setShowWeatherRadar(event.target.checked); if (!event.target.checked) setRadarPlaying(false); }} /> {t.layers.weatherRadar}</label>
                    {showWeatherRadar && <div className="map-layer-sublevel weather-radar-controls">
                      <label className="map-layer-mode"><span>{t.layers.opacity}</span><input type="range" min="0.2" max="1" step="0.05" value={radarOpacity} aria-label={t.layers.opacity} onChange={(event) => setRadarOpacity(Number(event.target.value))} /></label>
                      <span>{selectedRadarFrame ? `${t.layers.currentTimestamp}: ${formatDateTime(selectedRadarFrame.observedAt, t)}${selectedRadarFrame.stale ? ` · ${t.layers.radarStale}` : ""}` : radarStatus === "unavailable" ? t.layers.radarUnavailable : t.common.loading}</span>
                    </div>}
                    <label data-testid="map-layer-metar"><input type="checkbox" checked={showMetar} onChange={(event) => setShowMetar(event.target.checked)} /> {t.layers.metar}</label>
                    <label data-testid="map-layer-wind"><input type="checkbox" checked={showWind} onChange={(event) => setShowWind(event.target.checked)} /> {t.layers.windAloft}</label>
                    {showWind && <div className="map-layer-sublevel wind-controls">
                      <label className="map-layer-mode"><span>{t.layers.pressureLevel}</span><select value={windLevel} aria-label={t.layers.pressureLevel} onChange={(event) => { setWindLevel(Number(event.target.value) as WindLevelHpa); setWindValidAt(null); }}>{WIND_PRESSURE_LEVELS.map((level) => <option key={level} value={level}>{level} hPa</option>)}</select></label>
                      {windData && <label className="map-layer-mode"><span>{t.layers.valid}</span><select value={windValidAt ?? windData.validAt} aria-label={t.layers.valid} onChange={(event) => setWindValidAt(event.target.value)}>{windData.availableValidTimes.map((valid) => <option key={valid} value={valid}>{formatDateTime(valid, t)}</option>)}</select></label>}
                      {windData && <span>{windData.model} · {t.layers.windModelForecast}{windData.modelRun ? ` · ${t.layers.modelRun}: ${formatDateTime(windData.modelRun, t)}` : ""} · {t.layers.valid}: {formatDateTime(windData.validAt, t)}</span>}
                      {windStatus === "unavailable" && <span>{t.layers.windUnavailable}</span>}
                    </div>}
                    {showMetar && metarStatus === "unavailable" && <div className="map-layer-sublevel">{t.layers.metarUnavailable}</div>}
                    {showMetar && <div className="map-layer-sublevel metar-legend"><span><i className="metar-dot vfr" /> {t.layers.vfr}</span><span><i className="metar-dot mvfr" /> {t.layers.mvfr}</span><span><i className="metar-dot ifr" /> {t.layers.ifr}</span><span><i className="metar-dot lifr" /> {t.layers.lifr}</span></div>}
                  </div>
                  <div className="map-layer-group">
                    <span className="map-layer-group-title">{t.layers.groups.operationalAirspace}</span>
                    <label data-testid="map-layer-aup-uup"><input type="checkbox" checked={showAupUup} onChange={(event) => setShowAupUup(event.target.checked)} /> {t.layers.airspaceActivity}</label>
                    {showAupUup && airspaceDataset.status === "unavailable" && <div className="map-layer-sublevel">{t.layers.airspaceUnavailable}</div>}
                    {showAupUup && <div className="map-layer-sublevel">{t.layers.airspacePlannedActive} · {t.layers.airspaceDisclaimer}</div>}
                  </div>
                  <div className="map-layer-group">
                    <span className="map-layer-group-title">{t.layers.groups.display}</span>
                    {receiverPositionAvailable && <label><input type="checkbox" checked={showRangeRings} onChange={(event) => setShowRangeRings(event.target.checked)} /> {t.layers.rangeRings}</label>}
                    <label className="map-layer-mode"><span>{t.layers.colorMode}</span><select value={colorMode} aria-label={t.layers.colorMode} onChange={(event) => setColorMode(event.target.value as AircraftColorMode)}>
                      <option value="default">{t.layers.colorModes.default}</option>
                      <option value="altitude">{t.layers.colorModes.altitude}</option>
                      <option value="speed">{t.layers.colorModes.speed}</option>
                      <option value="verticalRate">{t.layers.colorModes.verticalRate}</option>
                    </select></label>
                  </div>
                </div>
              </details>
            </div>
            {(networkNotice || networkEnabled) && <div className="map-source-notice">
              {networkNotice && <span className="network-notice">{networkNotice}</span>}
              {networkEnabled && <span className="network-attribution">{t.radar.networkAttribution}</span>}
            </div>}
            {colorMode !== "default" || (selectedAircraftVisible && selectedAircraft?.enrichment?.route) || showAtc || showAtsRoutes || showWeatherRadar || showMetar || showAupUup ? <Panel className="map-overlay-card contextual-legend">
              {(showAtc || showAupUup) && <span className="layer-legend aviation-layer-legend"><strong>{t.layers.atc}</strong><span><i className="legend-line atc-context" /> {t.atc.sector}</span><span><i className="legend-line atc-background" /> {t.layers.atc}</span>{showAupUup && <span><i className="legend-line planned" /> {activityT.legendUpcoming}</span>}</span>}
              {showAtsRoutes && <span className="layer-legend aviation-layer-legend"><strong>{t.layers.atsRoutes}</strong><span><i className="legend-line ats-network" /> {t.layers.atsRoutes}</span><span><i className="legend-line ats-selected" /> {t.route.context}</span></span>}
              {showWeatherRadar && <span className="layer-legend aviation-layer-legend"><strong>{t.layers.weatherRadar}</strong><span><i className="legend-line weather-radar" /> {selectedRadarFrame ? formatDateTime(selectedRadarFrame.observedAt, t) : t.common.loading}</span></span>}
              {showMetar && <span className="layer-legend aviation-layer-legend"><strong>{t.layers.metar}</strong><span><i className="metar-dot vfr" /> {t.layers.vfr}</span><span><i className="metar-dot mvfr" /> {t.layers.mvfr}</span><span><i className="metar-dot ifr" /> {t.layers.ifr}</span></span>}
              {colorMode !== "default" && <span className="color-mode-legend"><strong>{t.layers.colorModes[colorMode]}</strong><span><i className="color-legend-swatch low" /> {t.layers.colorLegendLow}</span><span><i className="color-legend-swatch high" /> {t.layers.colorLegendHigh}</span><span><i className="color-legend-swatch fallback" /> {t.layers.colorLegendFallback}</span></span>}
              {selectedAircraftVisible && selectedAircraft?.enrichment?.route && <span className="layer-legend"><span><i className="legend-line actual" /> {t.route.actualTrail}</span><span><i className="legend-line completed" /> {t.route.originToCurrent}</span><span><i className="legend-line remaining" /> {t.route.currentToDestination}</span><small>{t.route.contextDisclaimer}</small></span>}
            </Panel> : null}
          </div>
        </div>

        <aside id="radar-sidebar" data-testid="radar-sidebar" className={`sidebar drawer-${drawerState} ${mobileCompact ? "compact" : ""} ${selectedAircraft || selectedOgnTarget ? "has-selection" : ""}`}>
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
                {trafficSource === "adsb" && activeCoverage === "extended" && <div className="coverage-switch source-filter-switch" role="group" aria-label="Source filter">
                  {(["all", "local", "network", "overlap"] as AircraftSourceFilter[]).map((source) => <button key={source} type="button" className={mapFilters.source === source ? "active" : ""} aria-pressed={mapFilters.source === source} onClick={() => updateMapFilter("source", source)}>{source.toUpperCase()}</button>)}
                </div>}
              </div>
              <IconButton className="mobile-collapse" onClick={() => setMobileCompact((value) => !value)} aria-expanded={!mobileCompact} aria-label={mobileCompact ? t.radar.expandAircraftPanel : t.radar.collapseAircraftPanel}>
                {mobileCompact ? "↑" : "↓"}
              </IconButton>
              <button type="button" className="drawer-close-button" onClick={closeRadarDrawer} aria-label={drawerState === "traffic" ? t.history.closeTrafficPanel : drawerState === "ogn" ? t.history.closePanel : t.history.closeAircraftDetails}><UiIcon name="close" /></button>
            </div>
          <div className="sidebar-browse">
          <div className="sidebar-header">
            <div className="search-wrap">
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input ref={searchInputRef} className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={trafficSource === "ogn" ? t.search.ognPlaceholder : t.search.placeholder} aria-label={trafficSource === "ogn" ? t.search.ognLabel : t.search.aircraftLabel} />
              {search && <button type="button" className="search-clear-button" onClick={() => setSearch("")} aria-label={t.filters.clearSearch}><UiIcon name="close" /></button>}
            </div>
            {trafficSource === "adsb" && <div className="radar-options">
              <div className="quick-filter-row" role="group" aria-label={t.filters.title}>
                {(["all", "airborne", "onGround", "helicopters", "gliders", "uav", "emergency"] as AircraftQuickFilter[]).map((filter) => <button
                  key={filter}
                  type="button"
                  className={`quick-filter-chip ${mapFilters.quick === filter ? "active" : ""}`}
                  aria-pressed={mapFilters.quick === filter}
                  onClick={() => updateMapFilter("quick", filter)}
                >{quickFilterLabels[filter]}</button>)}
              </div>
              <button type="button" className="filter-button" aria-expanded={filtersOpen} aria-controls="map-filters-panel" onClick={() => setFiltersOpen((value) => !value)}>
                <span>{t.filters.title}{hasActiveMapFilters ? ` · ${activeFilterCount}` : ""}</span>
                {hasActiveMapFilters && <span className="filter-active-dot" aria-label={t.filters.active}>{t.filters.active}</span>}
              </button>
              {hasActiveMapFilters && <div className="active-filter-chips" aria-label={t.filters.active}>
                {activeFilterChips.map((chip) => <button type="button" className="filter-chip" key={chip.id} onClick={chip.onRemove} title={t.filters.clearAll}>{chip.label}<span aria-hidden="true"> ×</span><span className="sr-only">{t.filters.clearSearch}</span></button>)}
                {activeFilterChips.length > 1 && <button type="button" className="filter-chip-reset" onClick={resetMapFilters}>{t.filters.clearAll}</button>}
              </div>}
              {filtersOpen && <div id="map-filters-panel" className="map-filters-panel" role="region" aria-label={t.filters.title}>
                <div className="filter-panel-heading">{t.filters.filterGroup}</div>
                <fieldset className="map-filter-group">
                  <legend>{t.filters.status}</legend>
                  <div className="map-filter-choice-row">
                    <label><input type="radio" name="aircraft-status" value="all" checked={mapFilters.status === "all"} onChange={(event) => updateMapFilter("status", event.target.value as MapAircraftFilters["status"])} /> {t.filters.statusAll}</label>
                    <label><input type="radio" name="aircraft-status" value="airborne" checked={mapFilters.status === "airborne"} onChange={(event) => updateMapFilter("status", event.target.value as MapAircraftFilters["status"])} /> {t.filters.statusAirborne}</label>
                    <label><input type="radio" name="aircraft-status" value="onGround" checked={mapFilters.status === "onGround"} onChange={(event) => updateMapFilter("status", event.target.value as MapAircraftFilters["status"])} /> {t.filters.statusOnGround}</label>
                  </div>
                </fieldset>
                <fieldset className="map-filter-group">
                  <legend>{t.filters.altitude}</legend>
                  <div className="map-filter-fields">
                    <label className="map-filter-field"><span>{t.filters.minimumAltitudeInput}</span><input type="number" inputMode="numeric" min="0" step="100" value={mapFilters.minAltitude} onChange={(event) => updateMapFilter("minAltitude", event.target.value)} /></label>
                    <label className="map-filter-field"><span>{t.filters.maximumAltitudeInput}</span><input type="number" inputMode="numeric" min="0" step="100" value={mapFilters.maxAltitude} onChange={(event) => updateMapFilter("maxAltitude", event.target.value)} /></label>
                  </div>
                </fieldset>
                <fieldset className="map-filter-group">
                  <legend>{t.filters.identity}</legend>
                  <div className="map-filter-fields">
                    <label className="map-filter-field"><span>{t.filters.callsign}</span><input value={mapFilters.callsign} onChange={(event) => updateMapFilter("callsign", event.target.value.toUpperCase())} autoComplete="off" /></label>
                    <label className="map-filter-field"><span>{t.filters.registrationInput}</span><input value={mapFilters.registration} onChange={(event) => updateMapFilter("registration", event.target.value.toUpperCase())} autoComplete="off" /></label>
                    <label className="map-filter-field map-filter-field-wide"><span>{t.filters.icaoHexInput}</span><input value={mapFilters.icaoHex} onChange={(event) => updateMapFilter("icaoHex", event.target.value.toUpperCase())} autoComplete="off" /></label>
                  </div>
                </fieldset>
                <fieldset className="map-filter-group">
                  <legend>{t.filters.aircraft}</legend>
                  <div className="map-filter-fields">
                    <label className="map-filter-field"><span>{t.filters.aircraftType}</span><input value={mapFilters.aircraftType} onChange={(event) => updateMapFilter("aircraftType", event.target.value)} autoComplete="off" /></label>
                    <label className="map-filter-field"><span>{t.filters.operator}</span><input value={mapFilters.operator} onChange={(event) => updateMapFilter("operator", event.target.value)} autoComplete="off" /></label>
                  </div>
                </fieldset>
                <fieldset className="map-filter-group">
                  <legend>{t.filters.special}</legend>
                  <label className="filter-toggle"><input type="checkbox" checked={mapFilters.emergencyOnly} onChange={(event) => updateMapFilter("emergencyOnly", event.target.checked)} /> {t.filters.emergencyOnly}</label>
                  <label className="filter-toggle"><input type="checkbox" checked={watchlistOnly} onChange={(event) => setWatchlistOnly(event.target.checked)} /> {t.filters.watchlistOnly}</label>
                </fieldset>
                <div className="filter-panel-heading filter-panel-heading-sort">{t.filters.sortGroup}</div>
                <div className="map-filter-legacy-row">
                  <label className="map-filter-field"><span>{t.filters.sortLabel}</span><select className="filter-select" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="distance">{t.filters.sortDistance}</option><option value="altitude">{t.filters.sortAltitude}</option><option value="callsign">{t.filters.sortCallsign}</option></select></label>
                  <label className="map-filter-field"><span>{t.filters.maximumDistance}</span><select className="filter-select" value={distanceFilter} onChange={(event) => setDistanceFilter(event.target.value)}><option value="all">{t.filters.distanceAll}</option><option value="25">{t.filters.distanceWithin25}</option><option value="75">{t.filters.distanceWithin75}</option></select></label>
                </div>
                <button type="button" className="filter-reset-button" onClick={resetMapFilters}>{t.filters.reset}</button>
              </div>}
              </div>}
            {trafficSource === "adsb" && <details className="watchlist-box">
              <summary>{t.watchlist.title} <span>{watchlistSummary(watchlist.length)}</span></summary>
              <form onSubmit={addWatchlistRule} className="watchlist-form">
                <select value={watchlistKind} onChange={(event) => setWatchlistKind(event.target.value)} aria-label={t.watchlist.ruleType}>
                  <option value="icao">{t.watchlist.ruleKinds.icao}</option><option value="registration">{t.watchlist.ruleKinds.registration}</option><option value="callsign">{t.watchlist.exactCallsign}</option><option value="pattern">{t.watchlist.callsignPattern}</option><option value="type">{t.watchlist.ruleKinds.type}</option><option value="airline">{t.watchlist.ruleKinds.airline}</option>
                </select>
                <input value={watchlistValue} onChange={(event) => setWatchlistValue(event.target.value)} placeholder={watchlistKind === "pattern" ? "UAE*" : "A6-EVL"} aria-label={t.watchlist.value} />
                <button type="submit" className="watchlist-add">{t.watchlist.add}</button>
              </form>
              {watchlist.length > 0 && <div className="watchlist-rules">{watchlist.map((rule) => <button key={`${rule.kind}-${rule.value}`} type="button" onClick={() => setWatchlist((current) => current.filter((item) => item !== rule))}>{watchlistKindLabel(rule.kind)}: {rule.value} ×</button>)}</div>}
            </details>}
          </div>

          <RelevantAtcPanel summaries={snapshot.relevantAtcFrequencies} expanded={atcExpanded} onOpen={() => setAtcExpanded(true)} />
          <details className="sidebar-secondary-tools" onToggle={(event) => setIntelligenceOpened(event.currentTarget.open)}>
            <summary>{t.intelligence.title}<span>{t.common.more}</span></summary>
            {intelligenceOpened && <IntelligenceFeed />}
          </details>

          <div id="traffic-list" className={`aircraft-list ${trafficSource === "ogn" ? "ogn-traffic-list" : ""}`}>
            {trafficSource === "ogn" ? (
              filteredOgnTargets.length === 0 ? <div className="empty-list ogn-empty"><strong>{ognSnapshot.targets.length === 0 ? t.ogn.empty : t.ogn.noMatching}</strong></div> : filteredOgnTargets.map((target) => (
                <button key={target.id} type="button" className={`aircraft-row ogn-row ${selectedOgnId === target.id ? "selected" : ""} ${target.stale ? "stale" : ""}`} aria-pressed={selectedOgnId === target.id} onClick={() => selectOgn(target.id)}>
                  <span className="aircraft-row-icon ogn-row-icon"><OgnGlyph aircraftType={target.aircraftType} /></span>
                  <span className="aircraft-row-main">
                    <span className="aircraft-row-topline"><span className="aircraft-row-name">{ognTargetLabel(target)}</span> <span className="source-badge ogn-source-badge">{t.ogn.badge} · {t.ogn.trackingSources[target.trackingSource]}</span> {target.stale && <span className="ogn-stale-badge">{t.ogn.stale}</span>}</span>
                    <span className="aircraft-row-type">{target.identityVisible && target.model ? `${target.aircraftType.replaceAll("_", " ")} · ${target.model}` : target.aircraftType.replaceAll("_", " ")}</span>
                    <span className="aircraft-row-meta"><span><b>{formatAltitude(target.altitudeFt)}</b></span><span><b>{formatSpeed(target.groundSpeedKt)}</b></span><span><b>{formatTrack(target.trackDeg)}</b></span></span>
                  </span>
                  <span className="aircraft-row-distance">{formatDistance(target.distanceKm)}</span>
                </button>
              ))
            ) : filteredAircraft.length === 0 ? (
              <div className="empty-list">
                <strong>{snapshot.aircraft.length === 0 ? t.radar.waitingForTraffic : t.radar.noMatchingAircraft}</strong>
                {snapshot.aircraft.length === 0 ? t.radar.waitingForTrafficDescription : t.radar.noMatchingAircraftDescription}
              </div>
            ) : filteredAircraft.map((aircraft) => (
              <button key={aircraft.icaoHex} className={`aircraft-row ${selectedHex === aircraft.icaoHex ? "selected" : ""} ${isWatchlisted(aircraft) ? "watchlisted" : ""} ${aircraft.emergency ? "emergency" : ""}`} aria-pressed={selectedHex === aircraft.icaoHex} onClick={() => selectAircraft(aircraft.icaoHex)}>
                <span className="aircraft-row-icon"><AircraftIcon aircraft={aircraft} /></span>
                <span className="aircraft-row-main">
                  <span className="aircraft-row-topline"><span className="aircraft-row-name">{labelForAircraft(aircraft)}</span> <span className="source-badge" title={`Seen by ${aircraftSourceLabel(aircraft)}`}>{aircraftPositionSourceLabel(aircraft)}</span> {isWatchlisted(aircraft) && <span className="watch-badge">{t.watchlist.badge}</span>} {aircraft.emergency && <span className="emergency-badge"><span aria-hidden="true">!</span> {aircraft.emergency}</span>}</span>
                  <span className="aircraft-row-type">{aircraft.enrichment?.metadata?.icaoTypeCode || aircraft.aircraftType || t.aircraft.unknownType}{aircraft.registration || aircraft.enrichment?.metadata?.registration ? ` · ${aircraft.registration || aircraft.enrichment?.metadata?.registration}` : ""}</span>
                  <span className="aircraft-row-meta"><span><b>{formatAltitude(aircraft.altitude)}</b></span><span><b>{formatSpeed(aircraft.groundSpeed)}</b></span><span><b>{formatTrack(aircraft.track)}</b></span><span className="aircraft-row-hex">{aircraft.icaoHex}</span></span>
                </span>
                <span className="aircraft-row-distance">{formatDistance(aircraft.distanceKm)}</span>
              </button>
            ))}
          </div>

          <details className="sidebar-secondary-tools" onToggle={(event) => setLogbookOpened(event.currentTarget.open)}>
            <summary>{t.dashboard.logbookTitle}<span>{t.dashboard.openStatistics}</span></summary>
            {logbookOpened && <LogbookSummary />}
          </details>

          </div>

          {(drawerState === "aircraft" || drawerState === "ogn") && (
            <div className="detail-panel" key={selectedOgnTarget ? `ogn-${selectedOgnTarget.id}` : selectedIdentity}>
              {selectedOgnTarget ? <>
                <div className="detail-heading">
                  <button type="button" className="detail-back-button" onClick={backToTraffic}>← {t.radar.trafficNearby}</button>
                  <div><div className="detail-eyebrow">{t.ogn.title}</div><div className="detail-callsign">{ognTargetLabel(selectedOgnTarget)}</div><div className="detail-registration">{t.ogn.badge} · {t.ogn.trackingSources[selectedOgnTarget.trackingSource]}</div></div>
                  <button className="close-button" onClick={closeRadarDrawer} aria-label={t.history.closePanel}>×</button>
                </div>
                <OgnDetailContent target={selectedOgnTarget} />
              </> : selectedAircraft ? <AircraftRadarQuickDetail
                aircraft={selectedAircraft}
                databaseAircraft={selectedDatabaseAircraft}
                historyTrail={selectedHistoryTrail?.icaoHex === selectedAircraft.icaoHex ? selectedHistoryTrail : null}
                atcContext={selectedAtcContext}
                sectorTraffic={sectorTraffic}
                watchlisted={isWatchlisted(selectedAircraft)}
                onBack={backToTraffic}
                onClose={closeRadarDrawer}
                onCenter={centerSelectedAircraft}
                onToggleWatchlist={() => setWatchlist((current) => current.some((rule) => rule.kind === "icao" && rule.value === selectedAircraft.icaoHex)
                  ? current.filter((rule) => !(rule.kind === "icao" && rule.value === selectedAircraft.icaoHex))
                  : [...current, { kind: "icao", value: selectedAircraft.icaoHex }])}
              /> : <div className="detail-content">
                <div className="detail-disclaimer aircraft-offline-notice">{t.aircraft.notCurrentlyInRange}</div>
                <DetailSection title={t.history.aircraftDetail}>
                  <DetailItem label={t.aircraft.icaoHex} value={selectedIdentity || t.common.emptyValue} />
                  <DetailItem label={t.aircraft.registration} value={selectedDatabaseAircraft?.registration || t.common.emptyValue} />
                  <DetailItem label={t.aircraft.currentCallsign} value={t.common.emptyValue} />
                  <DetailItem label={t.aircraft.aircraftType} value={selectedDatabaseAircraft?.aircraftType || t.common.emptyValue} />
                  <DetailItem label={t.aircraft.manufacturer} value={selectedDatabaseAircraft?.manufacturer || t.common.emptyValue} />
                  <DetailItem label={t.aircraft.modelType} value={selectedDatabaseAircraft?.model || t.common.emptyValue} />
                  <DetailItem label={t.aircraft.operator} value={selectedDatabaseAircraft?.operator || t.common.emptyValue} />
                  <DetailItem label={t.aircraft.registrationCountry} value={selectedDatabaseAircraft?.registrationCountryCode || selectedDatabaseAircraft?.registrationCountry || t.common.emptyValue} />
                </DetailSection>
                <div className="detail-footer"><Link className="history-link" href={`/aircraft/${encodeURIComponent(selectedIdentity || "")}`}>{t.history.aircraftDetail} →</Link></div>
              </div>}
            </div>
          )}
        </aside>
      </section>

      <MobileBottomNav />
    </main>
  );
}

function OgnDetailContent({ target }: { target: OgnTargetView }) {
  const typeLabel = target.aircraftType.replaceAll("_", " ");
  const ageSeconds = Math.max(0, (Date.now() - Date.parse(target.receivedAt)) / 1000);
  const position = `${formatCoordinate(target.latitude)}, ${formatCoordinate(target.longitude)}`;
  return <div className="detail-content ogn-detail-content">
    <div className="detail-hero">
      <div className="detail-hero-type">{typeLabel}</div>
      <div className="detail-hero-metrics">
        <div><strong>{formatAltitude(target.altitudeFt)}</strong><span>{t.ogn.altitude}</span></div>
        <div><strong>{formatSpeed(target.groundSpeedKt)}</strong><span>{t.ogn.groundSpeed}</span></div>
        <div><strong>{formatTrack(target.trackDeg)}</strong><span>{t.ogn.track}</span></div>
        <div><strong>{target.verticalRateFpm === null ? t.common.emptyValue : `${target.verticalRateFpm > 0 ? "+" : ""}${formatNumber(target.verticalRateFpm)} ft/min`}</strong><span>{t.ogn.verticalRate}</span></div>
      </div>
    </div>
    <DetailSection title={t.ogn.identity}>
      {target.identityVisible ? <>
        <DetailItem label={t.ogn.address} value={target.address || t.common.emptyValue} />
        <DetailItem label={t.ogn.addressType} value={target.addressType} />
        <DetailItem label={t.ogn.callsign} value={target.senderCallsign || t.common.emptyValue} />
        <DetailItem label={t.ogn.registration} value={target.registration || t.common.emptyValue} />
        <DetailItem label={t.ogn.competitionNumber} value={target.competitionNumber || t.common.emptyValue} />
        <DetailItem label={t.ogn.model} value={target.model || t.common.emptyValue} />
      </> : <div className="detail-disclaimer">{t.ogn.anonymous} · {t.ogn.hiddenIdentity}</div>}
    </DetailSection>
    <DetailSection title={t.ogn.position}>
      <DetailItem label={t.ogn.aircraftType} value={typeLabel} />
      <DetailItem label={t.ogn.position} value={position} />
      <DetailItem label={t.ogn.distance} value={formatDistance(target.distanceKm)} />
      <DetailItem label={t.ogn.bearing} value={formatTrack(target.bearing)} />
      <DetailItem label={t.ogn.lastSeen} value={formatAge(ageSeconds)} />
      {target.identityVisible && <DetailItem label={t.ogn.receiver} value={target.lastReceiver || t.common.emptyValue} />}
      <DetailItem label={t.ogn.title} value={`${t.ogn.trackingSources[target.trackingSource]}${target.stale ? ` · ${t.ogn.stale}` : ""}`} />
    </DetailSection>
    <div className="detail-disclaimer ogn-privacy-note">{t.ogn.sourceDisclaimer}</div>
  </div>;
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === t.common.emptyValue) return null;
  return <div><div className="detail-item-label">{label}</div><div className="detail-item-value">{value}</div></div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3><div className="detail-grid">{children}</div></section>;
}
