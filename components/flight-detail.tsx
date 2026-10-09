"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
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
import type { FlightStoryEvent, HistoryFlightDetail } from "@/lib/server/history";
import { playbackSampleAt, playbackTimeRange, type PlaybackPosition, type PlaybackSample } from "@/lib/history/playback";
import { MapTimeController, contextResolutionBucket } from "@/lib/map-time/controller";
import type { MapContextManifest } from "@/lib/server/map-context";
import { aircraftAirportHref } from "@/lib/aircraft/detail-links";
import { FlightProfile } from "@/components/flight-profile";
import { FlightEvidenceE5Panel } from "@/components/flight-evidence-e5";
import { configureMapLibreWorker } from "@/lib/maplibre-worker";
import {
  buildFlightStoryNarrative,
  buildFlightStoryV2Summary,
  type FlightStoryNarrativeItem,
} from "@/lib/flight-story/narrative";

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

function HistoryMap({ positions, sample, events, selectedEventId }: { positions: PlaybackPosition[]; sample: PlaybackSample | null; events: FlightStoryEvent[]; selectedEventId: number | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectedEventIdRef = useRef<number | null>(selectedEventId);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const markerPlaneRef = useRef<HTMLDivElement | null>(null);
  const sampleRef = useRef<PlaybackSample | null>(sample);
  sampleRef.current = sample;
  selectedEventIdRef.current = selectedEventId;

  useEffect(() => {
    if (!containerRef.current || !positions.length) return;
    configureMapLibreWorker();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: HISTORY_MAP_STYLE,
      center: [positions[0].lon, positions[0].lat],
      zoom: 7,
      attributionControl: false,
    });
    mapRef.current = map;
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

      map.addSource("flight-story-events", {
        type: "geojson",
        data: { type: "FeatureCollection", features: events.filter((event) => event.latitude !== null && event.longitude !== null).map((event) => ({
          type: "Feature" as const,
          properties: { id: event.id, selected: event.id === selectedEventIdRef.current, type: event.type },
          geometry: { type: "Point" as const, coordinates: [event.longitude!, event.latitude!] },
        })) },
      });
      map.addLayer({ id: "flight-story-events", type: "circle", source: "flight-story-events", paint: {
        "circle-radius": ["case", ["get", "selected"], 8, 5],
        "circle-color": ["case", ["get", "selected"], "#f3b95f", "#9b8cff"],
        "circle-stroke-color": "#08111d", "circle-stroke-width": 2,
      } });

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
  }, [events, positions]);

  useEffect(() => {
    const source = mapRef.current?.getSource("flight-story-events");
    if (!source || !("setData" in source)) return;
    (source as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: events.filter((event) => event.latitude !== null && event.longitude !== null).map((event) => ({
      type: "Feature" as const,
      properties: { id: event.id, selected: event.id === selectedEventId, type: event.type },
      geometry: { type: "Point" as const, coordinates: [event.longitude!, event.latitude!] },
    })) });
  }, [events, selectedEventId]);

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

function formatStoryDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} h ${minutes.toString().padStart(2, "0")} min`;
  return `${minutes} min`;
}

function formatVerticalRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return t.common.emptyValue;
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString(t.locale === "cs" ? "cs-CZ" : "en-US")} ft/min`;
}

function flightStoryEventLabel(type: string | null): string {
  if (!type) return t.common.emptyValue;
  const labels = t.intelligence.types as Record<string, string>;
  return labels[type] ?? type.replaceAll("_", " ");
}

function flightStoryNarrativeContext(item: FlightStoryNarrativeItem): string {
  return [
    item.airportIcao,
    item.runway ? `RWY ${item.runway}` : null,
    item.sectorId,
  ].filter(Boolean).join(" · ");
}

