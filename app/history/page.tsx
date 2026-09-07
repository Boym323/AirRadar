"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import {
  formatAltitude,
  formatDateTime,
  formatDistance,
  formatSpeed,
  formatTime,
  formatTrack,
  t,
} from "@/lib/i18n";
import type { HistoryFlightDetail, HistoryFlightRange, HistoryFlightSummary } from "@/lib/server/history";
import { playbackSampleAt, playbackTimeRange, type PlaybackPosition, type PlaybackSample } from "@/lib/history/playback";

const HISTORY_MAP_STYLE: StyleSpecification = {
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
    { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.58, "raster-saturation": -0.8 } },
  ],
};

function HistoryMap({ positions, sample }: { positions: PlaybackPosition[]; sample: PlaybackSample | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const markerPlaneRef = useRef<HTMLDivElement | null>(null);
  const sampleRef = useRef<PlaybackSample | null>(sample);
  sampleRef.current = sample;

  useEffect(() => {
    if (!containerRef.current || !positions.length) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: HISTORY_MAP_STYLE,
      center: [positions[0].lon, positions[0].lat],
      zoom: 7,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
      if (positions.length > 1) {
        map.addSource("history-trail", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: positions.map((position) => [position.lon, position.lat]) },
          },
        });
        map.addLayer({
          id: "history-trail-line",
          type: "line",
          source: "history-trail",
          paint: { "line-color": "#f3b95f", "line-width": 3, "line-opacity": 0.9 },
        });
      }

      map.addSource("history-endpoints", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { kind: "start" },
              geometry: { type: "Point", coordinates: [positions[0].lon, positions[0].lat] },
            },
            ...(positions.length > 1
              ? [{
                  type: "Feature" as const,
                  properties: { kind: "end" },
                  geometry: { type: "Point" as const, coordinates: [positions[positions.length - 1].lon, positions[positions.length - 1].lat] },
                }]
              : []),
          ],
        },
      });
      map.addLayer({
        id: "history-endpoints-circles",
        type: "circle",
        source: "history-endpoints",
        paint: {
          "circle-radius": 5,
          "circle-color": ["match", ["get", "kind"], "start", "#37d6c0", "#f3b95f"],
          "circle-stroke-color": "#08111d",
          "circle-stroke-width": 2,
        },
      });

      const bounds = new maplibregl.LngLatBounds([positions[0].lon, positions[0].lat], [positions[0].lon, positions[0].lat]);
      for (const position of positions.slice(1)) bounds.extend([position.lon, position.lat]);
      if (positions.length === 1 || (bounds.getEast() === bounds.getWest() && bounds.getNorth() === bounds.getSouth())) {
        map.setCenter([positions[0].lon, positions[0].lat]);
        map.setZoom(9);
      } else {
        map.fitBounds(bounds, { padding: 45, maxZoom: 11, duration: 0 });
      }

      const markerElement = document.createElement("div");
      markerElement.className = "history-playback-marker";
      const plane = document.createElement("div");
      plane.className = "history-playback-plane";
      plane.textContent = "✈";
      plane.setAttribute("aria-hidden", "true");
      markerElement.appendChild(plane);
      markerPlaneRef.current = plane;
      const initialSample = sampleRef.current;
      markerRef.current = new maplibregl.Marker({ element: markerElement, anchor: "center" })
        .setLngLat([initialSample?.lon ?? positions[0].lon, initialSample?.lat ?? positions[0].lat])
        .addTo(map);
      if (initialSample?.track !== null && initialSample?.track !== undefined) plane.style.transform = `rotate(${initialSample.track}deg)`;
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      markerPlaneRef.current = null;
      map.remove();
    };
  }, [positions]);

  useEffect(() => {
    if (!sample || !markerRef.current) return;
    markerRef.current.setLngLat([sample.lon, sample.lat]);
    if (markerPlaneRef.current && sample.track !== null) markerPlaneRef.current.style.transform = `rotate(${sample.track}deg)`;
  }, [sample]);

  return <div ref={containerRef} className="history-map" aria-label={t.history.trailMap} />;
}

