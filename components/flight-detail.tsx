"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { HistoryFlightDetail } from "@/lib/server/history";
import { playbackSampleAt, playbackTimeRange, type PlaybackPosition, type PlaybackSample } from "@/lib/history/playback";
import { aircraftAirportHref } from "@/lib/aircraft/detail-links";
import { FlightProfile } from "@/components/flight-profile";

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

  return <div className="history-observed-path">
    <div className="history-path-heading"><strong>{t.history.observedPath}</strong><span>{t.history.observedPathDescription}</span></div>
    <div ref={containerRef} className="history-map" aria-label={t.history.trailMap} />
  </div>;
}

function PlaybackRouteContext({ flight }: { flight: HistoryFlightDetail["flight"] }) {
  if (!flight.origin && !flight.destination) return null;
  return <div className="history-route-context">
    <div><span>{t.history.routeContext}</span><strong>{flight.origin ? <AirportCodeLink code={flight.origin} /> : t.common.emptyValue} <span aria-hidden="true">→</span> {flight.destination ? <AirportCodeLink code={flight.destination} /> : t.common.emptyValue}</strong></div>
    <p>{t.history.routeContextDescription}</p>
  </div>;
}

function FlightPlayback({ positions, flight, onPlaybackChange }: { positions: PlaybackPosition[]; flight: HistoryFlightDetail["flight"]; onPlaybackChange: (timestamp: number) => void }) {
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
    onPlaybackChange(start);
    setPlaying(false);
  }, [end, onPlaybackChange, start]);

  useEffect(() => {
    if (!playing || !range || end <= start) return;
    let animationFrame = 0;
    let previousFrame = performance.now();
    const tick = (now: number) => {
      const next = Math.min(end, playbackRef.current + (now - previousFrame) * speed);
      previousFrame = now;
      playbackRef.current = next;
      setPlaybackAt(next);
      onPlaybackChange(next);
      if (next >= end) {
        setPlaying(false);
        return;
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [end, onPlaybackChange, playing, range, speed, start]);

  const sample = useMemo(() => playbackSampleAt(positions, playbackAt), [positions, playbackAt]);
  if (!range || !sample) return <div className="history-note">{t.history.flightWithoutPositions}</div>;

  function setTime(value: number): void {
    const next = Math.min(end, Math.max(start, value));
    playbackRef.current = next;
    setPlaybackAt(next);
    onPlaybackChange(next);
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
              {[0.5, 1, 2, 4, 10].map((value) => <option key={value} value={value}>{value}×</option>)}
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
        <div className="history-playback-range"><span>{t.history.start}: {formatDateTime(new Date(start).toISOString())}</span><span>{t.history.end}: {formatDateTime(new Date(end).toISOString())}</span></div>
        <div className="history-playback-readout">
          <div><span>{t.history.currentPoint}</span><strong>{sample.index + 1} / {positions.length}</strong></div>
          <div><span>{t.aircraft.altitude}</span><strong>{formatAltitude(sample.altitude)}</strong></div>
          <div><span>{t.aircraft.groundSpeed}</span><strong>{formatSpeed(sample.groundSpeed)}</strong></div>
          <div><span>{t.aircraft.track}</span><strong>{formatTrack(sample.track)}</strong></div>
        </div>
        <PlaybackRouteContext flight={flight} />
      </div>
    </div>
  );
}

function AirportCodeLink({ code }: { code: string | null }) {
  if (!code) return <span>{t.common.emptyValue}</span>;
  return <Link className="airport-link" href={aircraftAirportHref(code)}>{code}</Link>;
}

export function FlightDetailPanel({ detail }: { detail: HistoryFlightDetail }) {
  const { flight } = detail;
  const [playbackAt, setPlaybackAt] = useState<number | null>(null);
  const route = flight.origin && flight.destination ? (
    <>
      <AirportCodeLink code={flight.origin} /> <span aria-hidden="true">→</span> <AirportCodeLink code={flight.destination} />
    </>
  ) : t.common.emptyValue;

  return (
    <div className="history-detail-content">
      <div className="history-detail-heading">
        <div>
          <div className="history-detail-callsign">{flight.callsign || t.history.unknownCallsign}</div>
          <div className="history-detail-registration"><Link className="history-link" href={`/aircraft/${encodeURIComponent(flight.icaoHex)}`}>{flight.icaoHex}</Link> · {flight.registration || t.common.emptyValue}</div>
        </div>
        <span className="history-detail-badge">{flight.aircraftType || t.aircraft.unknownAircraftType}</span>
      </div>
      <div className="history-detail-grid">
        <div><span>{t.route.originDestination}</span><strong className="history-detail-route">{route}</strong></div>
        <div><span>{t.route.airline}</span><strong>{flight.airline || t.common.emptyValue}</strong></div>
        <div><span>{t.history.start}</span><strong>{formatDateTime(flight.startTime)}</strong></div>
        <div><span>{t.history.end}</span><strong>{formatDateTime(flight.endTime ?? flight.lastSeenAt)}</strong></div>
        <div><span>{t.history.maxAltitude}</span><strong>{formatAltitude(flight.maxAltitude)}</strong></div>
        <div><span>{t.history.minDistance}</span><strong>{formatDistance(flight.minDistanceKm)}</strong></div>
      </div>
      {detail.positions.length ? (
        <>
          {detail.truncated && <div className="history-note history-truncated">{t.history.playbackTruncated}</div>}
          <FlightPlayback positions={detail.positions} flight={flight} onPlaybackChange={setPlaybackAt} />
          <FlightProfile positions={detail.positions} playbackAt={playbackAt} />
        </>
      ) : <div className="history-note">{t.history.flightWithoutPositions}</div>}
    </div>
  );
}

export function FlightDetailPage({ detail }: { detail: HistoryFlightDetail }) {
  const { flight } = detail;
  return (
    <main className="flight-page">
      <header className="flight-page-header">
        <div>
          <Link className="back-link" href="/history">{t.history.backToRadar}</Link>
          <div className="aircraft-page-kicker">{t.history.flightDetails}</div>
          <h1>{flight.callsign || t.history.unknownCallsign}</h1>
          <p className="flight-page-subtitle">
            <Link className="history-link" href={`/aircraft/${encodeURIComponent(flight.icaoHex)}`}>{flight.icaoHex}</Link>
            {flight.registration ? ` · ${flight.registration}` : ""}
          </p>
        </div>
        <Link className="back-link" href={`/history?flightId=${encodeURIComponent(String(flight.id))}`}>{t.history.viewHistory}</Link>
      </header>
      <section className="history-card flight-detail-card" aria-label={t.history.flightDetails}>
        <FlightDetailPanel detail={detail} />
      </section>
    </main>
  );
}
