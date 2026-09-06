"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource, StyleSpecification } from "maplibre-gl";
import { circleCoordinates } from "@/lib/geo";
import type { AircraftView, ReceiverPosition, StateSnapshot, TrailPoint } from "@/lib/aircraft/types";

const DEMO_RECEIVER: ReceiverPosition = { lat: 50.0755, lon: 14.4378, name: "AirRadar receiver" };
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
  stats: { currentAircraft: 0, uniqueAircraftToday: 0, maxConcurrentAircraft: 0, maxDistanceKm: 0 },
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

function formatNumber(value: number | null, digits = 0): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatAltitude(value: number | null): string {
  return value === null ? "—" : `${formatNumber(value)} ft`;
}

function formatSpeed(value: number | null): string {
  return value === null ? "—" : `${formatNumber(value)} kt`;
}

function formatDistance(value: number | null): string {
  return value === null ? "—" : `${formatNumber(value, value < 10 ? 1 : 0)} km`;
}

function formatTrack(value: number | null): string {
  return value === null ? "—" : `${Math.round(value).toString().padStart(3, "0")}°`;
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function labelForAircraft(aircraft: AircraftView): string {
  return aircraft.callsign || aircraft.registration || aircraft.icaoHex;
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
  const [streamConnected, setStreamConnected] = useState(false);
  const [mobileCompact, setMobileCompact] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const receiverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const aircraftMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const animationFramesRef = useRef<Map<string, number>>(new Map());
  const liveTrailsRef = useRef<Map<string, TrailPoint[]>>(new Map());
  const receiverRef = useRef(snapshot.receiver);
  const [mapReady, setMapReady] = useState(false);

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
    receiverElement.setAttribute("aria-label", "Receiver position");
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
    receiverMarkerRef.current?.setLngLat([receiver.lon, receiver.lat]);
    const rings = map.getSource("range-rings") as GeoJSONSource | undefined;
    rings?.setData(createRangeGeoJSON(receiver));
  }, [snapshot.receiver, mapReady]);

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
  }, [snapshot.aircraft, selectedHex, mapReady, selectAircraft]);

  const selectedAircraft = snapshot.aircraft.find((aircraft) => aircraft.icaoHex === selectedHex) ?? null;
  const filteredAircraft = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = snapshot.aircraft.filter((aircraft) => {
      const searchable = [aircraft.callsign, aircraft.registration, aircraft.icaoHex].filter(Boolean).join(" ").toLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (airborneOnly && aircraft.onGround) return false;
      if (altitudeFilter !== "all" && (aircraft.altitude === null || aircraft.altitude < Number(altitudeFilter))) return false;
      if (distanceFilter !== "all" && (aircraft.distanceKm === null || aircraft.distanceKm > Number(distanceFilter))) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sortBy === "callsign") return labelForAircraft(a).localeCompare(labelForAircraft(b));
      if (sortBy === "altitude") return (b.altitude ?? -Infinity) - (a.altitude ?? -Infinity);
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    });
  }, [airborneOnly, altitudeFilter, distanceFilter, search, snapshot.aircraft, sortBy]);

  const isDemo = snapshot.provider === "mock";
  const statusOffline = !isDemo && !snapshot.sourceOnline;

  return (
    <main className="radar-shell">
      <header className="topbar">
        <div className="brand">
          <LogoMark />
          <div>
            <div className="brand-title">AirRadar</div>
            <div className="brand-subtitle">PERSONAL ADS-B SITUATIONAL AWARENESS</div>
          </div>
        </div>
        <div className="topbar-meta">
          <span>{snapshot.receiver.name} · {snapshot.receiver.lat.toFixed(4)}, {snapshot.receiver.lon.toFixed(4)}</span>
          <span className={`mode-pill ${isDemo ? "" : "hidden"}`}>DEMO MODE</span>
          <span className={`status-pill ${statusOffline ? "offline" : isDemo ? "demo" : ""}`}>
            <span className="status-dot" />
            {statusOffline ? "Receiver offline" : isDemo ? "Mock receiver" : streamConnected ? "Live receiver" : "Connecting"}
          </span>
        </div>
      </header>

      <section className="radar-content">
        <div className="map-panel">
          <div ref={mapContainerRef} className="map-container" />
          <div className="map-overlay">
            <div className="map-overlay-card">
              <div className="map-overlay-title">Live air picture</div>
              <div className="map-overlay-value">{snapshot.aircraft.length} aircraft in range</div>
            </div>
            <div className="map-overlay-card range-legend">
              <span><i className="legend-dot" /> 25 km</span>
              <span><i className="legend-dot" /> 50 km</span>
              <span><i className="legend-dot" /> 100 km</span>
            </div>
          </div>
        </div>

        <aside className={`sidebar ${mobileCompact ? "compact" : ""}`}>
          <div className="sidebar-header">
            <div className="sidebar-heading">
              <div>
                <div className="sidebar-title">Aircraft nearby</div>
                <div className="sidebar-count">{filteredAircraft.length} / {snapshot.aircraft.length} visible</div>
              </div>
              <button className="icon-button mobile-collapse" onClick={() => setMobileCompact((value) => !value)} aria-label={mobileCompact ? "Expand aircraft panel" : "Collapse aircraft panel"}>
                {mobileCompact ? "↑" : "↓"}
              </button>
            </div>
            <div className="search-wrap">
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search callsign, registration, ICAO…" aria-label="Search aircraft" />
            </div>
            <div className="filters">
              <select className="filter-select" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} aria-label="Sort aircraft">
                <option value="distance">Sort: distance</option>
                <option value="altitude">Sort: altitude</option>
                <option value="callsign">Sort: callsign</option>
              </select>
              <select className="filter-select" value={altitudeFilter} onChange={(event) => setAltitudeFilter(event.target.value)} aria-label="Minimum altitude">
                <option value="all">Altitude: all</option>
                <option value="10000">Above 10k ft</option>
                <option value="30000">Above 30k ft</option>
              </select>
              <select className="filter-select" value={distanceFilter} onChange={(event) => setDistanceFilter(event.target.value)} aria-label="Maximum distance">
                <option value="all">Distance: all</option>
                <option value="25">Within 25 km</option>
                <option value="75">Within 75 km</option>
              </select>
              <label className="filter-toggle"><input type="checkbox" checked={airborneOnly} onChange={(event) => setAirborneOnly(event.target.checked)} /> Airborne only</label>
            </div>
            <div className="stats-row">
              <div className="stat-card"><div className="stat-value">{snapshot.stats.currentAircraft}</div><div className="stat-label">Tracking now</div></div>
              <div className="stat-card"><div className="stat-value">{snapshot.stats.uniqueAircraftToday}</div><div className="stat-label">Unique today</div></div>
              <div className="stat-card"><div className="stat-value">{formatDistance(snapshot.stats.maxDistanceKm)}</div><div className="stat-label">Max distance</div></div>
            </div>
          </div>

          <div className="aircraft-list">
            {filteredAircraft.length === 0 ? (
              <div className="empty-list">
                <strong>{snapshot.aircraft.length === 0 ? "Waiting for traffic" : "No matching aircraft"}</strong>
                {snapshot.aircraft.length === 0 ? "The radar will keep retrying the data source." : "Try clearing a filter or changing your search."}
              </div>
            ) : filteredAircraft.map((aircraft) => (
              <button key={aircraft.icaoHex} className={`aircraft-row ${selectedHex === aircraft.icaoHex ? "selected" : ""}`} onClick={() => selectAircraft(aircraft.icaoHex)}>
                <span className="aircraft-row-icon"><AirplaneGlyph /></span>
                <span className="aircraft-row-main">
                  <span className="aircraft-row-name">{labelForAircraft(aircraft)} <span className="aircraft-row-type">{aircraft.aircraftType || "unknown type"}</span></span>
                  <span className="aircraft-row-meta"><span>{aircraft.icaoHex}</span><span>{formatAltitude(aircraft.altitude)}</span><span>{formatSpeed(aircraft.groundSpeed)}</span><span>{formatTrack(aircraft.track)}</span></span>
                </span>
                <span className="aircraft-row-distance">{formatDistance(aircraft.distanceKm)}</span>
              </button>
            ))}
          </div>

          {selectedAircraft && (
            <div className="detail-panel">
              <div className="detail-heading">
                <div><div className="detail-callsign">{labelForAircraft(selectedAircraft)}</div><div className="detail-registration">{selectedAircraft.registration || "Registration unknown"} · {selectedAircraft.aircraftDescription || selectedAircraft.aircraftType || "Type unknown"}</div></div>
                <button className="close-button" onClick={() => setSelectedHex(null)} aria-label="Close aircraft details">×</button>
              </div>
              <div className="detail-grid">
                <DetailItem label="ICAO hex" value={selectedAircraft.icaoHex} />
                <DetailItem label="Altitude" value={formatAltitude(selectedAircraft.altitude)} />
                <DetailItem label="Ground speed" value={formatSpeed(selectedAircraft.groundSpeed)} />
                <DetailItem label="Track" value={formatTrack(selectedAircraft.track)} />
                <DetailItem label="Vertical rate" value={selectedAircraft.verticalRate === null ? "—" : `${formatNumber(selectedAircraft.verticalRate)} ft/min`} />
                <DetailItem label="Squawk" value={selectedAircraft.squawk || "—"} />
                <DetailItem label="RSSI" value={selectedAircraft.rssi === null ? "—" : `${selectedAircraft.rssi.toFixed(1)} dBFS`} />
                <DetailItem label="Messages" value={formatNumber(selectedAircraft.messages)} />
                <DetailItem label="Distance" value={formatDistance(selectedAircraft.distanceKm)} />
                <DetailItem label="Bearing" value={formatTrack(selectedAircraft.bearing)} />
                <DetailItem label="Position" value={selectedAircraft.lat === null || selectedAircraft.lon === null ? "—" : `${selectedAircraft.lat.toFixed(4)}, ${selectedAircraft.lon.toFixed(4)}`} />
                <DetailItem label="Source" value={selectedAircraft.source} />
              </div>
              <div className="detail-footer"><span>Last seen {formatTime(selectedAircraft.lastSeen)}</span><Link className="history-link" href={`/history?hex=${selectedAircraft.icaoHex}`}>View history →</Link></div>
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