function FlightStoryHero({ detail }: { detail: HistoryFlightDetail }) {
  const summary = useMemo(() => buildFlightStoryV2Summary(detail), [detail]);
  const { flight } = detail;
  const route = flight.origin || flight.destination
    ? <><AirportCodeLink code={flight.origin} /> <span aria-hidden="true">→</span> <AirportCodeLink code={flight.destination} /></>
    : t.common.emptyValue;

  return <section className="flight-story-v2-hero" data-testid="flight-story-v2-summary" aria-labelledby="flight-story-v2-title">
    <div className="flight-story-v2-identity">
      <span className="flight-story-v2-kicker">{t.history.storyV2}</span>
      <div className="flight-story-v2-title-row">
        <div>
          <h2 id="flight-story-v2-title">{flight.callsign || t.history.unknownCallsign}</h2>
          <p><Link className="history-link" href={`/aircraft/${encodeURIComponent(flight.icaoHex)}`}>{flight.icaoHex}</Link>{flight.registration ? ` · ${flight.registration}` : ""}{flight.aircraftType ? ` · ${flight.aircraftType}` : ""}</p>
        </div>
        <span className="flight-story-v2-route-context"><small>{t.history.routeContext}</small><strong className="flight-story-v2-route">{route}</strong></span>
      </div>
      {summary.badges.length > 0 ? <div className="flight-story-v2-badges" aria-label={t.history.storyHighlights}>
        {summary.badges.map((type) => <span key={type}>{flightStoryEventLabel(type)}</span>)}
      </div> : null}
      <p className="flight-story-v2-disclaimer">{t.history.storyEvidenceDisclaimer}</p>
    </div>

    <div className="flight-story-v2-metrics">
      <div><span>{t.history.observedWindow}</span><strong>{formatStoryDuration(summary.observedDurationMs)}</strong><small>{formatTime(summary.observedStartAt)}–{formatTime(summary.observedEndAt)}</small></div>
      <div><span>{t.history.maxAltitude}</span><strong>{formatAltitude(flight.maxAltitude)}</strong></div>
      <div><span>{t.history.maxGroundSpeed}</span><strong>{formatSpeed(summary.maxGroundSpeedKt)}</strong></div>
      <div><span>{t.history.sampledPath}</span><strong>{formatDistance(summary.sampledPathDistanceKm)}</strong><small>{summary.sampled ? t.history.sampledPathBounded : t.history.sampledPathObserved}</small></div>
      <div><span>{t.history.storyEvents}</span><strong>{summary.eventCount}</strong><small>{summary.attentionEventCount ? t.history.storyAttention(summary.attentionEventCount) : t.history.storyNoAttention}</small></div>
      <div><span>{t.history.positionCount}</span><strong>{summary.positionCount}</strong><small>{summary.sampled ? t.history.sampledPositions : t.history.observedPositions}</small></div>
    </div>
  </section>;
}

