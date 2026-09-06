"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRef } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import {
  flightSummary,
  formatAltitude,
  formatCoordinate,
  formatDateTime,
  formatDistance,
  formatSpeed,
  formatTrack,
  historySummary,
  t,
} from "@/lib/i18n";
import type { HistoryResponse } from "@/lib/server/history";

const HISTORY_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#0b1725" } },
    { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.58, "raster-saturation": -0.8 } },
  ],
};

function HistoryTrailMap({ positions }: { positions: HistoryResponse["positions"] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!containerRef.current || positions.length < 2) return;
    const map = new maplibregl.Map({ container: containerRef.current, style: HISTORY_MAP_STYLE, center: [positions[0].lon, positions[0].lat], zoom: 6, attributionControl: false });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("load", () => {
      map.addSource("history-trail", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: positions.map((position) => [position.lon, position.lat]) } } });
      map.addLayer({ id: "history-trail-line", type: "line", source: "history-trail", paint: { "line-color": "#f3b95f", "line-width": 3, "line-opacity": 0.9 } });
      const lons = positions.map((position) => position.lon);
      const lats = positions.map((position) => position.lat);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 45, maxZoom: 11, duration: 0 });
    });
    return () => map.remove();
  }, [positions]);
  return <div ref={containerRef} className="history-map" aria-label={t.history.trailMap} />;
}

export default function HistoryPage() {
  const [hex, setHex] = useState("");
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialHex = new URLSearchParams(window.location.search).get("hex");
    if (initialHex) {
      setHex(initialHex);
      void loadHistory(initialHex);
    }
    // The query string is intentionally read once on page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadHistory(value = hex) {
    const normalized = value.trim().toUpperCase();
    if (!normalized) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/history/${encodeURIComponent(normalized)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(t.history.requestFailed);
      setHistory((await response.json()) as HistoryResponse);
    } catch {
      setError(t.history.requestFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="history-page">
      <div className="history-page-header">
        <div><h1>{t.history.title}</h1><p className="brand-subtitle">{t.history.subtitle}</p></div>
        <Link className="back-link" href="/">{t.history.backToRadar}</Link>
      </div>
      <section className="history-card">
        <div className="history-card-header">
          <strong>{t.history.lookupAircraft}</strong>
          <p>{t.history.description}</p>
          <form className="history-form" onSubmit={(event) => { event.preventDefault(); void loadHistory(); }}>
            <input value={hex} onChange={(event) => setHex(event.target.value)} placeholder={t.history.icaoPlaceholder} aria-label={t.aircraft.icaoHex} />
            <button className="primary-button" type="submit">{loading ? t.common.loading : t.history.load}</button>
          </form>
        </div>
        {error && <div className="history-note">{error}</div>}
        {!history && !error && <div className="history-note">{t.history.enterIcao}</div>}
        {history && (
          <>
            <div className="history-note">{history.flight ? flightSummary(history.flight.callsign) : t.history.noRecordedFlight} · {historySummary(history.source, history.positions.length)}</div>
            {history.flight && <div className="history-summary">
              <div><span>{t.aircraft.registration}</span><strong>{history.flight.registration || t.common.emptyValue}</strong></div>
              <div><span>{t.aircraft.aircraftType}</span><strong>{history.flight.aircraftType || t.common.emptyValue}</strong></div>
              <div><span>{t.route.airline}</span><strong>{history.flight.airline || t.common.emptyValue}</strong></div>
              <div><span>{t.route.originDestination}</span><strong>{history.flight.origin && history.flight.destination ? `${history.flight.origin} → ${history.flight.destination}` : t.common.emptyValue}</strong></div>
              <div><span>{t.history.firstSeen}</span><strong>{formatDateTime(history.flight.startedAt)}</strong></div>
              <div><span>{t.history.lastSeen}</span><strong>{formatDateTime(history.flight.lastSeenAt)}</strong></div>
              <div><span>{t.history.maxAltitude}</span><strong>{formatAltitude(history.flight.maxAltitude)}</strong></div>
              <div><span>{t.history.minDistance}</span><strong>{formatDistance(history.flight.minDistanceKm)}</strong></div>
            </div>}
            {history.positions.length > 1 && <HistoryTrailMap positions={history.positions} />}
            {history.positions.length > 0 ? (
              <table className="history-table">
                <thead><tr><th>{t.history.recorded}</th><th>{t.aircraft.position}</th><th>{t.aircraft.altitude}</th><th>{t.aircraft.groundSpeed}</th><th>{t.aircraft.track}</th></tr></thead>
                <tbody>{history.positions.slice().reverse().map((position) => (
                  <tr key={`${position.recordedAt}-${position.lat}-${position.lon}`}>
                    <td>{formatDateTime(position.recordedAt)}</td>
                    <td>{formatCoordinate(position.lat)}, {formatCoordinate(position.lon)}</td>
                    <td>{formatAltitude(position.altitude)}</td>
                    <td>{formatSpeed(position.groundSpeed)}</td>
                    <td>{formatTrack(position.track)}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <div className="history-note">{t.history.noPositions}</div>}
          </>
        )}
      </section>
    </main>
  );
}