function FlightPlayback({ positions }: { positions: PlaybackPosition[] }) {
  const range = useMemo(() => playbackTimeRange(positions), [positions]);
  const start = range?.start ?? 0;
  const end = range?.end ?? 0;
  const [playbackAt, setPlaybackAt] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const playbackRef = useRef(start);

  useEffect(() => {
    playbackRef.current = start;
    setPlaybackAt(start);
    setPlaying(false);
  }, [start, end]);

  useEffect(() => {
    if (!playing || !range || end <= start) return;
    let animationFrame = 0;
    let previousFrame = performance.now();
    const tick = (now: number) => {
      const next = Math.min(end, playbackRef.current + (now - previousFrame) * speed);
      previousFrame = now;
      playbackRef.current = next;
      setPlaybackAt(next);
      if (next >= end) {
        setPlaying(false);
        return;
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [end, playing, range, speed, start]);

  const sample = useMemo(() => playbackSampleAt(positions, playbackAt), [positions, playbackAt]);
  if (!range || !sample) return <div className="history-note">{t.history.flightWithoutPositions}</div>;

  function setTime(value: number): void {
    const next = Math.min(end, Math.max(start, value));
    playbackRef.current = next;
    setPlaybackAt(next);
    if (next < end) setPlaying(false);
  }

  return (
    <div className="history-playback">
      <HistoryMap positions={positions} sample={sample} />
      <div className="history-playback-controls">
        <div className="history-playback-toolbar">
          <button
            className="primary-button history-play-button"
            type="button"
            onClick={() => {
              if (playbackAt >= end) setTime(start);
              setPlaying((current) => !current);
            }}
            aria-label={playing ? t.history.pause : t.history.play}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <div className="history-playback-time" aria-live="polite">{formatTime(new Date(playbackAt).toISOString())}</div>
          <label className="history-speed-label">
            <span>{t.history.playbackSpeed}</span>
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              {[1, 4, 10].map((value) => <option key={value} value={value}>{value}×</option>)}
            </select>
          </label>
        </div>
        <input
          className="history-playback-slider"
          type="range"
          min={start}
          max={end}
          step={1000}
          value={playbackAt}
          onChange={(event) => setTime(Number(event.target.value))}
          aria-label={t.history.playback}
        />
        <div className="history-playback-range"><span>{formatTime(new Date(start).toISOString())}</span><span>{formatTime(new Date(end).toISOString())}</span></div>
        <div className="history-playback-readout">
          <div><span>{t.aircraft.altitude}</span><strong>{formatAltitude(sample.altitude)}</strong></div>
          <div><span>{t.aircraft.groundSpeed}</span><strong>{formatSpeed(sample.groundSpeed)}</strong></div>
          <div><span>{t.aircraft.track}</span><strong>{formatTrack(sample.track)}</strong></div>
        </div>
      </div>
    </div>
  );
}

function FlightCard({ flight, selected, onSelect }: { flight: HistoryFlightSummary; selected: boolean; onSelect: () => void }) {
  const route = flight.origin && flight.destination ? `${flight.origin} → ${flight.destination}` : t.common.emptyValue;
  return (
    <button className={`history-flight-row${selected ? " selected" : ""}`} type="button" onClick={onSelect} aria-pressed={selected}>
      <span className="history-flight-callsign">{flight.callsign || t.history.unknownCallsign}</span>
      <span className="history-flight-aircraft">{flight.registration || t.common.emptyValue} · {flight.aircraftType || t.aircraft.unknownAircraftType}</span>
      <span className="history-flight-route">{route}</span>
      <span className="history-flight-time">{formatTime(flight.startTime)}–{formatTime(flight.endTime ?? flight.lastSeenAt)}</span>
    </button>
  );
}

function FlightDetail({ detail, error, loading }: { detail: HistoryFlightDetail | null; error: string | null; loading: boolean }) {
  if (loading) return <div className="history-note">{t.common.loading}</div>;
  if (error) return <div className="history-note">{error}</div>;
  if (!detail) return <div className="history-note">{t.history.selectFlight}</div>;

  const { flight } = detail;
  const route = flight.origin && flight.destination ? `${flight.origin} → ${flight.destination}` : t.common.emptyValue;
  return (
    <div className="history-detail-content">
      <div className="history-detail-heading">
        <div>
          <div className="history-detail-callsign">{flight.callsign || t.history.unknownCallsign}</div>
          <div className="history-detail-registration">{flight.icaoHex} · {flight.registration || t.common.emptyValue}</div>
        </div>
        <span className="history-detail-badge">{flight.aircraftType || t.aircraft.unknownAircraftType}</span>
      </div>
      <div className="history-detail-grid">
        <div><span>{t.route.originDestination}</span><strong>{route}</strong></div>
        <div><span>{t.route.airline}</span><strong>{flight.airline || t.common.emptyValue}</strong></div>
        <div><span>{t.history.start}</span><strong>{formatDateTime(flight.startTime)}</strong></div>
        <div><span>{t.history.end}</span><strong>{formatDateTime(flight.endTime ?? flight.lastSeenAt)}</strong></div>
        <div><span>{t.history.maxAltitude}</span><strong>{formatAltitude(flight.maxAltitude)}</strong></div>
        <div><span>{t.history.minDistance}</span><strong>{formatDistance(flight.minDistanceKm)}</strong></div>
      </div>
      {detail.positions.length ? (
        <>
          {detail.truncated && <div className="history-note history-truncated">{t.history.playbackTruncated}</div>}
          <FlightPlayback positions={detail.positions} />
        </>
      ) : <div className="history-note">{t.history.flightWithoutPositions}</div>}
    </div>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [range, setRange] = useState<HistoryFlightRange>("7d");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [flights, setFlights] = useState<HistoryFlightSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<HistoryFlightDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadFlights = useCallback(async (nextRange: HistoryFlightRange, nextQuery: string): Promise<HistoryFlightSummary[] | null> => {
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ range: nextRange });
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      const response = await fetch(`/api/history/flights?${params.toString()}`, { cache: "no-store" });
      if (response.status === 503) throw new Error(t.history.databaseUnavailable);
      if (!response.ok) throw new Error(t.history.requestFailed);
      const result = (await response.json()) as { flights: HistoryFlightSummary[] };
      setFlights(result.flights);
      return result.flights;
    } catch (caught) {
      setFlights([]);
      setListError(caught instanceof Error ? caught.message : t.history.requestFailed);
      return null;
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: number, updateUrl = true): Promise<void> => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetailError(null);
    if (updateUrl) router.replace(`/history?flightId=${encodeURIComponent(String(id))}`, { scroll: false });
    try {
      const response = await fetch(`/api/history/flights/${encodeURIComponent(String(id))}`, { cache: "no-store" });
      if (response.status === 404) throw new Error(t.history.flightNotFound);
      if (response.status === 503) throw new Error(t.history.databaseUnavailable);
      if (!response.ok) throw new Error(t.history.requestFailed);
      setDetail((await response.json()) as HistoryFlightDetail);
    } catch (caught) {
      setDetail(null);
      setDetailError(caught instanceof Error ? caught.message : t.history.requestFailed);
    } finally {
      setDetailLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialRange = params.get("range");
    const nextRange: HistoryFlightRange = initialRange === "today" || initialRange === "yesterday" || initialRange === "7d" ? initialRange : "7d";
    const initialQuery = params.get("q") ?? "";
    const initialFlightId = Number(params.get("flightId"));
    const initialHex = params.get("hex");
    setRange(nextRange);
    setQuery(initialQuery);
    setSearchInput(initialQuery);
    void (async () => {
      await loadFlights(nextRange, initialQuery);
      if (Number.isSafeInteger(initialFlightId) && initialFlightId > 0) {
        await loadDetail(initialFlightId, false);
      } else if (initialHex) {
        const response = await fetch(`/api/history/flights?hex=${encodeURIComponent(initialHex)}&limit=1`, { cache: "no-store" });
        if (response.ok) {
          const result = (await response.json()) as { flights: HistoryFlightSummary[] };
          const flight = result.flights[0];
          if (flight) await loadDetail(flight.id);
        }
      }
    })();
  }, [loadDetail, loadFlights]);

  function selectRange(nextRange: HistoryFlightRange): void {
    setRange(nextRange);
    router.replace(`/history?range=${nextRange}${query ? `&q=${encodeURIComponent(query)}` : ""}`, { scroll: false });
    void loadFlights(nextRange, query);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextQuery = searchInput.trim();
    setQuery(nextQuery);
    router.replace(`/history?range=${range}${nextQuery ? `&q=${encodeURIComponent(nextQuery)}` : ""}`, { scroll: false });
    void loadFlights(range, nextQuery);
  }

  return (
    <main className="history-page">
      <div className="history-page-header">
        <div><h1>{t.history.title}</h1><p className="brand-subtitle">{t.history.subtitle}</p></div>
        <Link className="back-link" href="/">{t.history.backToRadar}</Link>
      </div>
      <section className="history-card history-v2-card">
        <div className="history-card-header">
          <strong>{t.history.listTitle}</strong>
          <p>{t.history.description}</p>
          <div className="history-toolbar">
            <div className="history-range-tabs" aria-label={t.history.flightList}>
              {(["today", "yesterday", "7d"] as const).map((value) => (
                <button key={value} className={range === value ? "active" : ""} type="button" onClick={() => selectRange(value)} aria-pressed={range === value}>
                  {value === "today" ? t.history.today : value === "yesterday" ? t.history.yesterday : t.history.lastSevenDays}
                </button>
              ))}
            </div>
            <form className="history-search-form" onSubmit={submitSearch}>
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t.history.searchFlights} aria-label={t.history.searchFlights} />
              <button className="primary-button" type="submit">{t.history.load}</button>
            </form>
          </div>
        </div>
        <div className="history-layout">
          <aside className="history-flight-list" aria-label={t.history.flightList}>
            {listLoading ? <div className="history-note">{t.common.loading}</div> : listError ? <div className="history-note">{listError}</div> : flights.length ? flights.map((flight) => (
              <FlightCard key={flight.id} flight={flight} selected={selectedId === flight.id} onSelect={() => void loadDetail(flight.id)} />
            )) : <div className="history-note">{query ? t.history.noMatchingFlights : t.history.noFlights}</div>}
          </aside>
          <section className="history-detail" aria-label={t.history.flightDetails}>
            <FlightDetail detail={detail} error={detailError} loading={detailLoading} />
          </section>
        </div>
      </section>
    </main>
  );
}