function FlightNarrativeTimeline({
  items,
  events,
  currentTime,
  selectedEventId,
  onSeek,
  onSelect,
}: {
  items: FlightStoryNarrativeItem[];
  events: FlightStoryEvent[];
  currentTime: number;
  selectedEventId: number | null;
  onSeek: (timestamp: number) => void;
  onSelect: (event: FlightStoryEvent | null) => void;
}) {
  const activeIndex = items.reduce((current, item, index) => Date.parse(item.occurredAt) <= currentTime ? index : current, 0);
  return <section className="flight-story-v2-narrative" aria-labelledby="flight-story-v2-narrative-title" data-testid="flight-story-v2-narrative">
    <div className="flight-story-v2-narrative-heading">
      <div><strong id="flight-story-v2-narrative-title">{t.history.storyNarrative}</strong><span>{t.history.storyNarrativeDescription}</span></div>
      <small>{t.history.storyEvidenceDisclaimer}</small>
    </div>
    <ol className="flight-story-v2-narrative-list">
      {items.map((item, index) => {
        const event = item.eventId === null ? null : events.find((candidate) => candidate.id === item.eventId) ?? null;
        const context = flightStoryNarrativeContext(item);
        const label = item.boundary === "first_seen"
          ? t.history.firstSeen
          : item.boundary === "last_seen"
            ? t.history.lastSeen
            : flightStoryEventLabel(item.type);
        const selected = item.eventId !== null && item.eventId === selectedEventId;
        return <li key={item.key} className={`${item.provenance}${selected ? " selected" : ""}${index === activeIndex ? " current" : ""}`}>
          <button type="button" onClick={() => {
            onSelect(event);
            onSeek(Date.parse(item.occurredAt));
          }}>
            <span className="flight-story-v2-node" aria-hidden="true" />
            <span className="flight-story-v2-time"><time dateTime={item.occurredAt}>{formatTime(item.occurredAt)}</time><small>{item.provenance === "observed" ? t.history.storyObserved : t.history.storyInferred}</small></span>
            <span className="flight-story-v2-event">
              <strong>{label}</strong>
              {context ? <small>{context}</small> : null}
            </span>
            <span className="flight-story-v2-telemetry">
              <small>{t.aircraft.altitude}<strong>{formatAltitude(item.telemetry.altitude)}</strong></small>
              <small>{t.aircraft.groundSpeed}<strong>{formatSpeed(item.telemetry.groundSpeed)}</strong></small>
              <small>{t.aircraft.verticalRate}<strong>{formatVerticalRate(item.telemetry.verticalRate)}</strong></small>
            </span>
            {item.confidenceLevel ? <span className={`flight-story-v2-confidence ${item.confidenceLevel}`}>{t.intelligence.confidence[item.confidenceLevel]}</span> : null}
          </button>
        </li>;
      })}
    </ol>
  </section>;
}

