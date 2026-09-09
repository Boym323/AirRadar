"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { FilterSpecification, GeoJSONSource, StyleSpecification } from "maplibre-gl";
import {
  formatAge,
  formatAltitude,
  formatAtcFrequency,
  formatAtcConfidence,
  formatAtcNote,
  formatAtcService,
  formatCoordinate,
  formatDateTime,
  formatDistance,
  formatNumber,
  formatSpeed,
  formatTime,
  formatTrack,
  secondaryStats,
  t,
  visibleAircraft,
  watchlistKindLabel,
  watchlistSummary,
} from "@/lib/i18n";
import { shouldRecenterOnReceiver } from "@/lib/receiver";
import type { AircraftView, CoverageMode, PublicReceiverPosition, PublicStateSnapshot, ReceiverPosition, TrailPoint } from "@/lib/aircraft/types";
import { appendTrailPoint, boundTrailPoints, selectedTrail, trailPointFromAircraft } from "@/lib/aircraft/trail";
import type { Airport } from "@/lib/airports/types";
import type { AtcDataResponse, AtcSector } from "@/lib/atc/types";
import { RelevantAtcPanel } from "@/components/relevant-atc-panel";
import { AirportWeatherDisclosure } from "@/components/airport-weather";
import { AircraftRecentFlights } from "@/components/aircraft-detail-v2";
import { matchesAircraftRule, normalizeAircraftRuleType } from "@/lib/aircraft/watchlist";
import type { AircraftDetailResponse, HistoryResponse } from "@/lib/server/history";
import { airportVisibilityFilter, airportVisibilityTier, DEFAULT_AIRPORT_LAYER_VISIBILITY, type AirportLayerVisibility } from "@/lib/airport-visibility";
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
import { GlobalSearch } from "@/components/global-search";
import { LogbookSummary } from "@/components/logbook-summary";
import {
  DEFAULT_MAP_AIRCRAFT_FILTERS,
  filterAircraftForMap,
  isMapAircraftFilterActive,
  type MapAircraftFilters,
} from "@/lib/aircraft/map-filters";

const DEMO_RECEIVER: ReceiverPosition = { lat: 50.0755, lon: 14.4378, name: t.radar.receiverName };
const EMPTY_RECEIVER: PublicReceiverPosition = { lat: null, lon: null, name: t.radar.receiverName };
const EMPTY_ATC_DATA: AtcDataResponse = {
  sectors: [],
  transmitters: [],
  metadata: { status: "unavailable", source: null, sourceReference: null, effectiveDate: null, lastVerifiedAt: null, sectorCount: 0, transmitterCount: 0 },
};

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

