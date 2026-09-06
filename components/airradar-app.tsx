"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource, StyleSpecification } from "maplibre-gl";
import { circleCoordinates } from "@/lib/geo";
import {
  aircraftInRange,
  formatAge,
  formatAltitude,
  formatAtcNote,
  formatAtcService,
  formatCoordinate,
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
import type { AircraftView, FlightRoute, ReceiverPosition, StateSnapshot, TrailPoint } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import type { AtcSector, AtcTransmitter } from "@/lib/atc/types";

const DEMO_RECEIVER: ReceiverPosition = { lat: 50.0755, lon: 14.4378, name: t.radar.receiverName };
const EMPTY_SNAPSHOT: StateSnapshot = {
  aircraft: [],
  receiver: DEMO_RECEIVER,
  fetchedAt: new Date(0).toISOString(),
  provider: "mock",
  sourceOnline: false,
  lastSourceUpdate: null,
  sourceError: null,
  readsbOnline: false,
  lastReadsbUpdate: null,
  lastError: null,
  stats: { currentAircraft: 0, aircraftSeenToday: 0, uniqueAircraftToday: 0, maxConcurrentAircraft: 0, maxDistanceKm: 0, aircraftTypes: [], airlines: [], messagesPerSecond: null },
};

const MAP_STYLE: StyleSpecification = {
  version: 8,
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
        altitude: `${sector.lowerAltitudeFt ?? 0}–${sector.upperAltitudeFt ?? t.common.unlimited} ft`,
        frequencies: sector.frequencies.map((frequency) => `${frequency.frequencyMhz.toFixed(3)} MHz`).join(", "),
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

function AirplaneGlyph() {
  return <span aria-hidden="true">✈</span>;
}

export function AirRadarApp() {
  const [snapshot, setSnapshot] = useState<StateSnapshot>(EMPTY_SNAPSHOT);
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
  const [atcData, setAtcData] = useState<{ sectors: AtcSector[]; transmitters: AtcTransmitter[] }>({ sectors: [], transmitters: [] });
  const [streamConnected, setStreamConnected] = useState(false);
  const [mobileCompact, setMobileCompact] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const receiverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const aircraftMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const animationFramesRef = useRef<Map<string, number>>(new Map());
  const liveTrailsRef = useRef<Map<string, TrailPoint[]>>(new Map());
  const receiverRef = useRef(snapshot.receiver);
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
      .then((response) => response.ok ? response.json() as Promise<{ sectors: AtcSector[]; transmitters: AtcTransmitter[] }> : null)
      .then((data) => { if (data) setAtcData(data); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("airradar-watchlist", JSON.stringify(watchlist)); } catch { /* optional */ }
  }, [watchlist]);

  const isWatchlisted = useCallback((aircraft: AircraftView) => watchlist.some((rule) => {
    const value = rule.value.trim().toUpperCase();
    if (!value) return false;
    if (rule.kind === "icao") return aircraft.icaoHex === value;
    if (rule.kind === "registration") return (aircraft.registration ?? aircraft.enrichment?.metadata?.registration)?.toUpperCase() === value;
    if (rule.kind === "callsign") return aircraft.callsign?.toUpperCase() === value;
    if (rule.kind === "pattern") return Boolean(aircraft.callsign && new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("\\*", ".*")}$`, "i").test(aircraft.callsign));
    if (rule.kind === "type") return (aircraft.enrichment?.metadata?.icaoTypeCode ?? aircraft.aircraftType)?.toUpperCase() === value;
    return airlineForAircraft(aircraft)?.toUpperCase() === value;
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
        const next = JSON.parse((event as MessageEvent<string>).data) as StateSnapshot;
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
              trail.push({ lat: aircraft.lat, lon: aircraft.lon, recordedAt: aircraft.lastSeen });
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
    const startingReceiver = receiverRef.current;
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
    const liveTrails = liveTrailsRef.current;

    const receiverElement = document.createElement("div");
    receiverElement.className = "receiver-marker";
    receiverElement.setAttribute("aria-label", t.radar.receiverPosition);
    receiverMarkerRef.current = new maplibregl.Marker({ element: receiverElement, anchor: "center" })
      .setLngLat([startingReceiver.lon, startingReceiver.lat])
      .addTo(map);

    map.on("load", () => {
      map.addSource("range-rings", { type: "geojson", data: createRangeGeoJSON(startingReceiver) });
      map.addLayer({
        id: "range-rings-line",
        type: "line",
        source: "range-rings",
        paint: { "line-color": "#37d6c0", "line-opacity": 0.24, "line-width": 1, "line-dasharray": [2, 3] },
      });
      map.addSource("selected-trail", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "selected-trail-line", type: "line", source: "selected-trail", paint: { "line-color": "#f3b95f", "line-opacity": 0.85, "line-width": 2.5, "line-dasharray": [1, 2] } });
      map.addSource("selected-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "selected-route-line", type: "line", source: "selected-route", paint: { "line-color": "#a7b6c7", "line-opacity": 0.72, "line-width": 2, "line-dasharray": [2, 3] } });
      map.addSource("atc-sectors", { type: "geojson", data: createAtcGeoJSON([], false) });
      map.addLayer({ id: "atc-sectors-fill", type: "fill", source: "atc-sectors", layout: { visibility: "none" }, paint: { "fill-color": "#8068ff", "fill-opacity": 0.09 } });
      map.addLayer({ id: "atc-sectors-line", type: "line", source: "atc-sectors", layout: { visibility: "none" }, paint: { "line-color": "#a990ff", "line-opacity": 0.6, "line-width": 1.2, "line-dasharray": [2, 2] } });
      map.addSource("atc-transmitters", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "atc-transmitters-circle", type: "circle", source: "atc-transmitters", layout: { visibility: "none" }, paint: { "circle-color": "#f3b95f", "circle-radius": 5, "circle-stroke-color": "#08111d", "circle-stroke-width": 1.5 } });
      map.addSource("route-airports", { type: "geojson", data: createAirportGeoJSON([], false) });
      map.addLayer({ id: "route-airports-circle", type: "circle", source: "route-airports", paint: { "circle-color": "#f3b95f", "circle-radius": 5, "circle-stroke-color": "#08111d", "circle-stroke-width": 1.5 } });
      map.addLayer({ id: "route-airports-label", type: "symbol", source: "route-airports", layout: { "text-field": ["get", "code"], "text-size": 10, "text-offset": [0, 1.2] }, paint: { "text-color": "#f5d494", "text-halo-color": "#08111d", "text-halo-width": 1.2 } });
      map.on("click", "atc-sectors-fill", (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const properties = feature.properties ?? {};
        const content = document.createElement("div");
        content.className = "map-popup";
        const title = document.createElement("strong");
        title.textContent = String(properties.name ?? t.atc.sector);
        const body = document.createElement("span");
        body.textContent = `${String(properties.service ?? "")} · ${String(properties.altitude ?? "")} · ${String(properties.frequencies ?? "")}`;
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
        body.textContent = `${String(properties.service ?? "")} · ${String(properties.frequency ?? "")} ${String(properties.notes ?? "")}`;
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
    receiverMarkerRef.current?.setLngLat([receiver.lon, receiver.lat]);
    const rings = map.getSource("range-rings") as GeoJSONSource | undefined;
    rings?.setData(createRangeGeoJSON(receiver));
    if (shouldRecenterOnReceiver(snapshot.provider, centeredReceiverRef.current, receiver)) {
      map.jumpTo({ center: [receiver.lon, receiver.lat] });
      centeredReceiverRef.current = receiver;
    }
  }, [mapReady, snapshot.provider, snapshot.receiver]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const currentHexes = new Set<string>();
    const animate = (hex: string, marker: maplibregl.Marker, target: [number, number]) => {
      const previousFrame = animationFramesRef.current.get(hex);
      if (previousFrame) cancelAnimationFrame(previousFrame);
      const start = marker.getLngLat();
      const startedAt = performance.now();
      const duration = 850;
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
      if (!marker) {
        const root = document.createElement("div");
        root.className = "aircraft-marker";
        root.setAttribute("role", "button");
        root.setAttribute("tabindex", "0");
        root.setAttribute("aria-label", labelForAircraft(aircraft));
        const plane = document.createElement("div");
        plane.className = "aircraft-plane";
        plane.textContent = "✈";
        root.appendChild(plane);
        root.addEventListener("click", () => selectAircraft(aircraft.icaoHex));
        root.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") selectAircraft(aircraft.icaoHex);
        });
        marker = new maplibregl.Marker({ element: root, anchor: "center" }).setLngLat([aircraft.lon, aircraft.lat]).addTo(map);
        aircraftMarkersRef.current.set(aircraft.icaoHex, marker);
      } else {
        animate(aircraft.icaoHex, marker, [aircraft.lon, aircraft.lat]);
      }
      const root = marker.getElement();
      root.classList.toggle("selected", aircraft.icaoHex === selectedHex);
      root.classList.toggle("watchlisted", isWatchlisted(aircraft));
      const plane = root.querySelector<HTMLElement>(".aircraft-plane");
      if (plane) plane.style.transform = `rotate(${aircraft.track ?? 0}deg)`;
    }

    for (const [hex, marker] of aircraftMarkersRef.current) {
      if (!currentHexes.has(hex)) {
        const frame = animationFramesRef.current.get(hex);
        if (frame) cancelAnimationFrame(frame);
        animationFramesRef.current.delete(hex);
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
  }, [isWatchlisted, snapshot.aircraft, selectedHex, mapReady, selectAircraft]);

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
        properties: { name: transmitter.name, service: formatAtcService(transmitter.service), frequency: `${transmitter.frequencyMhz.toFixed(3)} MHz`, notes: formatAtcNote(transmitter.notes) },
        geometry: { type: "Point" as const, coordinates: [transmitter.longitude, transmitter.latitude] },
      })) : [],
    });
    const airports = snapshot.aircraft.flatMap((aircraft) => {
      const route = aircraft.enrichment?.route;
      return [route?.originAirport, route?.destinationAirport].filter((airport): airport is Airport => Boolean(airport));
    });
    const airportSource = map.getSource("route-airports") as GeoJSONSource | undefined;
    airportSource?.setData(createAirportGeoJSON(airports, showAirports));
    for (const layer of ["atc-sectors-fill", "atc-sectors-line", "atc-transmitters-circle"] as const) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", showAtc ? "visible" : "none");
    }
  }, [atcData, mapReady, showAirports, showAtc, snapshot.aircraft]);

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
  const statusOffline = !isDemo && !snapshot.sourceOnline;

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
          <span>{snapshot.receiver.name} · {snapshot.receiver.lat.toFixed(4)}, {snapshot.receiver.lon.toFixed(4)}</span>
          <span className={`mode-pill ${isDemo ? "" : "hidden"}`}>{t.brand.demoMode}</span>
          <span className={`status-pill ${statusOffline ? "offline" : isDemo ? "demo" : ""}`}>
            <span className="status-dot" />
            {statusOffline ? t.status.receiverOffline : isDemo ? t.status.mockReceiver : streamConnected ? t.status.liveReceiver : t.status.connecting}
          </span>
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
            <div className="map-overlay-card range-legend">
              <span><i className="legend-dot" /> 25 km</span>
              <span><i className="legend-dot" /> 50 km</span>
              <span><i className="legend-dot" /> 100 km</span>
            </div>
            {selectedAircraft?.enrichment?.route && <div className="map-overlay-card layer-legend">
              <span><i className="legend-line observed" /> {t.radar.adsbTrail}</span>
              <span><i className="legend-line planned" /> {t.radar.routeReference}</span>
            </div>}
          </div>
        </div>

        <aside className={`sidebar ${mobileCompact ? "compact" : ""}`}>
          <div className="sidebar-header">
            <div className="sidebar-heading">
              <div>
                <div className="sidebar-title">{t.radar.aircraftNearby}</div>
                <div className="sidebar-count">{visibleAircraft(filteredAircraft.length, snapshot.aircraft.length)}</div>
              </div>
              <button className="icon-button mobile-collapse" onClick={() => setMobileCompact((value) => !value)} aria-label={mobileCompact ? t.radar.expandAircraftPanel : t.radar.collapseAircraftPanel}>
                {mobileCompact ? "↑" : "↓"}
              </button>
            </div>
            <div className="search-wrap">
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search.placeholder} aria-label={t.search.aircraftLabel} />
            </div>
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
          </div>

          <div className="aircraft-list">
            {filteredAircraft.length === 0 ? (
              <div className="empty-list">
                <strong>{snapshot.aircraft.length === 0 ? t.radar.waitingForTraffic : t.radar.noMatchingAircraft}</strong>
                {snapshot.aircraft.length === 0 ? t.radar.waitingForTrafficDescription : t.radar.noMatchingAircraftDescription}
              </div>
            ) : filteredAircraft.map((aircraft) => (
              <button key={aircraft.icaoHex} className={`aircraft-row ${selectedHex === aircraft.icaoHex ? "selected" : ""} ${isWatchlisted(aircraft) ? "watchlisted" : ""}`} onClick={() => selectAircraft(aircraft.icaoHex)}>
                <span className="aircraft-row-icon"><AirplaneGlyph /></span>
                <span className="aircraft-row-main">
                  <span className="aircraft-row-name">{labelForAircraft(aircraft)} {isWatchlisted(aircraft) && <span className="watch-badge">{t.watchlist.badge}</span>} {aircraft.emergency && <span className="emergency-badge">{aircraft.emergency}</span>} <span className="aircraft-row-type">{aircraft.enrichment?.metadata?.icaoTypeCode || aircraft.aircraftType || t.aircraft.unknownType}</span></span>
                  <span className="aircraft-row-meta"><span>{aircraft.icaoHex}</span><span>{formatAltitude(aircraft.altitude)}</span><span>{formatSpeed(aircraft.groundSpeed)}</span><span>{formatTrack(aircraft.track)}</span></span>
                </span>
                <span className="aircraft-row-distance">{formatDistance(aircraft.distanceKm)}</span>
              </button>
            ))}
          </div>

          {selectedAircraft && (
            <div className="detail-panel">
              <div className="detail-heading">
                <div><div className="detail-callsign">{labelForAircraft(selectedAircraft)}</div><div className="detail-registration">{airlineForAircraft(selectedAircraft) || t.aircraft.unknownAirline} · {selectedAircraft.registration || selectedAircraft.enrichment?.metadata?.registration || t.aircraft.unknownRegistration} · {selectedAircraft.enrichment?.metadata?.aircraftDescription || selectedAircraft.aircraftDescription || selectedAircraft.aircraftType || t.aircraft.unknownAircraftType}</div></div>
                <button className="close-button" onClick={() => setSelectedHex(null)} aria-label={t.history.closeAircraftDetails}>×</button>
              </div>
              <DetailSection title={t.aircraft.liveAdsb}>
                <DetailItem label={t.aircraft.icaoHex} value={selectedAircraft.icaoHex} />
                <DetailItem label={t.aircraft.altitude} value={formatAltitude(selectedAircraft.altitude)} />
                <DetailItem label={t.aircraft.baroGeomAltitude} value={`${formatAltitude(selectedAircraft.baroAltitude)} / ${formatAltitude(selectedAircraft.geomAltitude)}`} />
                <DetailItem label={t.aircraft.groundSpeed} value={formatSpeed(selectedAircraft.groundSpeed)} />
                <DetailItem label={t.aircraft.track} value={formatTrack(selectedAircraft.track)} />
                <DetailItem label={t.aircraft.verticalRate} value={selectedAircraft.verticalRate === null ? t.common.emptyValue : `${formatNumber(selectedAircraft.verticalRate)} ft/min`} />
                <DetailItem label={t.aircraft.baroGeomRate} value={`${selectedAircraft.baroRate === null ? t.common.emptyValue : `${formatNumber(selectedAircraft.baroRate)} ft/min`} / ${selectedAircraft.geomRate === null ? t.common.emptyValue : `${formatNumber(selectedAircraft.geomRate)} ft/min`}`} />
                <DetailItem label={t.aircraft.squawk} value={selectedAircraft.squawk || t.common.emptyValue} />
                <DetailItem label={t.aircraft.category} value={selectedAircraft.category || t.common.emptyValue} />
                <DetailItem label={t.aircraft.rssi} value={selectedAircraft.rssi === null ? t.common.emptyValue : `${formatNumber(selectedAircraft.rssi, 1)} dBFS`} />
                <DetailItem label={t.aircraft.messages} value={formatNumber(selectedAircraft.messages)} />
                <DetailItem label={t.aircraft.seenPosition} value={`${formatAge(selectedAircraft.seenSeconds)} / ${formatAge(selectedAircraft.seenPosSeconds)}`} />
                <DetailItem label={t.aircraft.distance} value={formatDistance(selectedAircraft.distanceKm)} />
                <DetailItem label={t.aircraft.bearing} value={formatTrack(selectedAircraft.bearing)} />
                <DetailItem label={t.aircraft.position} value={selectedAircraft.lat === null || selectedAircraft.lon === null ? t.common.emptyValue : `${formatCoordinate(selectedAircraft.lat)}, ${formatCoordinate(selectedAircraft.lon)}`} />
                <DetailItem label={t.aircraft.source} value={selectedAircraft.source} />
                <DetailItem label={t.aircraft.readsbSourceType} value={selectedAircraft.sourceType || t.common.emptyValue} />
                <DetailItem label={t.aircraft.emergency} value={selectedAircraft.emergency || t.common.notReported} />
              </DetailSection>
              <DetailSection title={t.aircraft.metadata}>
                <DetailItem label={t.aircraft.manufacturer} value={selectedAircraft.enrichment?.metadata?.manufacturer || t.common.emptyValue} />
                <DetailItem label={t.aircraft.modelType} value={selectedAircraft.enrichment?.metadata?.aircraftDescription || selectedAircraft.aircraftDescription || t.common.emptyValue} />
                <DetailItem label={t.aircraft.icaoType} value={selectedAircraft.enrichment?.metadata?.icaoTypeCode || selectedAircraft.aircraftType || t.common.emptyValue} />
                <DetailItem label={t.aircraft.operator} value={selectedAircraft.enrichment?.metadata?.operator || t.common.emptyValue} />
                <DetailItem label={t.aircraft.registrationCountry} value={registrationCountryForAircraft(selectedAircraft) || t.common.emptyValue} />
              </DetailSection>
              <DetailSection title={t.radar.routeReference}>
                <DetailItem label={t.route.airline} value={airlineForAircraft(selectedAircraft) || t.common.emptyValue} />
                <DetailItem label={t.route.originDestination} value={selectedAircraft.enrichment?.route?.originAirport && selectedAircraft.enrichment.route.destinationAirport ? `${airportCodes(selectedAircraft.enrichment.route.originAirport)} → ${airportCodes(selectedAircraft.enrichment.route.destinationAirport)}` : selectedAircraft.enrichment?.route?.origin && selectedAircraft.enrichment?.route?.destination ? `${selectedAircraft.enrichment.route.origin} → ${selectedAircraft.enrichment.route.destination}` : t.route.notAvailable} />
                <DetailItem label={t.route.airports} value={selectedAircraft.enrichment?.route?.originAirport && selectedAircraft.enrichment.route.destinationAirport ? `${selectedAircraft.enrichment.route.originAirport.city || selectedAircraft.enrichment.route.originAirport.name} → ${selectedAircraft.enrichment.route.destinationAirport.city || selectedAircraft.enrichment.route.destinationAirport.name}` : t.common.emptyValue} />
                <DetailItem label={t.route.source} value={selectedAircraft.enrichment?.route?.source || t.common.emptyValue} />
              </DetailSection>
              {selectedAircraft.enrichment?.flightPlan && <DetailSection title={t.flightPlan.title}>
                <DetailItem label={t.flightPlan.scheduledDeparture} value={selectedAircraft.enrichment.flightPlan.scheduledDeparture || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.actualDeparture} value={selectedAircraft.enrichment.flightPlan.actualDeparture || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.scheduledArrival} value={selectedAircraft.enrichment.flightPlan.scheduledArrival || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.estimatedArrival} value={selectedAircraft.enrichment.flightPlan.estimatedArrival || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.filedRoute} value={selectedAircraft.enrichment.flightPlan.filedRoute || t.common.emptyValue} />
                <DetailItem label={t.flightPlan.waypoints} value={selectedAircraft.enrichment.flightPlan.waypoints.join(" · ") || t.common.emptyValue} />
              </DetailSection>}
              <DetailSection title={t.atc.estimate}>
                {selectedAircraft.atc ? <>
                  <DetailItem label={t.atc.sectorService} value={`${selectedAircraft.atc.name} · ${formatAtcService(selectedAircraft.atc.service || selectedAircraft.atc.callsign)}`} />
                  <DetailItem label={t.atc.primaryFrequency} value={selectedAircraft.atc.primaryFrequencyMhz === null ? t.common.emptyValue : `${selectedAircraft.atc.primaryFrequencyMhz.toFixed(3)} MHz`} />
                  <DetailItem label={t.atc.alternates} value={selectedAircraft.atc.alternateFrequenciesMhz.map((frequency) => `${frequency.toFixed(3)} MHz`).join(", ") || t.common.emptyValue} />
                  <div className="detail-disclaimer">{t.atc.probableFrequency}</div>
                </> : <div className="detail-disclaimer">{t.atc.noMatchingSector}</div>}
              </DetailSection>
              <div className="watchlist-actions"><button className="watchlist-add" onClick={() => setWatchlist((current) => current.some((rule) => rule.kind === "icao" && rule.value === selectedAircraft.icaoHex) ? current : [...current, { kind: "icao", value: selectedAircraft.icaoHex }])}>{isWatchlisted(selectedAircraft) ? t.watchlist.onWatchlist : t.watchlist.addIcao}</button></div>
              <div className="detail-footer"><span>{t.history.lastSeen} {formatTime(selectedAircraft.lastSeen)}</span><Link className="history-link" href={`/history?hex=${selectedAircraft.icaoHex}`}>{t.history.viewHistory} →</Link></div>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div><div className="detail-item-label">{label}</div><div className="detail-item-value">{value}</div></div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3><div className="detail-grid">{children}</div></section>;
}