function FlightPlayback({ positions, flight, events, narrative, initialAt, selectedEventId, onPlaybackChange, onEventSelect }: { positions: PlaybackPosition[]; flight: HistoryFlightDetail["flight"]; events: FlightStoryEvent[]; narrative: FlightStoryNarrativeItem[]; initialAt?: number | null; selectedEventId: number | null; onPlaybackChange: (timestamp: number) => void; onEventSelect: (event: FlightStoryEvent | null) => void }) {
  const range = useMemo(() => playbackTimeRange(positions), [positions]);
  const start = range?.start ?? 0;
  const end = range?.end ?? 0;
  const [playbackAt, setPlaybackAt] = useState(() => initialAt !== null && initialAt !== undefined && initialAt >= start && initialAt <= end ? initialAt : start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const playbackRef = useRef(start);
  const mapTime = useRef(new MapTimeController());

  useEffect(() => {
    const initial = initialAt !== null && initialAt !== undefined && initialAt >= start && initialAt <= end ? initialAt : start;
    playbackRef.current = initial;
    setPlaybackAt(initial);
    mapTime.current.seek(new Date(initial));
    onPlaybackChange(initial);
    setPlaying(false);
  }, [end, initialAt, onPlaybackChange, start]);

  useEffect(() => {
    if (!playing || !range || end <= start) return;
    let animationFrame = 0;
    let previousFrame = performance.now();
    const tick = (now: number) => {
      const next = Math.min(end, playbackRef.current + (now - previousFrame) * speed);
      previousFrame = now;
      playbackRef.current = next;
      setPlaybackAt(next);
      mapTime.current.seek(new Date(next));
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
    mapTime.current.seek(new Date(next));
    onPlaybackChange(next);
    if (next < end) setPlaying(false);
  }

  return (
    <div className="history-playback">
      <HistoryMap positions={positions} sample={sample} events={events} selectedEventId={selectedEventId} />
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
        <FlightNarrativeTimeline items={narrative} events={events} currentTime={playbackAt} selectedEventId={selectedEventId} onSeek={setTime} onSelect={onEventSelect} />
      </div>
    </div>
  );
}

function AirportCodeLink({ code }: { code: string | null }) {
  if (!code) return <span>{t.common.emptyValue}</span>;
  return <Link className="airport-link" href={aircraftAirportHref(code)}>{code}</Link>;
}

function FlightStoryContext({ playbackAt }: { playbackAt: number | null }) {
  const [context, setContext] = useState<MapContextManifest | null>(null);
  const playbackAtRef = useRef(playbackAt);
  playbackAtRef.current = playbackAt;
  const contextBucket = playbackAt === null ? null : contextResolutionBucket(playbackAt, 5 * 60_000);
  useEffect(() => {
    if (contextBucket === null) return;
    const currentPlaybackAt = playbackAtRef.current;
    if (currentPlaybackAt === null) return;
    const requestedAt = new Date(currentPlaybackAt).toISOString();
    const controller = new AbortController();
    void fetch(`/api/map-context/at?at=${encodeURIComponent(requestedAt)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<MapContextManifest> : null)
      .then((value) => setContext(value))
      .catch(() => { if (!controller.signal.aborted) setContext(null); });
    return () => controller.abort();
  }, [contextBucket]);
  if (playbackAt === null) return null;
  const layer = (value: { available: boolean; resolution: { resolvedAt: string | null }; source: string }): string => value.available ? `${value.resolution.resolvedAt ?? t.common.unknown} · ${value.source}` : t.history.noHistoricalContext;
  return <section className="flight-story-context" aria-label={t.history.contextAt}>
    <div className="flight-story-context-heading"><strong>{t.history.contextAt} {formatTime(new Date(playbackAt).toISOString())}</strong><Link className="history-link" href={`/time-machine?at=${encodeURIComponent(new Date(playbackAt).toISOString())}`}>{t.history.openWholeSky}</Link></div>
    <div className="flight-story-context-grid"><span>{t.layers.weatherRadar}</span><strong>{layer(context?.radar ?? { available: false, source: "OBSERVED", resolution: { resolvedAt: null } } as MapContextManifest["radar"])}</strong><span>{t.layers.metar}</span><strong>{layer(context?.metar ?? { available: false, source: "OBSERVED", resolution: { resolvedAt: null } } as MapContextManifest["metar"])}</strong><span>{t.layers.windAloft}</span><strong>{layer(context?.wind ?? { available: false, source: "MODEL", resolution: { resolvedAt: null } } as MapContextManifest["wind"])}</strong><span>{t.layers.airspaceActivity}</span><strong>{layer(context?.aup ?? { available: false, source: "PLANNED", resolution: { resolvedAt: null } } as MapContextManifest["aup"])}</strong></div>
  </section>;
}

export function FlightDetailPanel({ detail, initialAt }: { detail: HistoryFlightDetail; initialAt?: number | null }) {
  const { flight } = detail;
  const [playbackAt, setPlaybackAt] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const narrative = useMemo(() => buildFlightStoryNarrative(detail), [detail]);

  return (
    <div className="history-detail-content">
      <FlightStoryHero detail={detail} />
      {detail.positions.length ? (
        <>
          {detail.truncated && <div className="history-note history-truncated">{t.history.playbackTruncated}</div>}
          <FlightPlayback positions={detail.positions} flight={flight} events={detail.events} narrative={narrative} initialAt={initialAt} selectedEventId={selectedEventId} onPlaybackChange={setPlaybackAt} onEventSelect={(event) => setSelectedEventId(event?.id ?? null)} />
          <FlightProfile positions={detail.positions} playbackAt={playbackAt} />
          <FlightStoryContext playbackAt={playbackAt} />
          {playbackAt !== null && <Link className="history-link flight-story-time-machine-link" href={`/time-machine?at=${encodeURIComponent(new Date(playbackAt).toISOString())}`}>{t.history.openWholeSky}</Link>}
        </>
      ) : <div className="history-note">{t.history.flightWithoutPositions}</div>}
    </div>
  );
}

export function FlightDetailPage({ detail, initialAt }: { detail: HistoryFlightDetail; initialAt?: number | null }) {
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
        {/* Legacy shape: <FlightDetailPanel detail={detail} />; initialAt extends it without changing the route. */}
        <FlightDetailPanel detail={detail} initialAt={initialAt} />
      </section>
      <FlightEvidenceE5Panel flightId={flight.id} />
    </main>
  );
}