interface AircraftMotionTiming {
  lat: number;
  lon: number;
  receivedAt: number;
  durationMs: number;
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

function aircraftDataSourceLabel(aircraft: AircraftView): string {
  const provenance = aircraft.provenance;
  if (provenance?.seenLocal && provenance.seenNetwork) return t.aircraft.localAndNetwork;
  return aircraft.origin === "adsblol" ? t.aircraft.networkReceiver : t.aircraft.localReceiver;
}

function aircraftPositionSourceLabel(aircraft: AircraftView): string {
  const positionOrigin = aircraft.provenance?.positionOrigin ?? aircraft.origin;
  const originLabel = positionOrigin === "adsblol" ? t.aircraft.networkReceiver : t.aircraft.localReceiver;
  return `${originLabel} · ${aircraft.provenance?.positionSource ?? aircraft.source}`;
}

function registrationCountryForAircraft(aircraft: AircraftView): string | null {
  return aircraft.enrichment?.metadata?.registrationCountryCode ?? aircraft.enrichment?.metadata?.registrationCountry ?? null;
}

function formatAtcLimit(feet: number | null, reference: string | null | undefined, unlimited: string): string {
  if (reference === "SFC") return "SFC";
  if (reference === "UNL" || feet === null) return unlimited;
  if (reference === "FL") return `FL${Math.round(feet / 100)}`;
  return `${formatAltitude(feet)}${reference === "AGL" ? " AGL" : ""}`;
}

function airportCodes(airport: Airport): string {
  const icao = airport.icaoCode.trim().toUpperCase();
  const iata = airport.iataCode?.trim().toUpperCase();
  return iata ? `${iata} · ${icao}` : icao;
}

function AirportRouteLink({ airport }: { airport: Airport }) {
  const icao = airport.icaoCode.trim().toUpperCase();
  const href = `/airports/${encodeURIComponent(airport.icaoCode)}` as `/airports/${string}`;
  const canonicalHref = `/airports/${encodeURIComponent(icao)}` as `/airports/${string}`;
  return <Link className="airport-link" href={airport.icaoCode === icao ? href : canonicalHref}>{airportCodes(airport)}</Link>;
}

function RouteContextRow({ aircraft, route }: { aircraft: AircraftView; route: NonNullable<AircraftView["enrichment"]>["route"] }) {
  if (!route) return null;
  const origin = route.originAirport
    ? <AirportRouteLink airport={route.originAirport} />
    : route.origin || t.route.notAvailable;
  const destination = route.destinationAirport
    ? <AirportRouteLink airport={route.destinationAirport} />
    : route.destination || t.route.notAvailable;
  return <div className="route-context-block">
    <div className="detail-item-label">{t.route.context}</div>
    <div className="route-context-row" aria-label={t.route.context}>
      <span className="route-context-endpoint">{origin}</span>
      <span className="route-context-arrow" aria-hidden="true">→</span>
      <span className="route-context-current">{aircraft.callsign || aircraft.icaoHex}</span>
      <span className="route-context-arrow" aria-hidden="true">→</span>
      <span className="route-context-endpoint">{destination}</span>
    </div>
    <div className="route-disclaimer">{t.route.contextDisclaimer}</div>
  </div>;
}

function createAtcGeoJSON(sectors: AtcSector[], visible: boolean) {
  return {
    type: "FeatureCollection" as const,
    features: visible ? sectors.flatMap((sector) => sector.polygons.map((polygon) => ({
      type: "Feature" as const,
      properties: {
        id: sector.id,
        name: sector.name,
        service: formatAtcService(sector.service ?? sector.atcCallsign),
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
      },
      geometry: { type: "Polygon" as const, coordinates: [polygon] },
    }))) : [],
  };
}

function createAirportGeoJSON(airports: Airport[], excludedAirportCodes: ReadonlySet<string> = new Set()) {
  const unique = new Map(airports
    .filter((airport) => !excludedAirportCodes.has(airport.icaoCode.trim().toUpperCase()))
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

function LogoMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1.5" opacity=".32" />
      <circle cx="20" cy="20" r="8" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
      <path d="M20 20 33 7" stroke="#f3b95f" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="20" r="2.6" fill="currentColor" />
    </svg>
  );
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

// These are the filenames shipped by AircraftShapesSVG. Keeping the allowlist
// here prevents a missing or malformed provider value from creating a 404 (or
// an arbitrary URL) in every aircraft marker.
const AIRCRAFT_ICON_CODES = new Set([
  "A10", "A124", "A19N", "A20N", "A21N", "A225", "A306", "A310", "A318", "A320", "A321", "A332", "A333", "A337", "A338", "A339", "A342", "A343", "A345", "A346", "A359", "A35K", "A388", "A3ST", "A4", "A400", "AJET", "AN12", "AN26", "AS21", "AS32", "AS65", "AT45", "AT75", "ATP", "B190", "B29", "B350", "B38M", "B39M", "B52", "B703", "B712", "B722", "B733", "B734", "B735", "B737", "B738", "B739", "B742", "B744", "B748", "B74S", "B752", "B753", "B762", "B763", "B764", "B772", "B773", "B779", "B77L", "B77W", "B788", "B789", "B78X", "BALL", "BCS1", "BCS3", "BLCF", "BN2P", "C130", "C160", "C17", "C172", "C2", "C208", "C25B", "C295", "C5M", "C750", "CL2T", "CN35", "CRJ2", "CRJ7", "CRJ9", "CRJX", "D228", "D328", "DA42", "DC10", "DC3", "DC87", "DH8C", "DH8D", "DO27", "DO28", "E170", "E195", "E300", "E35L", "E390", "E3CF", "E3TF", "E737", "E8", "EC20", "EC35", "EC45", "EUFI", "F15", "F16", "F18H", "F18S", "F22", "F35", "F406", "F5", "F50", "FA7X", "GAZL", "GL5T", "GLF6", "GYRO", "H47", "H60", "H64", "HAWK", "HUNT", "IL62", "IL76", "J328", "K35E", "KC2", "KC46", "L159", "LJ35", "LYNX", "M326", "MD11", "MI24", "MIRA", "MRF1", "NH90", "P1", "P180", "P28A", "P3", "P8", "PA46", "PC12", "PC6T", "PC9", "Q4", "R135", "R44", "RFAL", "RJ85", "S61", "SB39", "SC7", "SF25", "SF34", "SGUP", "SR22", "ST75", "SU95", "T204", "T38", "TIGR", "U2", "VF35",
]);

function aircraftTypeCode(aircraft: Pick<AircraftView, "aircraftType" | "enrichment">): string {
  return (aircraft.enrichment?.metadata?.icaoTypeCode ?? aircraft.aircraftType ?? "").toUpperCase().replaceAll("-", "");
}

function aircraftIconAsset(aircraft: Pick<AircraftView, "aircraftType" | "enrichment">): string | null {
  const type = aircraftTypeCode(aircraft);
  // A few common provider codes have no standalone drawing in the upstream
  // catalogue; use the closest airframe silhouette instead of falling back to
  // the generic marker.
  const aliases: Record<string, string> = {
    A319: "A320",
    C25A: "C25B",
    C30J: "C130",
    C340: "DA42",
    C56X: "C25B",
    C68A: "C208",
    E190: "E195",
    E295: "E195",
    GALX: "GLF6",
    GLF5: "GLF6",
    BE40: "C25B",
    M20P: "PA46",
  };
  const code = aliases[type] ?? type;
  return AIRCRAFT_ICON_CODES.has(code) ? `/aircraft-icons/${code}.svg` : null;
}

function aircraftMarkerKind(aircraft: Pick<AircraftView, "category" | "aircraftType" | "enrichment">): AircraftMarkerKind {
  const type = aircraftTypeCode(aircraft);
  if (["A318", "A319", "A320", "A321", "A19N", "A20N", "A21N"].includes(type)) return "a320";
  if (/^(BCS1|BCS3|A221|A223)/.test(type)) return "a220";
  if (/^(A306|A310|A342|A343|A345|A346)/.test(type)) return "a330";
  if (/^(A332|A333|A338|A339)/.test(type)) return "a330";
  if (/^(A359|A35K)/.test(type)) return "a350";
  if (type === "A388") return "a380";
  if (/^(B712|B717)/.test(type)) return "b717";
  if (/^(B721|B722|B727)/.test(type)) return "b727";
  if (/^(B731|B732|B733|B734|B735|B736|B737|B738|B739|B37M|B38M|B39M|B3XM)/.test(type)) return "b737";
  if (/^(B741|B742|B743|B744|B748)/.test(type)) return "b747";
  if (/^(B752|B753|B757)/.test(type)) return "b757";
  if (/^(B762|B763|B764|B767)/.test(type)) return "b767";
  if (/^(B772|B773|B77L|B77W|B777)/.test(type)) return "b777";
  if (/^(B781|B788|B789|B78J|B787)/.test(type)) return "b787";
  if (/^(AT4|AT7|DH8|DHC|SF3|F50|JS4)/.test(type)) return "turboprop";
  if (/^(E1[3-9]|E2[0-9]|CRJ|RJ[0-9]|ARJ)/.test(type)) return "regional";
  if (/^(GLF|CL[0-9]|LJ[0-9]|E55|FA[0-9]|C5[0-9]|C68|C7[0-9]|PRM|H25|DA[0-9])/.test(type)) return "business-jet";
  if (/^(C[0-4]|P28|P32|P46|PA[0-9]|PC1|TBM|BE[0-9]|SR2|M20|DA4)/.test(type)) return "general-aviation";
  switch (aircraft.category?.toUpperCase()) {
    case "A7": return "helicopter";
    case "B1": return "glider";
    case "B6": return "drone";
    case "C1":
    case "C2": return "ground";
    default: return "airplane";
  }
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
  const [snapshot, setSnapshot] = useState<PublicStateSnapshot>(EMPTY_SNAPSHOT);
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [aircraftDetail, setAircraftDetail] = useState<AircraftDetailResponse | null>(null);
  const [aircraftDetailLoading, setAircraftDetailLoading] = useState(false);
  const [aircraftDetailError, setAircraftDetailError] = useState<string | null>(null);
  const [selectedHistoryTrail, setSelectedHistoryTrail] = useState<{ icaoHex: string; points: TrailPoint[] } | null>(null);
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
  const [showAirports, setShowAirports] = useState(true);
  const [showSignificantAirports, setShowSignificantAirports] = useState(DEFAULT_AIRPORT_LAYER_VISIBILITY.showSignificant);
  const [showSmallAirports, setShowSmallAirports] = useState(DEFAULT_AIRPORT_LAYER_VISIBILITY.showSmall);
  const [showHeliports, setShowHeliports] = useState(DEFAULT_AIRPORT_LAYER_VISIBILITY.showHeliports);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [atcData, setAtcData] = useState<AtcDataResponse>(EMPTY_ATC_DATA);
  const [streamConnected, setStreamConnected] = useState(false);
  const [coverage, setCoverage] = useState<CoverageMode>("local");
  const [serverAlertsEnabled, setServerAlertsEnabled] = useState<boolean | null>(null);
  const [mobileCompact, setMobileCompact] = useState(true);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const centeredTrafficRef = useRef(false);
  const focusedAircraftRef = useRef<string | null>(null);
  const receiverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const aircraftMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const animationFramesRef = useRef<Map<string, number>>(new Map());
  const aircraftMotionTimingRef = useRef<Map<string, AircraftMotionTiming>>(new Map());
  const aircraftAnimationTargetsRef = useRef<Map<string, [number, number]>>(new Map());
  const liveTrailsRef = useRef<Map<string, TrailPoint[]>>(new Map());
  const selectedHexRef = useRef<string | null>(null);
  const receiverRef = useRef<PublicReceiverPosition>(snapshot.receiver);
  const centeredReceiverRef = useRef<ReceiverPosition | null>(null);
  const [mapZoom, setMapZoom] = useState(7.4);
  const [mapReady, setMapReady] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("airradar-watchlist");
      if (stored) setWatchlist(JSON.parse(stored) as Array<{ kind: string; value: string }>);
      const storedCoverage = window.localStorage.getItem("airradar-coverage");
      if (storedCoverage === "extended" || storedCoverage === "local") setCoverage(storedCoverage);
    } catch {
      // Local storage is optional; the radar remains usable when it is blocked.
    }
    void fetch("/api/atc/sectors", { cache: "force-cache" })
      .then((response) => response.ok ? response.json() as Promise<AtcDataResponse> : null)
      .then((data) => { if (data) setAtcData(data); })
      .catch(() => undefined);
    void fetch("/api/airports", { cache: "force-cache" })
      .then((response) => response.ok ? response.json() as Promise<Airport[]> : null)
      .then((data) => { if (data) setAirports(data); })
      .catch(() => undefined);
    void fetch("/api/health", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ alerts?: PublicAlertStatus }> : null)
      .then((data) => { if (data?.alerts) setServerAlertsEnabled(data.alerts.enabled); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("airradar-watchlist", JSON.stringify(watchlist)); } catch { /* optional */ }
  }, [watchlist]);

  useEffect(() => {
    try { window.localStorage.setItem("airradar-coverage", coverage); } catch { /* optional */ }
  }, [coverage]);

  const isWatchlisted = useCallback((aircraft: AircraftView) => watchlist.some((rule) => {
    const value = rule.value.trim().toUpperCase();
    if (!value) return false;
    const type = normalizeAircraftRuleType(rule.kind);
    return type ? matchesAircraftRule(aircraft, { type, value }) : false;
  }), [watchlist]);

  const networkEnabled = Boolean(snapshot.sources?.adsbLol.enabled);
  const activeCoverage: CoverageMode = networkEnabled ? coverage : "local";

  function updateMapFilter<Key extends keyof MapAircraftFilters>(key: Key, value: MapAircraftFilters[Key]) {
    setMapFilters((current) => ({ ...current, [key]: value }));
  }

  const resetMapFilters = useCallback(() => {
    setMapFilters(DEFAULT_MAP_AIRCRAFT_FILTERS);
    setSearch("");
    setDistanceFilter("all");
    setWatchlistOnly(false);
    setSortBy("distance");
  }, []);

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
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFiltersOpen((current) => !current);
      } else if (event.key === "Escape") {
        setFiltersOpen(false);
        setSelectedHex(null);
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, []);

  function addWatchlistRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = watchlistValue.trim().toUpperCase();
    if (!value || watchlist.some((rule) => rule.kind === watchlistKind && rule.value === value)) return;
    setWatchlist((current) => [...current, { kind: watchlistKind, value }]);
    setWatchlistValue("");
  }

  const selectAircraft = useCallback((hex: string) => {
    selectedHexRef.current = hex;
    setSelectedHex(hex);
    setMobileCompact(false);
  }, []);

  useEffect(() => {
    selectedHexRef.current = selectedHex;
  }, [selectedHex]);

  useEffect(() => {
    if (!selectedHex) {
      setAircraftDetail(null);
      setAircraftDetailLoading(false);
      setAircraftDetailError(null);
      return;
    }
    let active = true;
    setAircraftDetail(null);
    setAircraftDetailLoading(true);
    setAircraftDetailError(null);
    void fetch(`/api/aircraft/${encodeURIComponent(selectedHex)}?coverage=${activeCoverage}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(t.history.recentFlightsLoadFailed);
        return (await response.json()) as AircraftDetailResponse;
      })
      .then((result) => {
        if (active) setAircraftDetail(result);
      })
      .catch((error: unknown) => {
        if (active) setAircraftDetailError(error instanceof Error ? error.message : t.history.recentFlightsLoadFailed);
      })
      .finally(() => {
        if (active) setAircraftDetailLoading(false);
      });
    return () => { active = false; };
  }, [activeCoverage, selectedHex]);

  useEffect(() => {
    setSelectedHistoryTrail(null);
    if (!selectedHex) return;
    let active = true;
    void fetch(`/api/history/${encodeURIComponent(selectedHex)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Aircraft trail history unavailable");
        return (await response.json()) as HistoryResponse & { icaoHex?: string };
      })
      .then((history) => {
        if (active && (!history.icaoHex || history.icaoHex.toUpperCase() === selectedHex.toUpperCase())) {
          setSelectedHistoryTrail({ icaoHex: selectedHex.toUpperCase(), points: boundTrailPoints(history.positions, Date.now()) });
        }
      })
      .catch(() => {
        // Live session points remain available when history is unavailable.
      });
    return () => { active = false; };
  }, [selectedHex]);

  useEffect(() => {
    let active = true;
    const source = new EventSource(`/api/stream?coverage=${activeCoverage}`);
    const onSnapshot = (event: Event) => {
      try {
        const next = JSON.parse((event as MessageEvent<string>).data) as PublicStateSnapshot;
        if (active) {
          const now = Date.now();
          for (const aircraft of next.aircraft) {
            const point = trailPointFromAircraft(aircraft);
            if (!point) continue;
            const trail = liveTrailsRef.current.get(aircraft.icaoHex) ?? [];
            liveTrailsRef.current.set(aircraft.icaoHex, appendTrailPoint(trail, point, now));
          }
          for (const [hex, trail] of liveTrailsRef.current) {
            const bounded = boundTrailPoints(trail, now);
            if (bounded.length || hex === selectedHexRef.current) liveTrailsRef.current.set(hex, bounded);
            else liveTrailsRef.current.delete(hex);
          }
          setSnapshot(next);
          setStreamConnected(true);
        }
      } catch {
        // Ignore malformed events and allow EventSource to reconnect.
      }
    };
    source.addEventListener("snapshot", onSnapshot);
    source.onopen = () => setStreamConnected(true);
    source.onerror = () => setStreamConnected(false);
    return () => {
      active = false;
      source.removeEventListener("snapshot", onSnapshot);
      source.close();
    };
  }, [activeCoverage]);

  useEffect(() => {
    if (!mapContainerRef.current) return;
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
    const animationFrames = animationFramesRef.current;
    const aircraftMarkers = aircraftMarkersRef.current;
    const aircraftMotionTiming = aircraftMotionTimingRef.current;
    const aircraftAnimationTargets = aircraftAnimationTargetsRef.current;
    const liveTrails = liveTrailsRef.current;

    map.on("load", () => {
      map.addSource("range-rings", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "range-rings-line",
        type: "line",
        source: "range-rings",
        paint: { "line-color": "#37d6c0", "line-opacity": 0.24, "line-width": 1, "line-dasharray": [2, 3] },
      });
      map.addSource("selected-trail", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "selected-trail-line", type: "line", source: "selected-trail", paint: { "line-color": "#f3b95f", "line-opacity": 0.85, "line-width": 2.5 } });
      map.addSource(ROUTE_V2_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: ROUTE_V2_COMPLETED_LAYER_ID,
        type: "line",
        source: ROUTE_V2_SOURCE_ID,
        filter: ["==", ["get", "segment"], "completed"],
        paint: { "line-color": "#d2b56f", "line-opacity": 0.62, "line-width": 2, "line-dasharray": [1.5, 2.5] },
      });
      map.addLayer({
        id: ROUTE_V2_REMAINING_LAYER_ID,
        type: "line",
        source: ROUTE_V2_SOURCE_ID,
        filter: ["==", ["get", "segment"], "remaining"],
        paint: { "line-color": "#a7b6c7", "line-opacity": 0.68, "line-width": 2, "line-dasharray": [2, 3] },
      });
      map.addSource("atc-sectors", { type: "geojson", data: createAtcGeoJSON([], false) });
      map.addLayer({ id: "atc-sectors-fill", type: "fill", source: "atc-sectors", layout: { visibility: "none" }, paint: { "fill-color": "#8068ff", "fill-opacity": 0.09 } });
      map.addLayer({ id: "atc-sectors-line", type: "line", source: "atc-sectors", layout: { visibility: "none" }, paint: { "line-color": "#a990ff", "line-opacity": 0.6, "line-width": 1.2, "line-dasharray": [2, 2] } });
      map.addLayer({ id: "atc-sectors-label", type: "symbol", source: "atc-sectors", minzoom: 6.5, layout: { visibility: "none", "text-field": ["get", "name"], "text-font": ["Open Sans Semibold"], "text-size": 10, "text-offset": [0, 0.8], "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": "#d7caff", "text-halo-color": "#08111d", "text-halo-width": 1.2 } });
      map.addSource("atc-transmitters", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "atc-transmitters-circle", type: "circle", source: "atc-transmitters", layout: { visibility: "none" }, paint: { "circle-color": "#f3b95f", "circle-radius": 5, "circle-stroke-color": "#08111d", "circle-stroke-width": 1.5 } });
      map.addSource("route-airports", { type: "geojson", data: createAirportGeoJSON([]) });
      map.addLayer({ id: "route-airports-circle", type: "circle", source: "route-airports", paint: { "circle-color": "#d2b56f", "circle-opacity": 0.72, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3, 12, 4.5], "circle-stroke-color": "#08111d", "circle-stroke-width": 1.2 } });
      map.addLayer({ id: "route-airports-label", type: "symbol", source: "route-airports", layout: { "text-field": ["get", "code"], "text-font": ["Open Sans Semibold"], "text-size": ["interpolate", ["linear"], ["zoom"], 5, 8, 10, 9, 13, 10], "text-offset": [0, 1.1], "text-padding": 7, "text-allow-overlap": false, "text-ignore-placement": false, "text-optional": true }, paint: { "text-color": "#cfbd8b", "text-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.52, 10, 0.72, 13, 0.82], "text-halo-color": "#08111d", "text-halo-width": 0.7 } });
      map.addSource(ROUTE_V2_AIRPORT_SOURCE_ID, { type: "geojson", data: createRouteAirportGeoJSON(null) });
      map.addLayer({ id: ROUTE_V2_AIRPORT_CIRCLE_LAYER_ID, type: "circle", source: ROUTE_V2_AIRPORT_SOURCE_ID, paint: { "circle-color": "#37d6c0", "circle-opacity": 0.92, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4.5, 12, 6], "circle-stroke-color": "#08111d", "circle-stroke-width": 1.8 } });
      map.addLayer({ id: ROUTE_V2_AIRPORT_LABEL_LAYER_ID, type: "symbol", source: ROUTE_V2_AIRPORT_SOURCE_ID, layout: { "text-field": ["get", "code"], "text-font": ["Open Sans Semibold"], "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9, 10, 10, 13, 11], "text-offset": [0, 1.25], "text-padding": 6, "text-allow-overlap": false, "text-ignore-placement": false, "text-optional": true }, paint: { "text-color": "#72e5d3", "text-opacity": 0.9, "text-halo-color": "#08111d", "text-halo-width": 1 } });
      map.on("click", "atc-sectors-fill", (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const properties = feature.properties ?? {};
        const content = document.createElement("div");
        content.className = "map-popup";
        const title = document.createElement("strong");
        title.textContent = String(properties.name ?? t.atc.sector);
        const body = document.createElement("span");
        const altitude = `${String(properties.lowerAltitude ?? properties.lowerAltitudeFt ?? 0)}–${String(properties.upperAltitude ?? properties.upperAltitudeFt ?? t.common.unlimited)}`;
        body.textContent = `${String(properties.service ?? "")} · ${altitude} · ${t.atc.primaryFrequency}: ${String(properties.primaryFrequency ?? t.common.emptyValue)} · ${t.atc.alternates}: ${String(properties.alternateFrequencies || t.common.emptyValue)} · ${t.atc.source}: ${String(properties.source ?? t.common.emptyValue)} · ${t.atc.sourceReference}: ${String(properties.sourceReference ?? t.common.emptyValue)} · ${t.atc.effectiveDate}: ${String(properties.validFrom ?? t.common.emptyValue)}`;
        content.append(title, body);
        new maplibregl.Popup({ closeButton: true, maxWidth: "260px" }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
      });
      map.on("mouseenter", "atc-sectors-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "atc-sectors-fill", () => { map.getCanvas().style.cursor = ""; });
      map.on("click", "atc-transmitters-circle", (event) => {
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
        if (typeof icao === "string" && /^[A-Z0-9]{4}$/.test(icao)) window.location.assign(`/airports/${encodeURIComponent(icao)}`);
      };
      for (const layer of ["route-airports-circle", "route-airports-label", ROUTE_V2_AIRPORT_CIRCLE_LAYER_ID, ROUTE_V2_AIRPORT_LABEL_LAYER_ID] as const) {
        map.on("click", layer, openAirport);
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
      map.on("zoomend", () => setMapZoom(map.getZoom()));
      setMapReady(true);
    });

    return () => {
      for (const frame of animationFrames.values()) cancelAnimationFrame(frame);
      animationFrames.clear();
      aircraftMotionTiming.clear();
      aircraftAnimationTargets.clear();
      receiverMarkerRef.current?.remove();
      receiverMarkerRef.current = null;
      for (const marker of aircraftMarkers.values()) marker.remove();
      aircraftMarkers.clear();
      liveTrails.clear();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

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

  const mapFilteredAircraft = useMemo(
    () => filterAircraftForMap(snapshot.aircraft, mapFilters),
    [mapFilters, snapshot.aircraft],
  );
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const mobile = window.matchMedia("(max-width: 820px)").matches;
    const panelHeight = mobile ? document.querySelector(".sidebar")?.getBoundingClientRect().height ?? 0 : 0;
    if (!centeredTrafficRef.current && (snapshot.receiver.lat === null || snapshot.receiver.lon === null) && snapshot.aircraft.length) {
      const positioned = snapshot.aircraft.filter((aircraft) => aircraft.lat !== null && aircraft.lon !== null);
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
        map.easeTo({ center: [aircraft.lon, aircraft.lat], padding: { top: 70, bottom: expandedHeight + 20, left: 40, right: 40 }, duration: 350 });
        focusedAircraftRef.current = selectedHex;
      }
    }
    const aircraftMotionTiming = aircraftMotionTimingRef.current;
    const aircraftAnimationTargets = aircraftAnimationTargetsRef.current;
    const currentHexes = new Set<string>();
    const animate = (hex: string, marker: maplibregl.Marker, target: [number, number], duration: number) => {
      const previousFrame = animationFramesRef.current.get(hex);
      if (previousFrame) cancelAnimationFrame(previousFrame);
      const start = marker.getLngLat();
      if (Math.abs(start.lng - target[0]) < 0.000001 && Math.abs(start.lat - target[1]) < 0.000001) {
        marker.setLngLat(target);
        animationFramesRef.current.delete(hex);
        return;
      }
      const startedAt = performance.now();
      const frame = (timestamp: number) => {
        const progress = Math.min(1, (timestamp - startedAt) / duration);
        const eased = progress * (2 - progress);
        marker.setLngLat([
          start.lng + (target[0] - start.lng) * eased,
          start.lat + (target[1] - start.lat) * eased,
        ]);
        if (progress < 1) {
          animationFramesRef.current.set(hex, requestAnimationFrame(frame));
        } else {
          animationFramesRef.current.delete(hex);
        }
      };
      animationFramesRef.current.set(hex, requestAnimationFrame(frame));
    };

    const selectedAircraftInSnapshot = snapshot.aircraft.find((aircraft) => aircraft.icaoHex === selectedHex);
    const selectedAircraftVisible = Boolean(selectedAircraftInSnapshot && filteredAircraft.some((aircraft) => aircraft.icaoHex === selectedHex));
    const historySnapshot = selectedHistoryTrail;
    const historyTrail = selectedAircraftVisible && historySnapshot && historySnapshot.icaoHex === selectedHex?.toUpperCase() ? historySnapshot.points : [];
    const selectedTrailForMap = selectedAircraftVisible ? selectedTrail(liveTrailsRef.current, selectedHex, historyTrail, Date.now()) : [];

    for (const aircraft of filteredAircraft) {
      if (aircraft.lat === null || aircraft.lon === null) continue;
      currentHexes.add(aircraft.icaoHex);
      let marker = aircraftMarkersRef.current.get(aircraft.icaoHex);
      const target: [number, number] = [aircraft.lon, aircraft.lat];
      if (!marker) {
        const root = document.createElement("div");
        root.className = aircraftMarkerClassNames({ selected: false, watchlisted: false, emergency: false }).join(" ");
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
        aircraftAnimationTargets.set(aircraft.icaoHex, target);
        aircraftMotionTiming.set(aircraft.icaoHex, {
          lat: aircraft.lat,
          lon: aircraft.lon,
          receivedAt: performance.now(),
          durationMs: MIN_AIRCRAFT_ANIMATION_MS,
        });
      } else {
        const previousTiming = aircraftMotionTiming.get(aircraft.icaoHex);
        const positionChanged = !previousTiming ||
          Math.abs(previousTiming.lat - aircraft.lat) > 0.000001 ||
          Math.abs(previousTiming.lon - aircraft.lon) > 0.000001;
        let durationMs = previousTiming?.durationMs ?? MIN_AIRCRAFT_ANIMATION_MS;
        if (positionChanged) {
          const now = performance.now();
          const elapsed = previousTiming ? now - previousTiming.receivedAt : durationMs;
          durationMs = Math.min(MAX_AIRCRAFT_ANIMATION_MS, Math.max(MIN_AIRCRAFT_ANIMATION_MS, elapsed));
          aircraftMotionTiming.set(aircraft.icaoHex, { lat: aircraft.lat, lon: aircraft.lon, receivedAt: now, durationMs });
        }
        const previousTarget = aircraftAnimationTargets.get(aircraft.icaoHex);
        if (!previousTarget || Math.abs(previousTarget[0] - target[0]) > 0.000001 || Math.abs(previousTarget[1] - target[1]) > 0.000001) {
          animate(aircraft.icaoHex, marker, target, durationMs);
          aircraftAnimationTargets.set(aircraft.icaoHex, target);
        }
      }
      const root = marker.getElement();
      root.setAttribute("aria-label", labelForAircraft(aircraft));
      root.setAttribute("aria-pressed", String(aircraft.icaoHex === selectedHex));
      root.classList.toggle("selected", aircraft.icaoHex === selectedHex);
      root.classList.toggle("watchlisted", isWatchlisted(aircraft));
      root.classList.toggle("emergency", Boolean(aircraft.emergency));
      root.style.visibility = showAircraft ? "visible" : "hidden";
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
        label.textContent = labelText ?? "";
        label.hidden = labelText === null;
      }
      // readsb's track is clockwise from geographic north. Let MapLibre apply
      // it in map coordinates, so it remains correct when the user rotates map.
      if (aircraft.track !== null) marker.setRotation(aircraft.track);
    }

    for (const [hex, marker] of aircraftMarkersRef.current) {
      if (!currentHexes.has(hex)) {
        if (hex === selectedHex && selectedAircraftVisible && selectedTrailForMap.length > 0) {
          const lastKnown = selectedTrailForMap[selectedTrailForMap.length - 1];
          marker.setLngLat([lastKnown.lon, lastKnown.lat]);
          marker.getElement().style.visibility = showAircraft ? "visible" : "hidden";
          continue;
        }
        const frame = animationFramesRef.current.get(hex);
        if (frame) cancelAnimationFrame(frame);
        animationFramesRef.current.delete(hex);
        aircraftMotionTiming.delete(hex);
        aircraftAnimationTargets.delete(hex);
        marker.remove();
        aircraftMarkersRef.current.delete(hex);
      }
    }

    const selected = selectedAircraftVisible ? selectedAircraftInSnapshot : undefined;
    const trailSource = map.getSource("selected-trail") as GeoJSONSource | undefined;
    trailSource?.setData(selectedTrailForMap.length > 1
      ? { type: "Feature", properties: { icaoHex: selectedHex }, geometry: { type: "LineString", coordinates: selectedTrailForMap.map((point) => [point.lon, point.lat]) } }
      : { type: "FeatureCollection", features: [] });
    for (const layer of ["selected-trail-line", ROUTE_V2_COMPLETED_LAYER_ID, ROUTE_V2_REMAINING_LAYER_ID, ROUTE_V2_AIRPORT_CIRCLE_LAYER_ID, ROUTE_V2_AIRPORT_LABEL_LAYER_ID] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", selectedAircraftVisible ? "visible" : "none");
    }
    const routeSource = map.getSource(ROUTE_V2_SOURCE_ID) as GeoJSONSource | undefined;
    routeSource?.setData(createRouteGeoJSON(
      selected?.enrichment?.route,
      selected && selected.lat !== null && selected.lon !== null ? { lat: selected.lat, lon: selected.lon } : null,
    ));
    const routeAirportSource = map.getSource(ROUTE_V2_AIRPORT_SOURCE_ID) as GeoJSONSource | undefined;
    routeAirportSource?.setData(createRouteAirportGeoJSON(selected?.enrichment?.route));
  }, [colorMode, filteredAircraft, isWatchlisted, mapZoom, selectedHistoryTrail, showAircraft, snapshot.aircraft, snapshot.receiver.lat, snapshot.receiver.lon, selectedHex, mapReady, selectAircraft]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const atcSource = map.getSource("atc-sectors") as GeoJSONSource | undefined;
    atcSource?.setData(createAtcGeoJSON(atcData.sectors, showAtc));
    const transmitterSource = map.getSource("atc-transmitters") as GeoJSONSource | undefined;
    transmitterSource?.setData({
      type: "FeatureCollection",
      features: showAtc ? atcData.transmitters.map((transmitter) => ({
        type: "Feature" as const,
        properties: { name: transmitter.name, service: formatAtcService(transmitter.service), frequency: formatAtcFrequency(transmitter.frequencyMhz), notes: formatAtcNote(transmitter.notes), source: transmitter.source, sourceReference: transmitter.sourceReference, validFrom: transmitter.validFrom, validTo: transmitter.validTo, lastVerifiedAt: transmitter.lastVerifiedAt },
        geometry: { type: "Point" as const, coordinates: [transmitter.longitude, transmitter.latitude] },
      })) : [],
    });
    const selectedRoute = snapshot.aircraft.find((aircraft) => aircraft.icaoHex === selectedHex)?.enrichment?.route;
    const selectedRouteAirportCodes = new Set(
      [selectedRoute?.originAirport?.icaoCode, selectedRoute?.destinationAirport?.icaoCode]
        .filter((icao): icao is string => Boolean(icao))
        .map((icao) => icao.trim().toUpperCase()),
    );
    const airportSource = map.getSource("route-airports") as GeoJSONSource | undefined;
    airportSource?.setData(createAirportGeoJSON(airports, selectedRouteAirportCodes));
    const routeAirportSource = map.getSource(ROUTE_V2_AIRPORT_SOURCE_ID) as GeoJSONSource | undefined;
    routeAirportSource?.setData(createRouteAirportGeoJSON(selectedRoute));
    for (const layer of ["atc-sectors-fill", "atc-sectors-line", "atc-sectors-label", "atc-transmitters-circle"] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", showAtc ? "visible" : "none");
    }
  }, [airports, atcData, mapReady, selectedHex, showAtc, snapshot.aircraft]);

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
  const selectedAircraft = selectedAircraftSnapshot && aircraftDetail?.liveEnrichment
    ? { ...selectedAircraftSnapshot, enrichment: aircraftDetail.liveEnrichment }
    : selectedAircraftSnapshot;
  const selectedDatabaseAircraft = aircraftDetail?.aircraft ?? null;
  const selectedIdentity = selectedAircraft?.icaoHex ?? selectedDatabaseAircraft?.icaoHex ?? selectedHex;

  const selectedAircraftVisible = Boolean(selectedAircraft && filteredAircraft.some((aircraft) => aircraft.icaoHex === selectedAircraft.icaoHex));
  const hasActiveMapFilters = isMapAircraftFilterActive(mapFilters)
    || search.trim() !== ""
    || distanceFilter !== "all"
    || watchlistOnly;
  const activeFilterCount = [
    mapFilters.status !== "all",
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
  const receiverStatusLabel = statusOffline ? t.status.receiverOffline : isDemo ? t.status.mockReceiver : streamConnected ? t.status.liveReceiver : t.status.connecting;
  const receiverStatusShort = statusOffline ? t.status.offlineShort : isDemo ? t.status.demoShort : streamConnected ? t.status.liveShort : t.status.connectingShort;
  const displayedAircraftCount = snapshot.coverageStats?.displayedAircraft ?? snapshot.stats.currentAircraft;
  const networkStatus = snapshot.sources?.adsbLol.status;
  const networkNotice = activeCoverage === "extended" && networkStatus === "rate_limited"
    ? t.radar.networkRateLimited
    : activeCoverage === "extended" && networkStatus && ["timeout", "http_error", "invalid_response", "stale"].includes(networkStatus)
      ? t.radar.networkUnavailable
      : null;

  function chooseCoverage(nextCoverage: CoverageMode): void {
    if (!networkEnabled && nextCoverage === "extended") return;
    setCoverage(nextCoverage);
  }

  return (
    <main className="radar-shell">
      <header className="topbar">
        <div className="brand">
          <LogoMark />
          <div>
            <h1 className="brand-title">AirRadar</h1>
            <div className="brand-subtitle">{t.brand.subtitle}</div>
          </div>
        </div>
        <GlobalSearch />
        <details className="mobile-main-nav">
          <summary aria-label={t.system.navigation}>☰</summary>
          <nav aria-label={t.statistics.navigation}>
            <Link href="/alerts">{t.alerts.title}</Link>
            <Link href="/recap/daily">{t.recap.daily}</Link>
            <Link href="/recap/weekly">{t.recap.weekly}</Link>
            <Link href="/watchlist">{t.watchlist.title}</Link>
            <Link href="/fleet">{t.fleet.title}</Link>
            <Link href="/statistics">{t.statistics.title}</Link>
            <Link href="/history">{t.history.title}</Link>
            <Link href="/system">{t.system.title}</Link>
          </nav>
        </details>
        <Link className="mobile-system-link" href="/system" aria-label={t.system.title}>⚙</Link>
        <nav className="topbar-nav" aria-label={t.statistics.navigation}>
          <Link className="topbar-nav-primary" href="/">{t.radar.liveAirPicture}</Link>
          <Link className="topbar-nav-primary" href="/history">{t.history.title}</Link>
          <Link className="topbar-nav-primary" href="/statistics">{t.statistics.title}</Link>
          <Link className="topbar-nav-primary" href="/fleet">{t.fleet.title}</Link>
          <details className="topbar-nav-more">
            <summary>{t.common.more}</summary>
            <div>
              <Link href="/alerts">{t.alerts.title}</Link>
              <Link href="/recap/daily">{t.recap.daily}</Link>
              <Link href="/recap/weekly">{t.recap.weekly}</Link>
              <Link href="/watchlist">{t.watchlist.title}</Link>
              <Link href="/system">{t.system.title}</Link>
            </div>
          </details>
        </nav>
        <div className="topbar-meta">
          <span className="topbar-receiver"><span className="topbar-receiver-label">{t.status.receiverLabel}</span><span className="topbar-receiver-name">{snapshot.receiver.name}</span></span>
          <span className={`status-pill ${statusOffline ? "offline" : isDemo ? "demo" : ""}`} title={receiverStatusLabel} aria-label={receiverStatusLabel}>
            <span className="status-dot" />
            {receiverStatusShort}
          </span>
          <details className="topbar-secondary-status">
            <summary>{t.status.secondaryStatus}</summary>
            <div>
              <span>{snapshot.receiver.lat === null || snapshot.receiver.lon === null ? t.common.unavailable : `${snapshot.receiver.lat.toFixed(4)}, ${snapshot.receiver.lon.toFixed(4)}`}</span>
              {serverAlertsEnabled !== null && <span>{serverAlertsEnabled ? t.status.serverAlertsActive : t.status.serverAlertsDisabled}</span>}
            </div>
          </details>
        </div>
      </header>

      <section className="radar-content">
        <div className="map-panel">
          <div ref={mapContainerRef} className="map-container" />
          <div className="map-overlay">
            <div className="map-overlay-card map-summary-card">
              <div className="map-summary-item"><strong>{formatNumber(displayedAircraftCount)}</strong><span>{t.stats.trackingNow}</span></div>
              <div className="map-summary-item"><strong>{snapshot.stats.messagesPerSecond === null ? t.common.emptyValue : `${formatNumber(snapshot.stats.messagesPerSecond, 1)}/s`}</strong><span>{t.statistics.messagesPerSecond}</span></div>
              <div className="map-summary-item"><strong>{formatDistance(snapshot.stats.maxDistanceKm)}</strong><span>{t.stats.maxDistance}</span></div>
            </div>
            {networkNotice && <div className="map-overlay-card network-notice">{networkNotice}</div>}
            {networkEnabled && <div className="map-overlay-card network-attribution">{t.radar.networkAttribution}</div>}
            {showRangeRings && snapshot.receiver.lat !== null && snapshot.receiver.lon !== null && <div className="map-overlay-card range-legend">
              {RANGE_RING_RADII_KM.map((radiusKm) => <span key={radiusKm}><i className="legend-dot" /> {radiusKm} km</span>)}
            </div>}
            {colorMode !== "default" && <div className="map-overlay-card color-mode-legend">
              <strong>{t.layers.colorModes[colorMode]}</strong>
              <span><i className="color-legend-swatch low" /> {t.layers.colorLegendLow}</span>
              <span><i className="color-legend-swatch high" /> {t.layers.colorLegendHigh}</span>
              <span><i className="color-legend-swatch fallback" /> {t.layers.colorLegendFallback}</span>
            </div>}
            {selectedAircraftVisible && selectedAircraft?.enrichment?.route && <div className="map-overlay-card layer-legend">
              <span><i className="legend-line completed" /> {t.route.originToCurrent}</span>
              <span><i className="legend-line remaining" /> {t.route.currentToDestination}</span>
              <small>{t.route.contextDisclaimer}</small>
            </div>}
            <details className="map-layers">
              <summary>{t.layers.title}</summary>
              <div className="map-layers-menu" role="group" aria-label={t.layers.title}>
                <label><input type="checkbox" checked={showAircraft} onChange={(event) => setShowAircraft(event.target.checked)} /> {t.layers.aircraft}</label>
                <label><input type="checkbox" checked={showRangeRings} onChange={(event) => setShowRangeRings(event.target.checked)} /> {t.layers.rangeRings}</label>
                <label className="map-layer-mode"><span>{t.layers.colorMode}</span><select value={colorMode} aria-label={t.layers.colorMode} onChange={(event) => setColorMode(event.target.value as AircraftColorMode)}>
                  <option value="default">{t.layers.colorModes.default}</option>
                  <option value="altitude">{t.layers.colorModes.altitude}</option>
                  <option value="speed">{t.layers.colorModes.speed}</option>
                  <option value="verticalRate">{t.layers.colorModes.verticalRate}</option>
                </select></label>
                <label><input type="checkbox" checked={showAirports} onChange={(event) => setShowAirports(event.target.checked)} /> {t.layers.airports}</label>
                <label className="map-layer-sublevel"><input type="checkbox" checked={showSignificantAirports} disabled={!showAirports} onChange={(event) => setShowSignificantAirports(event.target.checked)} /> {t.layers.significantAirports}</label>
                <label className="map-layer-sublevel"><input type="checkbox" checked={showSmallAirports} disabled={!showAirports} onChange={(event) => setShowSmallAirports(event.target.checked)} /> {t.layers.smallAirports}</label>
                <label className="map-layer-sublevel"><input type="checkbox" checked={showHeliports} disabled={!showAirports} onChange={(event) => setShowHeliports(event.target.checked)} /> {t.layers.heliports}</label>
                <label><input type="checkbox" checked={showAtc} onChange={(event) => setShowAtc(event.target.checked)} /> {t.layers.atc}</label>
              </div>
            </details>
          </div>
        </div>

        <aside className={`sidebar ${mobileCompact ? "compact" : ""} ${selectedAircraft ? "has-selection" : ""}`}>
          <div className="sidebar-heading">
              <div>
                <div className="sidebar-title">{t.radar.aircraftNearby}</div>
                <div className="sidebar-count">{visibleAircraft(filteredAircraft.length, snapshot.aircraft.length)}</div>
                {networkEnabled && <div className="coverage-switch" role="group" aria-label={t.radar.coverageExtended}>
                  <button type="button" className={activeCoverage === "local" ? "active" : ""} aria-pressed={activeCoverage === "local"} onClick={() => chooseCoverage("local")}>{t.radar.coverageLocal}</button>
                  <button type="button" className={activeCoverage === "extended" ? "active" : ""} aria-pressed={activeCoverage === "extended"} onClick={() => chooseCoverage("extended")}>{t.radar.coverageExtended}</button>
                </div>}
                {activeCoverage === "extended" && snapshot.coverageStats && <div className="coverage-subcount">{t.radar.localOnlyCount(formatNumber(snapshot.coverageStats.localAircraft))} · {t.radar.networkOnlyCount(formatNumber(snapshot.coverageStats.networkOnlyAircraft))}</div>}
              </div>
              <button className="icon-button mobile-collapse" onClick={() => setMobileCompact((value) => !value)} aria-expanded={!mobileCompact} aria-label={mobileCompact ? t.radar.expandAircraftPanel : t.radar.collapseAircraftPanel}>
                {mobileCompact ? "↑" : "↓"}
              </button>
            </div>
          <LogbookSummary />
          <div className="sidebar-browse">
          <div className="sidebar-header">
            <div className="search-wrap">
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input ref={searchInputRef} className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search.placeholder} aria-label={t.search.aircraftLabel} />
            </div>
            <div className="radar-options">
              <button type="button" className="filter-button" aria-expanded={filtersOpen} aria-controls="map-filters-panel" onClick={() => setFiltersOpen((value) => !value)}>
                <span>{t.filters.title}{hasActiveMapFilters ? ` · ${activeFilterCount}` : ""}</span>
                {hasActiveMapFilters && <span className="filter-active-dot" aria-label={t.filters.reset}>ACTIVE</span>}
              </button>
              {filtersOpen && <div id="map-filters-panel" className="map-filters-panel" role="region" aria-label={t.filters.title}>
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
                <div className="map-filter-legacy-row">
                  <label className="map-filter-field"><span>{t.filters.sortLabel}</span><select className="filter-select" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="distance">{t.filters.sortDistance}</option><option value="altitude">{t.filters.sortAltitude}</option><option value="callsign">{t.filters.sortCallsign}</option></select></label>
                  <label className="map-filter-field"><span>{t.filters.maximumDistance}</span><select className="filter-select" value={distanceFilter} onChange={(event) => setDistanceFilter(event.target.value)}><option value="all">{t.filters.distanceAll}</option><option value="25">{t.filters.distanceWithin25}</option><option value="75">{t.filters.distanceWithin75}</option></select></label>
                </div>
                <button type="button" className="filter-reset-button" onClick={resetMapFilters}>{t.filters.reset}</button>
              </div>}
            <details className="watchlist-box">
              <summary>{t.watchlist.title} <span>{watchlistSummary(watchlist.length)}</span></summary>
              <form onSubmit={addWatchlistRule} className="watchlist-form">
                <select value={watchlistKind} onChange={(event) => setWatchlistKind(event.target.value)} aria-label={t.watchlist.ruleType}>
                  <option value="icao">{t.watchlist.ruleKinds.icao}</option><option value="registration">{t.watchlist.ruleKinds.registration}</option><option value="callsign">{t.watchlist.exactCallsign}</option><option value="pattern">{t.watchlist.callsignPattern}</option><option value="type">{t.watchlist.ruleKinds.type}</option><option value="airline">{t.watchlist.ruleKinds.airline}</option>
                </select>
                <input value={watchlistValue} onChange={(event) => setWatchlistValue(event.target.value)} placeholder={watchlistKind === "pattern" ? "UAE*" : "A6-EVL"} aria-label={t.watchlist.value} />
                <button type="submit" className="watchlist-add">{t.watchlist.add}</button>
              </form>
              {watchlist.length > 0 && <div className="watchlist-rules">{watchlist.map((rule) => <button key={`${rule.kind}-${rule.value}`} type="button" onClick={() => setWatchlist((current) => current.filter((item) => item !== rule))}>{watchlistKindLabel(rule.kind)}: {rule.value} ×</button>)}</div>}
            </details>
            <div className="stats-row">
              <div className="stat-card"><div className="stat-value">{formatNumber(displayedAircraftCount)}</div><div className="stat-label">{t.stats.trackingNow}</div></div>
              <div className="stat-card"><div className="stat-value">{formatNumber(snapshot.stats.aircraftSeenToday)}</div><div className="stat-label">{t.stats.seenToday}</div></div>
              <div className="stat-card"><div className="stat-value">{formatDistance(snapshot.stats.maxDistanceKm)}</div><div className="stat-label">{t.stats.maxDistance}</div></div>
            </div>
            <div className="stats-secondary">{secondaryStats(snapshot.stats.uniqueAircraftToday, snapshot.stats.maxConcurrentAircraft, snapshot.stats.messagesPerSecond)}</div>
            <details className="stats-breakdowns">
              <summary>{t.stats.trafficMix}</summary>
              <div><strong>{t.stats.aircraftTypes}</strong>{snapshot.stats.aircraftTypes.length ? snapshot.stats.aircraftTypes.slice(0, 5).map((item) => <span key={item.name}>{item.name} · {formatNumber(item.count)}</span>) : <span>{t.common.emptyValue}</span>}</div>
              <div><strong>{t.stats.airlines}</strong>{snapshot.stats.airlines.length ? snapshot.stats.airlines.slice(0, 5).map((item) => <span key={item.name}>{item.name} · {formatNumber(item.count)}</span>) : <span>{t.common.emptyValue}</span>}</div>
            </details>
          </div>
          </div>

          <RelevantAtcPanel summaries={snapshot.relevantAtcFrequencies} expanded={!mobileCompact} onOpen={() => setMobileCompact(false)} />

          <div className="aircraft-list">
            {filteredAircraft.length === 0 ? (
              <div className="empty-list">
                <strong>{snapshot.aircraft.length === 0 ? t.radar.waitingForTraffic : t.radar.noMatchingAircraft}</strong>
                {snapshot.aircraft.length === 0 ? t.radar.waitingForTrafficDescription : t.radar.noMatchingAircraftDescription}
              </div>
            ) : filteredAircraft.map((aircraft) => (
              <button key={aircraft.icaoHex} className={`aircraft-row ${selectedHex === aircraft.icaoHex ? "selected" : ""} ${isWatchlisted(aircraft) ? "watchlisted" : ""} ${aircraft.emergency ? "emergency" : ""}`} aria-pressed={selectedHex === aircraft.icaoHex} onClick={() => selectAircraft(aircraft.icaoHex)}>
                <span className="aircraft-row-icon"><AircraftIcon aircraft={aircraft} /></span>
                <span className="aircraft-row-main">
                  <span className="aircraft-row-topline"><span className="aircraft-row-name">{labelForAircraft(aircraft)}</span> <span className="source-badge">{aircraftPositionSourceLabel(aircraft)}</span> {isWatchlisted(aircraft) && <span className="watch-badge">{t.watchlist.badge}</span>} {aircraft.emergency && <span className="emergency-badge"><span aria-hidden="true">!</span> {aircraft.emergency}</span>}</span>
                  <span className="aircraft-row-type">{aircraft.enrichment?.metadata?.icaoTypeCode || aircraft.aircraftType || t.aircraft.unknownType}{aircraft.registration || aircraft.enrichment?.metadata?.registration ? ` · ${aircraft.registration || aircraft.enrichment?.metadata?.registration}` : ""}</span>
                  <span className="aircraft-row-meta"><span><b>{formatAltitude(aircraft.altitude)}</b></span><span><b>{formatSpeed(aircraft.groundSpeed)}</b></span><span><b>{formatTrack(aircraft.track)}</b></span><span className="aircraft-row-hex">{aircraft.icaoHex}</span></span>
                </span>
                <span className="aircraft-row-distance">{formatDistance(aircraft.distanceKm)}</span>
              </button>
            ))}
          </div>

          </div>

          {(selectedAircraft || selectedDatabaseAircraft) && (
            <div className="detail-panel" key={selectedIdentity}>
              <div className="detail-heading">
                <div><div className="detail-eyebrow">{t.history.aircraftDetail}</div><div className="detail-callsign">{selectedAircraft ? labelForAircraft(selectedAircraft) : selectedIdentity}</div>
                  <div className="detail-registration">{selectedAircraft ? `${selectedAircraft.icaoHex} · ${selectedAircraft.registration || selectedAircraft.enrichment?.metadata?.registration || t.common.emptyValue}` : t.aircraft.notCurrentlyInRange}</div>
                </div>
                <button className="close-button" onClick={() => setSelectedHex(null)} aria-label={t.history.closeAircraftDetails}>×</button>
              </div>
              {selectedAircraft ? <div className="detail-content">
              <div className="detail-hero">
                {selectedAircraft.enrichment?.route && <div className="detail-hero-route"><RouteContextRow aircraft={selectedAircraft} route={selectedAircraft.enrichment.route} /></div>}
                <div className="detail-hero-type">{selectedAircraft.enrichment?.metadata?.aircraftDescription || selectedAircraft.aircraftDescription || selectedAircraft.enrichment?.metadata?.icaoTypeCode || selectedAircraft.aircraftType || t.aircraft.unknownType}</div>
                <div className="detail-hero-metrics">
                  <div><strong>{formatAltitude(selectedAircraft.altitude)}</strong><span>{t.aircraft.altitude}</span></div>
                  <div><strong>{formatSpeed(selectedAircraft.groundSpeed)}</strong><span>{t.aircraft.groundSpeed}</span></div>
                  <div><strong>{formatTrack(selectedAircraft.track)}</strong><span>{t.aircraft.track}</span></div>
                  <div><strong>{selectedAircraft.verticalRate === null ? t.common.emptyValue : `${selectedAircraft.verticalRate > 0 ? "+" : ""}${formatNumber(selectedAircraft.verticalRate)} ft/min`}</strong><span>{t.aircraft.verticalRate}</span></div>
                </div>
              </div>
              {selectedAircraft.enrichment?.route?.originAirport && <AirportWeatherDisclosure airport={selectedAircraft.enrichment.route.originAirport} />}
              {selectedAircraft.enrichment?.route?.destinationAirport && <AirportWeatherDisclosure airport={selectedAircraft.enrichment.route.destinationAirport} />}
              <DetailSection title={t.history.aircraftDetail}>
                <DetailItem label={t.aircraft.icaoHex} value={selectedAircraft.icaoHex} />
                <DetailItem label={t.aircraft.registration} value={selectedAircraft.registration || selectedAircraft.enrichment?.metadata?.registration || selectedDatabaseAircraft?.registration || t.common.emptyValue} />
                <DetailItem label={t.aircraft.currentCallsign} value={selectedAircraft.callsign || t.common.emptyValue} />
                <DetailItem label={t.aircraft.aircraftType} value={selectedAircraft.enrichment?.metadata?.icaoTypeCode || selectedAircraft.aircraftType || selectedDatabaseAircraft?.aircraftType || t.common.emptyValue} />
                <DetailItem label={t.aircraft.manufacturer} value={selectedAircraft.enrichment?.metadata?.manufacturer || selectedDatabaseAircraft?.manufacturer || t.common.emptyValue} />
                <DetailItem label={t.aircraft.modelType} value={selectedAircraft.enrichment?.metadata?.aircraftDescription || selectedAircraft.aircraftDescription || selectedDatabaseAircraft?.model || t.common.emptyValue} />
                <DetailItem label={t.aircraft.operator} value={selectedAircraft.enrichment?.metadata?.operator || selectedDatabaseAircraft?.operator || t.common.emptyValue} />
                <DetailItem label={t.aircraft.registrationCountry} value={registrationCountryForAircraft(selectedAircraft) || selectedDatabaseAircraft?.registrationCountryCode || selectedDatabaseAircraft?.registrationCountry || t.common.emptyValue} />
              </DetailSection>
              <DetailSection title={t.aircraft.liveAdsb}>
                <DetailItem label={t.aircraft.altitude} value={formatAltitude(selectedAircraft.altitude)} />
                <DetailItem label={t.aircraft.groundSpeed} value={formatSpeed(selectedAircraft.groundSpeed)} />
                <DetailItem label={t.aircraft.track} value={formatTrack(selectedAircraft.track)} />
                <DetailItem label={t.aircraft.distance} value={formatDistance(selectedAircraft.distanceKm)} />
                <DetailItem label={t.aircraft.squawk} value={selectedAircraft.squawk || t.common.emptyValue} />
                <DetailItem label={t.aircraft.source} value={selectedAircraft.source} />
                <DetailItem label={t.aircraft.seenBy} value={aircraftDataSourceLabel(selectedAircraft)} />
                <DetailItem label={t.aircraft.positionSource} value={aircraftPositionSourceLabel(selectedAircraft)} />
                <DetailItem label={t.aircraft.lastObservation} value={formatAge(selectedAircraft.seenSeconds)} />
              </DetailSection>
              <DetailSection title={t.atc.estimate}>
                {selectedAircraft.atc ? <>
                  <div className="detail-atc-probable">{t.atc.probableRelevant}</div>
                  <DetailItem label={t.atc.sectorService} value={`${selectedAircraft.atc.name} · ${formatAtcService(selectedAircraft.atc.service || selectedAircraft.atc.callsign)}`} />
                  <DetailItem label={t.atc.primaryFrequency} value={formatAtcFrequency(selectedAircraft.atc.primaryFrequencyMhz)} />
                  <DetailItem label={t.atc.alternates} value={selectedAircraft.atc.alternateFrequenciesMhz.map((frequency) => formatAtcFrequency(frequency)).join(", ") || t.common.emptyValue} />
                  <DetailItem label={t.atc.lowerLimit} value={formatAtcLimit(selectedAircraft.atc.lowerAltitudeFt, selectedAircraft.atc.lowerAltitudeReference, t.common.unlimited)} />
                  <DetailItem label={t.atc.upperLimit} value={formatAtcLimit(selectedAircraft.atc.upperAltitudeFt, selectedAircraft.atc.upperAltitudeReference, t.common.unlimited)} />
                  <DetailItem label={t.atc.source} value={selectedAircraft.atc.source} />
                  <DetailItem label={t.atc.sourceReference} value={selectedAircraft.atc.sourceReference} />
                  <DetailItem label={t.atc.effectiveDate} value={formatDateTime(selectedAircraft.atc.validFrom)} />
                  <DetailItem label={t.atc.validTo} value={formatDateTime(selectedAircraft.atc.validTo)} />
                  <DetailItem label={t.atc.lastVerified} value={formatDateTime(selectedAircraft.atc.lastVerifiedAt)} />
                  <DetailItem label={t.atc.confidence} value={formatAtcConfidence(selectedAircraft.atc.confidence)} />
                  {selectedAircraft.atc.altitudeConfidence === "unknown" && <DetailItem label={t.atc.altitudeConfidence} value={t.atc.altitudeConfidenceValues.unknown} />}
                  <div className="detail-disclaimer">{t.atc.probableFrequency}</div>
                </> : <div className="detail-disclaimer">{t.atc.noMatchingSector}</div>}
              </DetailSection>
              <details className="detail-more"><summary>{t.aircraft.liveAdsb}</summary><div className="detail-grid">
                <DetailItem label={t.aircraft.icaoHex} value={selectedAircraft.icaoHex} />
                <DetailItem label={t.aircraft.baroGeomAltitude} value={`${formatAltitude(selectedAircraft.baroAltitude)} / ${formatAltitude(selectedAircraft.geomAltitude)}`} />
                <DetailItem label={t.aircraft.verticalRate} value={selectedAircraft.verticalRate === null ? t.common.emptyValue : `${formatNumber(selectedAircraft.verticalRate)} ft/min`} />
                <DetailItem label={t.aircraft.baroGeomRate} value={`${selectedAircraft.baroRate === null ? t.common.emptyValue : `${formatNumber(selectedAircraft.baroRate)} ft/min`} / ${selectedAircraft.geomRate === null ? t.common.emptyValue : `${formatNumber(selectedAircraft.geomRate)} ft/min`}`} />
                <DetailItem label={t.aircraft.category} value={selectedAircraft.category || t.common.emptyValue} />
                <DetailItem label={t.aircraft.rssi} value={selectedAircraft.rssi === null ? t.common.emptyValue : `${formatNumber(selectedAircraft.rssi, 1)} dBFS`} />
                <DetailItem label={t.aircraft.messages} value={formatNumber(selectedAircraft.messages)} />
                <DetailItem label={t.aircraft.seenPosition} value={`${formatAge(selectedAircraft.seenSeconds)} / ${formatAge(selectedAircraft.seenPosSeconds)}`} />
                <DetailItem label={t.aircraft.bearing} value={formatTrack(selectedAircraft.bearing)} />
                <DetailItem label={t.aircraft.position} value={selectedAircraft.lat === null || selectedAircraft.lon === null ? t.common.emptyValue : `${formatCoordinate(selectedAircraft.lat)}, ${formatCoordinate(selectedAircraft.lon)}`} />
                <DetailItem label={t.aircraft.readsbSourceType} value={selectedAircraft.sourceType || t.common.emptyValue} />
                <DetailItem label={t.aircraft.emergency} value={selectedAircraft.emergency || t.common.notReported} />
              </div></details>
              <details className="detail-more"><summary>{t.aircraft.metadata}</summary>
              <DetailSection title={t.aircraft.metadata}>
                <DetailItem label={t.aircraft.icaoHex} value={selectedAircraft.icaoHex} />
                <DetailItem label={t.aircraft.registration} value={selectedAircraft.registration || selectedAircraft.enrichment?.metadata?.registration || t.common.emptyValue} />
                <DetailItem label={t.aircraft.manufacturer} value={selectedAircraft.enrichment?.metadata?.manufacturer || t.common.emptyValue} />
                <DetailItem label={t.aircraft.modelType} value={selectedAircraft.enrichment?.metadata?.aircraftDescription || selectedAircraft.aircraftDescription || t.common.emptyValue} />
                <DetailItem label={t.aircraft.icaoType} value={selectedAircraft.enrichment?.metadata?.icaoTypeCode || selectedAircraft.aircraftType || t.common.emptyValue} />
                <DetailItem label={t.aircraft.flags} value={selectedAircraft.enrichment?.metadata?.flags || t.common.emptyValue} />
                <DetailItem label={t.aircraft.year} value={selectedAircraft.enrichment?.metadata?.year || t.common.emptyValue} />
                <DetailItem label={t.aircraft.operator} value={selectedAircraft.enrichment?.metadata?.operator || t.common.emptyValue} />
                <DetailItem label={t.aircraft.registrationCountry} value={registrationCountryForAircraft(selectedAircraft) || t.common.emptyValue} />
                <DetailItem label={t.route.source} value={selectedAircraft.enrichment?.route?.source || t.common.emptyValue} />
              </DetailSection>
              </details>
              <AircraftRecentFlights recentFlights={aircraftDetail?.recentFlights ?? []} loading={aircraftDetailLoading} error={aircraftDetailError} />
              {selectedAircraft.enrichment?.flightPlan && <DetailSection title={t.flightPlan.title}>
                <DetailItem label={t.flightPlan.scheduledDeparture} value={selectedAircraft.enrichment.flightPlan.scheduledDeparture || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.actualDeparture} value={selectedAircraft.enrichment.flightPlan.actualDeparture || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.scheduledArrival} value={selectedAircraft.enrichment.flightPlan.scheduledArrival || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.estimatedArrival} value={selectedAircraft.enrichment.flightPlan.estimatedArrival || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.filedRoute} value={selectedAircraft.enrichment.flightPlan.filedRoute || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.waypoints} value={selectedAircraft.enrichment.flightPlan.waypoints.join(" · ") || t.common.emptyValue} />
              </DetailSection>}
              <div className="watchlist-actions"><button className="watchlist-add" onClick={() => setWatchlist((current) => current.some((rule) => rule.kind === "icao" && rule.value === selectedAircraft.icaoHex) ? current : [...current, { kind: "icao", value: selectedAircraft.icaoHex }])}>{isWatchlisted(selectedAircraft) ? t.watchlist.onWatchlist : t.watchlist.addIcao}</button></div>
              <div className="detail-footer"><span>{t.history.lastSeen} {formatTime(selectedAircraft.lastSeen)}</span><span><Link className="history-link" href={`/aircraft/${encodeURIComponent(selectedAircraft.icaoHex)}`}>{t.history.aircraftDetail} →</Link> <Link className="history-link" href={`/history?hex=${selectedAircraft.icaoHex}`}>{t.history.viewHistory} →</Link></span></div>
              </div> : <div className="detail-content">
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
                <AircraftRecentFlights recentFlights={aircraftDetail?.recentFlights ?? []} loading={aircraftDetailLoading} error={aircraftDetailError} />
                <div className="detail-footer"><Link className="history-link" href={`/aircraft/${encodeURIComponent(selectedIdentity || "")}`}>{t.history.aircraftDetail} →</Link></div>
              </div>}
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === t.common.emptyValue) return null;
  return <div><div className="detail-item-label">{label}</div><div className="detail-item-value">{value}</div></div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3><div className="detail-grid">{children}</div></section>;
}
