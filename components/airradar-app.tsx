"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource, StyleSpecification } from "maplibre-gl";
import { circleCoordinates } from "@/lib/geo";
import {
  aircraftInRange,
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
import type { AircraftView, FlightRoute, PublicReceiverPosition, PublicStateSnapshot, ReceiverPosition, TrailPoint } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import type { AtcDataResponse, AtcSector } from "@/lib/atc/types";
import { RelevantAtcPanel } from "@/components/relevant-atc-panel";
import { matchesAircraftRule, normalizeAircraftRuleType } from "@/lib/aircraft/watchlist";

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
    { id: "background", type: "background", paint: { "background-color": "#0b1725" } },
    { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.58, "raster-saturation": -0.8, "raster-contrast": 0.1 } },
  ],
};

function labelForAircraft(aircraft: AircraftView): string {
  return aircraft.callsign || aircraft.registration || aircraft.enrichment?.metadata?.registration || aircraft.icaoHex;
}

function airlineForAircraft(aircraft: AircraftView): string | null {
  return aircraft.enrichment?.route?.airline ?? aircraft.enrichment?.metadata?.operator ?? null;
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
  return airport.iataCode ? `${airport.iataCode}/${airport.icaoCode}` : airport.icaoCode;
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

function createAirportGeoJSON(airports: Airport[], visible: boolean) {
  const unique = new Map(airports.map((airport) => [airport.icaoCode, airport]));
  return {
    type: "FeatureCollection" as const,
    features: visible ? [...unique.values()].map((airport) => ({
      type: "Feature" as const,
      properties: { code: airport.iataCode ? `${airport.iataCode}/${airport.icaoCode}` : airport.icaoCode, name: airport.name },
      geometry: { type: "Point" as const, coordinates: [airport.longitude, airport.latitude] },
    })) : [],
  };
}

function createRouteGeoJSON(route: FlightRoute | undefined, visible: boolean) {
  const origin = route?.originAirport;
  const destination = route?.destinationAirport;
  if (!visible || !origin || !destination) return { type: "FeatureCollection" as const, features: [] };
  return {
    type: "FeatureCollection" as const,
    features: [{
      type: "Feature" as const,
      properties: { routeType: "published-route-reference" },
      geometry: { type: "LineString" as const, coordinates: [[origin.longitude, origin.latitude], [destination.longitude, destination.latitude]] },
    }],
  };
}

function createRangeGeoJSON(receiver: ReceiverPosition) {
  const features = [25, 50, 100].map((radiusKm) => ({
    type: "Feature" as const,
    properties: { radiusKm },
    geometry: { type: "LineString" as const, coordinates: circleCoordinates(receiver.lat, receiver.lon, radiusKm) },
  }));
  return { type: "FeatureCollection" as const, features };
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
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"distance" | "altitude" | "callsign">("distance");
  const [altitudeFilter, setAltitudeFilter] = useState("all");
  const [distanceFilter, setDistanceFilter] = useState("all");
  const [airborneOnly, setAirborneOnly] = useState(false);
  const [airlineFilter, setAirlineFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [emergencyOnly, setEmergencyOnly] = useState(false);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [watchlist, setWatchlist] = useState<Array<{ kind: string; value: string }>>([]);
  const [watchlistKind, setWatchlistKind] = useState("callsign");
  const [watchlistValue, setWatchlistValue] = useState("");
  const [showAtc, setShowAtc] = useState(false);
  const [showAirports, setShowAirports] = useState(true);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [atcData, setAtcData] = useState<AtcDataResponse>(EMPTY_ATC_DATA);
  const [streamConnected, setStreamConnected] = useState(false);
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
  const receiverRef = useRef<PublicReceiverPosition>(snapshot.receiver);
  const centeredReceiverRef = useRef<ReceiverPosition | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("airradar-watchlist");
      if (stored) setWatchlist(JSON.parse(stored) as Array<{ kind: string; value: string }>);
    } catch {
      // Local storage is optional; the radar remains usable when it is blocked.
    }
    void fetch("/api/atc/sectors", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<AtcDataResponse> : null)
      .then((data) => { if (data) setAtcData(data); })
      .catch(() => undefined);
    void fetch("/api/airports", { cache: "no-store" })
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

  const isWatchlisted = useCallback((aircraft: AircraftView) => watchlist.some((rule) => {
    const value = rule.value.trim().toUpperCase();
    if (!value) return false;
    const type = normalizeAircraftRuleType(rule.kind);
    return type ? matchesAircraftRule(aircraft, { type, value }) : false;
  }), [watchlist]);

  function addWatchlistRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = watchlistValue.trim().toUpperCase();
    if (!value || watchlist.some((rule) => rule.kind === watchlistKind && rule.value === value)) return;
    setWatchlist((current) => [...current, { kind: watchlistKind, value }]);
    setWatchlistValue("");
  }

  const selectAircraft = useCallback((hex: string) => {
    setSelectedHex(hex);
    setMobileCompact(false);
  }, []);

  useEffect(() => {
    let active = true;
    const source = new EventSource("/api/stream");
    const onSnapshot = (event: Event) => {
      try {
        const next = JSON.parse((event as MessageEvent<string>).data) as PublicStateSnapshot;
        if (active) {
          const currentHexes = new Set(next.aircraft.map((aircraft) => aircraft.icaoHex));
          for (const hex of liveTrailsRef.current.keys()) {
            if (!currentHexes.has(hex)) liveTrailsRef.current.delete(hex);
          }
          for (const aircraft of next.aircraft) {
            if (aircraft.lat === null || aircraft.lon === null) continue;
            const trail = liveTrailsRef.current.get(aircraft.icaoHex) ?? [];
            const previous = trail[trail.length - 1];
            if (!previous || Math.abs(previous.lat - aircraft.lat) > 0.00001 || Math.abs(previous.lon - aircraft.lon) > 0.00001) {
              trail.push({
                lat: aircraft.lat,
                lon: aircraft.lon,
                recordedAt: aircraft.lastSeen,
                altitude: aircraft.altitude,
                groundSpeed: aircraft.groundSpeed,
                track: aircraft.track,
              });
              liveTrailsRef.current.set(aircraft.icaoHex, trail.slice(-80));
            }
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
  }, []);

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
      map.addSource("selected-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "selected-route-line", type: "line", source: "selected-route", paint: { "line-color": "#a7b6c7", "line-opacity": 0.72, "line-width": 2, "line-dasharray": [2, 3] } });
      map.addSource("atc-sectors", { type: "geojson", data: createAtcGeoJSON([], false) });
      map.addLayer({ id: "atc-sectors-fill", type: "fill", source: "atc-sectors", layout: { visibility: "none" }, paint: { "fill-color": "#8068ff", "fill-opacity": 0.09 } });
      map.addLayer({ id: "atc-sectors-line", type: "line", source: "atc-sectors", layout: { visibility: "none" }, paint: { "line-color": "#a990ff", "line-opacity": 0.6, "line-width": 1.2, "line-dasharray": [2, 2] } });
      map.addLayer({ id: "atc-sectors-label", type: "symbol", source: "atc-sectors", minzoom: 6.5, layout: { visibility: "none", "text-field": ["get", "name"], "text-font": ["Open Sans Semibold"], "text-size": 10, "text-offset": [0, 0.8], "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": "#d7caff", "text-halo-color": "#08111d", "text-halo-width": 1.2 } });
      map.addSource("atc-transmitters", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "atc-transmitters-circle", type: "circle", source: "atc-transmitters", layout: { visibility: "none" }, paint: { "circle-color": "#f3b95f", "circle-radius": 5, "circle-stroke-color": "#08111d", "circle-stroke-width": 1.5 } });
      map.addSource("route-airports", { type: "geojson", data: createAirportGeoJSON([], false) });
      map.addLayer({ id: "route-airports-circle", type: "circle", source: "route-airports", paint: { "circle-color": "#f3b95f", "circle-radius": 5, "circle-stroke-color": "#08111d", "circle-stroke-width": 1.5 } });
      map.addLayer({ id: "route-airports-label", type: "symbol", source: "route-airports", layout: { "text-field": ["get", "code"], "text-font": ["Open Sans Semibold"], "text-size": 10, "text-offset": [0, 1.2] }, paint: { "text-color": "#f5d494", "text-halo-color": "#08111d", "text-halo-width": 1.2 } });
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
    if (receiver.lat === null || receiver.lon === null) {
      receiverMarkerRef.current?.remove();
      receiverMarkerRef.current = null;
      rings?.setData({ type: "FeatureCollection", features: [] });
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
    rings?.setData(createRangeGeoJSON(receiverWithCoordinates));
    if (shouldRecenterOnReceiver(snapshot.provider, centeredReceiverRef.current, receiver)) {
      map.jumpTo({ center: [receiver.lon, receiver.lat] });
      centeredReceiverRef.current = receiverWithCoordinates;
    }
  }, [mapReady, snapshot.provider, snapshot.receiver]);

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

    for (const aircraft of snapshot.aircraft) {
      if (aircraft.lat === null || aircraft.lon === null) continue;
      currentHexes.add(aircraft.icaoHex);
      let marker = aircraftMarkersRef.current.get(aircraft.icaoHex);
      const target: [number, number] = [aircraft.lon, aircraft.lat];
      if (!marker) {
        const root = document.createElement("div");
        root.className = "aircraft-marker";
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
      const plane = root.querySelector<HTMLElement>(".aircraft-plane");
      if (plane) {
        const markerKind = aircraftMarkerKind(aircraft);
        const iconAsset = aircraftIconAsset(aircraft);
        if (plane.dataset.kind !== markerKind || plane.dataset.iconAsset !== (iconAsset ?? "fallback")) {
          plane.dataset.kind = markerKind;
          plane.dataset.iconAsset = iconAsset ?? "fallback";
          plane.innerHTML = aircraftGlyphMarkup(aircraft);
        }
      }
      // readsb's track is clockwise from geographic north. Let MapLibre apply
      // it in map coordinates, so it remains correct when the user rotates map.
      if (aircraft.track !== null) marker.setRotation(aircraft.track);
    }

    for (const [hex, marker] of aircraftMarkersRef.current) {
      if (!currentHexes.has(hex)) {
        const frame = animationFramesRef.current.get(hex);
        if (frame) cancelAnimationFrame(frame);
        animationFramesRef.current.delete(hex);
        aircraftMotionTiming.delete(hex);
        aircraftAnimationTargets.delete(hex);
        marker.remove();
        aircraftMarkersRef.current.delete(hex);
      }
    }

    const selected = snapshot.aircraft.find((aircraft) => aircraft.icaoHex === selectedHex);
    const selectedTrail = selectedHex ? liveTrailsRef.current.get(selectedHex) : null;
    const trailSource = map.getSource("selected-trail") as GeoJSONSource | undefined;
    trailSource?.setData(selected && selectedTrail && selectedTrail.length > 1
      ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: selectedTrail.map((point) => [point.lon, point.lat]) } }
      : { type: "FeatureCollection", features: [] });
    const routeSource = map.getSource("selected-route") as GeoJSONSource | undefined;
    routeSource?.setData(createRouteGeoJSON(selected?.enrichment?.route, Boolean(selected?.enrichment?.route)));
  }, [isWatchlisted, snapshot.aircraft, snapshot.receiver.lat, snapshot.receiver.lon, selectedHex, mapReady, selectAircraft]);

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
    const routeAirports = snapshot.aircraft.flatMap((aircraft) => {
      const route = aircraft.enrichment?.route;
      return [route?.originAirport, route?.destinationAirport].filter((airport): airport is Airport => Boolean(airport));
    });
    const airportSource = map.getSource("route-airports") as GeoJSONSource | undefined;
    airportSource?.setData(createAirportGeoJSON([...airports, ...routeAirports], showAirports));
    for (const layer of ["atc-sectors-fill", "atc-sectors-line", "atc-sectors-label", "atc-transmitters-circle"] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", showAtc ? "visible" : "none");
    }
  }, [airports, atcData, mapReady, showAirports, showAtc, snapshot.aircraft]);

  const selectedAircraft = snapshot.aircraft.find((aircraft) => aircraft.icaoHex === selectedHex) ?? null;
  const filterOptions = useMemo(() => ({
    airlines: [...new Set(snapshot.aircraft.map(airlineForAircraft).filter((value): value is string => Boolean(value)))].sort(),
    types: [...new Set(snapshot.aircraft.map((aircraft) => aircraft.enrichment?.metadata?.icaoTypeCode ?? aircraft.aircraftType).filter((value): value is string => Boolean(value)))].sort(),
    countries: [...new Set(snapshot.aircraft.map(registrationCountryForAircraft).filter((value): value is string => Boolean(value)))].sort(),
  }), [snapshot.aircraft]);
  const filteredAircraft = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = snapshot.aircraft.filter((aircraft) => {
      const searchable = [aircraft.callsign, aircraft.registration, aircraft.icaoHex].filter(Boolean).join(" ").toLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (airborneOnly && aircraft.onGround) return false;
      if (altitudeFilter !== "all" && (aircraft.altitude === null || aircraft.altitude < Number(altitudeFilter))) return false;
      if (distanceFilter !== "all" && (aircraft.distanceKm === null || aircraft.distanceKm > Number(distanceFilter))) return false;
      if (airlineFilter !== "all" && airlineForAircraft(aircraft) !== airlineFilter) return false;
      if (typeFilter !== "all" && (aircraft.enrichment?.metadata?.icaoTypeCode ?? aircraft.aircraftType) !== typeFilter) return false;
      if (countryFilter !== "all" && registrationCountryForAircraft(aircraft) !== countryFilter) return false;
      if (emergencyOnly && !aircraft.emergency) return false;
      if (watchlistOnly && !isWatchlisted(aircraft)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sortBy === "callsign") return labelForAircraft(a).localeCompare(labelForAircraft(b));
      if (sortBy === "altitude") return (b.altitude ?? -Infinity) - (a.altitude ?? -Infinity);
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    });
  }, [airborneOnly, airlineFilter, altitudeFilter, countryFilter, distanceFilter, emergencyOnly, isWatchlisted, search, snapshot.aircraft, sortBy, typeFilter, watchlistOnly]);

  const isDemo = snapshot.provider === "mock";
  const hasSourceSnapshot = snapshot.lastSourceUpdate !== null;
  const statusOffline = !isDemo && hasSourceSnapshot && !snapshot.sourceOnline;

  return (
    <main className="radar-shell">
      <header className="topbar">
        <div className="brand">
          <LogoMark />
          <div>
            <div className="brand-title">AirRadar</div>
            <div className="brand-subtitle">{t.brand.subtitle}</div>
          </div>
        </div>
        <div className="topbar-meta">
          <span>{snapshot.receiver.name} · {snapshot.receiver.lat === null || snapshot.receiver.lon === null
            ? t.common.unavailable
            : `${snapshot.receiver.lat.toFixed(4)}, ${snapshot.receiver.lon.toFixed(4)}`}</span>
          <span className={`mode-pill ${isDemo ? "" : "hidden"}`}>{t.brand.demoMode}</span>
          <span className={`status-pill ${statusOffline ? "offline" : isDemo ? "demo" : ""}`}>
            <span className="status-dot" />
            {statusOffline ? t.status.receiverOffline : isDemo ? t.status.mockReceiver : streamConnected ? t.status.liveReceiver : t.status.connecting}
          </span>
          {serverAlertsEnabled !== null && <span className="alert-status">{serverAlertsEnabled ? t.status.serverAlertsActive : t.status.serverAlertsDisabled}</span>}
        </div>
      </header>

      <section className="radar-content">
        <div className="map-panel">
          <div ref={mapContainerRef} className="map-container" />
          <div className="map-overlay">
            <div className="map-overlay-card">
              <div className="map-overlay-title">{t.radar.liveAirPicture}</div>
              <div className="map-overlay-value">{aircraftInRange(snapshot.aircraft.length)}</div>
            </div>
            {snapshot.receiver.lat !== null && snapshot.receiver.lon !== null && <div className="map-overlay-card range-legend">
              <span><i className="legend-dot" /> 25 km</span>
              <span><i className="legend-dot" /> 50 km</span>
              <span><i className="legend-dot" /> 100 km</span>
            </div>}
            {selectedAircraft?.enrichment?.route && <div className="map-overlay-card layer-legend">
              <span><i className="legend-line observed" /> {t.radar.adsbTrail}</span>
              <span><i className="legend-line planned" /> {t.radar.routeReference}</span>
            </div>}
          </div>
        </div>

        <aside className={`sidebar ${mobileCompact ? "compact" : ""} ${selectedAircraft ? "has-selection" : ""}`}>
          <div className="sidebar-heading">
              <div>
                <div className="sidebar-title">{t.radar.aircraftNearby}</div>
                <div className="sidebar-count">{visibleAircraft(filteredAircraft.length, snapshot.aircraft.length)}</div>
              </div>
              <button className="icon-button mobile-collapse" onClick={() => setMobileCompact((value) => !value)} aria-expanded={!mobileCompact} aria-label={mobileCompact ? t.radar.expandAircraftPanel : t.radar.collapseAircraftPanel}>
                {mobileCompact ? "↑" : "↓"}
              </button>
            </div>
          <RelevantAtcPanel summaries={snapshot.relevantAtcFrequencies} onOpen={() => setMobileCompact(false)} />
          <div className="sidebar-browse">
          <div className="sidebar-header">
            <div className="search-wrap">
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search.placeholder} aria-label={t.search.aircraftLabel} />
            </div>
            <details className="radar-options">
              <summary>{t.radar.panelOptions}</summary>
            <div className="filters">
              <select className="filter-select" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} aria-label={t.filters.sortLabel}>
                <option value="distance">{t.filters.sortDistance}</option>
                <option value="altitude">{t.filters.sortAltitude}</option>
                <option value="callsign">{t.filters.sortCallsign}</option>
              </select>
              <select className="filter-select" value={altitudeFilter} onChange={(event) => setAltitudeFilter(event.target.value)} aria-label={t.filters.minimumAltitude}>
                <option value="all">{t.filters.altitudeAll}</option>
                <option value="10000">{t.filters.altitudeAbove10k}</option>
                <option value="30000">{t.filters.altitudeAbove30k}</option>
              </select>
              <select className="filter-select" value={distanceFilter} onChange={(event) => setDistanceFilter(event.target.value)} aria-label={t.filters.maximumDistance}>
                <option value="all">{t.filters.distanceAll}</option>
                <option value="25">{t.filters.distanceWithin25}</option>
                <option value="75">{t.filters.distanceWithin75}</option>
              </select>
              <select className="filter-select" value={airlineFilter} onChange={(event) => setAirlineFilter(event.target.value)} aria-label={t.filters.airline}>
                <option value="all">{t.filters.airlineAll}</option>
                {filterOptions.airlines.map((airline) => <option key={airline} value={airline}>{airline}</option>)}
              </select>
              <select className="filter-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label={t.filters.aircraftType}>
                <option value="all">{t.filters.aircraftTypeAll}</option>
                {filterOptions.types.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <select className="filter-select" value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} aria-label={t.filters.registration}>
                <option value="all">{t.filters.registrationAll}</option>
                {filterOptions.countries.map((country) => <option key={country} value={country}>{country}</option>)}
              </select>
              <label className="filter-toggle"><input type="checkbox" checked={airborneOnly} onChange={(event) => setAirborneOnly(event.target.checked)} /> {t.filters.airborneOnly}</label>
              <label className="filter-toggle"><input type="checkbox" checked={emergencyOnly} onChange={(event) => setEmergencyOnly(event.target.checked)} /> {t.filters.emergencyOnly}</label>
              <label className="filter-toggle"><input type="checkbox" checked={watchlistOnly} onChange={(event) => setWatchlistOnly(event.target.checked)} /> {t.filters.watchlistOnly}</label>
            </div>
            <div className="map-toggles">
              <label><input type="checkbox" checked={showAirports} onChange={(event) => setShowAirports(event.target.checked)} /> {t.filters.airports}</label>
              <label><input type="checkbox" checked={showAtc} onChange={(event) => setShowAtc(event.target.checked)} /> {t.filters.atcSectors}</label>
            </div>
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
              <div className="stat-card"><div className="stat-value">{formatNumber(snapshot.stats.currentAircraft)}</div><div className="stat-label">{t.stats.trackingNow}</div></div>
              <div className="stat-card"><div className="stat-value">{formatNumber(snapshot.stats.aircraftSeenToday)}</div><div className="stat-label">{t.stats.seenToday}</div></div>
              <div className="stat-card"><div className="stat-value">{formatDistance(snapshot.stats.maxDistanceKm)}</div><div className="stat-label">{t.stats.maxDistance}</div></div>
            </div>
            <div className="stats-secondary">{secondaryStats(snapshot.stats.uniqueAircraftToday, snapshot.stats.maxConcurrentAircraft, snapshot.stats.messagesPerSecond)}</div>
            <details className="stats-breakdowns">
              <summary>{t.stats.trafficMix}</summary>
              <div><strong>{t.stats.aircraftTypes}</strong>{snapshot.stats.aircraftTypes.length ? snapshot.stats.aircraftTypes.slice(0, 5).map((item) => <span key={item.name}>{item.name} · {formatNumber(item.count)}</span>) : <span>{t.common.emptyValue}</span>}</div>
              <div><strong>{t.stats.airlines}</strong>{snapshot.stats.airlines.length ? snapshot.stats.airlines.slice(0, 5).map((item) => <span key={item.name}>{item.name} · {formatNumber(item.count)}</span>) : <span>{t.common.emptyValue}</span>}</div>
            </details>
            </details>
          </div>

          <div className="aircraft-list">
            {filteredAircraft.length === 0 ? (
              <div className="empty-list">
                <strong>{snapshot.aircraft.length === 0 ? t.radar.waitingForTraffic : t.radar.noMatchingAircraft}</strong>
                {snapshot.aircraft.length === 0 ? t.radar.waitingForTrafficDescription : t.radar.noMatchingAircraftDescription}
              </div>
            ) : filteredAircraft.map((aircraft) => (
              <button key={aircraft.icaoHex} className={`aircraft-row ${selectedHex === aircraft.icaoHex ? "selected" : ""} ${isWatchlisted(aircraft) ? "watchlisted" : ""}`} aria-pressed={selectedHex === aircraft.icaoHex} onClick={() => selectAircraft(aircraft.icaoHex)}>
                <span className="aircraft-row-icon"><AircraftIcon aircraft={aircraft} /></span>
                <span className="aircraft-row-main">
                  <span className="aircraft-row-name">{labelForAircraft(aircraft)} {isWatchlisted(aircraft) && <span className="watch-badge">{t.watchlist.badge}</span>} {aircraft.emergency && <span className="emergency-badge">{aircraft.emergency}</span>} <span className="aircraft-row-type">{aircraft.enrichment?.metadata?.icaoTypeCode || aircraft.aircraftType || t.aircraft.unknownType}</span></span>
                  <span className="aircraft-row-meta"><span>{aircraft.icaoHex}</span><span>{formatAltitude(aircraft.altitude)}</span><span>{formatSpeed(aircraft.groundSpeed)}</span><span>{formatTrack(aircraft.track)}</span></span>
                </span>
                <span className="aircraft-row-distance">{formatDistance(aircraft.distanceKm)}</span>
              </button>
            ))}
          </div>

          </div>

          {selectedAircraft && (
            <div className="detail-panel" key={selectedAircraft.icaoHex}>
              <div className="detail-heading">
                <div><div className="detail-callsign">{labelForAircraft(selectedAircraft)}</div>
                  {airlineForAircraft(selectedAircraft) && <div className="detail-registration">{airlineForAircraft(selectedAircraft)}</div>}
                </div>
                <button className="close-button" onClick={() => setSelectedHex(null)} aria-label={t.history.closeAircraftDetails}>×</button>
              </div>
              <div className="detail-content">
              {selectedAircraft.enrichment?.route && <div className="detail-route">
                <DetailItem label={t.route.originDestination} value={selectedAircraft.enrichment.route.originAirport && selectedAircraft.enrichment.route.destinationAirport ? `${airportCodes(selectedAircraft.enrichment.route.originAirport)} → ${airportCodes(selectedAircraft.enrichment.route.destinationAirport)}` : selectedAircraft.enrichment.route.origin && selectedAircraft.enrichment.route.destination ? `${selectedAircraft.enrichment.route.origin} → ${selectedAircraft.enrichment.route.destination}` : t.route.notAvailable} />
                {selectedAircraft.enrichment.route.originAirport && selectedAircraft.enrichment.route.destinationAirport && <div className="detail-registration">{selectedAircraft.enrichment.route.originAirport.city || selectedAircraft.enrichment.route.originAirport.name} → {selectedAircraft.enrichment.route.destinationAirport.city || selectedAircraft.enrichment.route.destinationAirport.name}</div>}
              </div>}
              <div className="detail-registration">{[selectedAircraft.enrichment?.metadata?.aircraftDescription || selectedAircraft.aircraftDescription || selectedAircraft.aircraftType, selectedAircraft.registration || selectedAircraft.enrichment?.metadata?.registration].filter(Boolean).join(" · ")}</div>
              <DetailSection title={t.aircraft.liveAdsb}>
                <DetailItem label={t.aircraft.altitude} value={formatAltitude(selectedAircraft.altitude)} />
                <DetailItem label={t.aircraft.groundSpeed} value={formatSpeed(selectedAircraft.groundSpeed)} />
                <DetailItem label={t.aircraft.track} value={formatTrack(selectedAircraft.track)} />
                <DetailItem label={t.aircraft.distance} value={formatDistance(selectedAircraft.distanceKm)} />
                <DetailItem label={t.aircraft.squawk} value={selectedAircraft.squawk || t.common.emptyValue} />
                <DetailItem label={t.aircraft.source} value={selectedAircraft.source} />
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
              {selectedAircraft.enrichment?.flightPlan && <DetailSection title={t.flightPlan.title}>
                <DetailItem label={t.flightPlan.scheduledDeparture} value={selectedAircraft.enrichment.flightPlan.scheduledDeparture || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.actualDeparture} value={selectedAircraft.enrichment.flightPlan.actualDeparture || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.scheduledArrival} value={selectedAircraft.enrichment.flightPlan.scheduledArrival || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.estimatedArrival} value={selectedAircraft.enrichment.flightPlan.estimatedArrival || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.filedRoute} value={selectedAircraft.enrichment.flightPlan.filedRoute || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.waypoints} value={selectedAircraft.enrichment.flightPlan.waypoints.join(" · ") || t.common.emptyValue} />
              </DetailSection>}
              <div className="watchlist-actions"><button className="watchlist-add" onClick={() => setWatchlist((current) => current.some((rule) => rule.kind === "icao" && rule.value === selectedAircraft.icaoHex) ? current : [...current, { kind: "icao", value: selectedAircraft.icaoHex }])}>{isWatchlisted(selectedAircraft) ? t.watchlist.onWatchlist : t.watchlist.addIcao}</button></div>
              <div className="detail-footer"><span>{t.history.lastSeen} {formatTime(selectedAircraft.lastSeen)}</span><Link className="history-link" href={`/history?hex=${selectedAircraft.icaoHex}`}>{t.history.viewHistory} →</Link></div>
              </div>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  if (value === t.common.emptyValue) return null;
  return <div><div className="detail-item-label">{label}</div><div className="detail-item-value">{value}</div></div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3><div className="detail-grid">{children}</div></section>;
}
