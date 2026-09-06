"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRef } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
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
  return <div ref={containerRef} className="history-map" aria-label="Flight trail map" />;
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
      if (!response.ok) throw new Error("History request failed");
      setHistory((await response.json()) as HistoryResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load history");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="history-page">
      <div className="history-page-header">
        <div><h1>Flight history</h1><p className="brand-subtitle">SAMPLED TRACKS FROM AIRRADAR</p></div>
        <Link className="back-link" href="/">← Back to radar</Link>
      </div>
      <section className="history-card">
        <div className="history-card-header">
          <strong>Look up an aircraft</strong>
          <p>Historical positions are sampled every 20 seconds when PostgreSQL is configured. Demo mode also exposes the in-memory trail.</p>
          <form className="history-form" onSubmit={(event) => { event.preventDefault(); void loadHistory(); }}>
            <input value={hex} onChange={(event) => setHex(event.target.value)} placeholder="ICAO hex, e.g. 896139" aria-label="ICAO hex" />
            <button className="primary-button" type="submit">{loading ? "Loading…" : "Load history"}</button>
          </form>
        </div>
        {error && <div className="history-note">{error}</div>}
        {!history && !error && <div className="history-note">Enter an ICAO hex to inspect the most recent sampled flight track.</div>}
        {history && (
          <>
            <div className="history-note">{history.flight?.callsign || history.flight ? `Flight ${history.flight.callsign || "unknown callsign"}` : "No recorded flight"} · source: {history.source} · {history.positions.length} positions</div>
            {history.flight && <div className="history-summary">
              <div><span>Registration</span><strong>{history.flight.registration || "—"}</strong></div>
              <div><span>Aircraft type</span><strong>{history.flight.aircraftType || "—"}</strong></div>
              <div><span>Airline</span><strong>{history.flight.airline || "—"}</strong></div>
              <div><span>Route</span><strong>{history.flight.origin && history.flight.destination ? `${history.flight.origin} → ${history.flight.destination}` : "—"}</strong></div>
              <div><span>First seen</span><strong>{history.flight.startedAt ? new Date(history.flight.startedAt).toLocaleString() : "—"}</strong></div>
              <div><span>Last seen</span><strong>{history.flight.lastSeenAt ? new Date(history.flight.lastSeenAt).toLocaleString() : "—"}</strong></div>
              <div><span>Max altitude</span><strong>{history.flight.maxAltitude === null ? "—" : `${history.flight.maxAltitude.toLocaleString()} ft`}</strong></div>
              <div><span>Min distance</span><strong>{history.flight.minDistanceKm === null ? "—" : `${history.flight.minDistanceKm.toFixed(1)} km`}</strong></div>
            </div>}
            {history.positions.length > 1 && <HistoryTrailMap positions={history.positions} />}
            {history.positions.length > 0 ? (
              <table className="history-table">
                <thead><tr><th>Recorded</th><th>Position</th><th>Altitude</th><th>Speed</th><th>Track</th></tr></thead>
                <tbody>{history.positions.slice().reverse().map((position) => (
                  <tr key={`${position.recordedAt}-${position.lat}-${position.lon}`}>
                    <td>{new Date(position.recordedAt).toLocaleString()}</td>
                    <td>{position.lat.toFixed(4)}, {position.lon.toFixed(4)}</td>
                    <td>{position.altitude === null ? "—" : `${position.altitude.toLocaleString()} ft`}</td>
                    <td>{position.groundSpeed === null ? "—" : `${Math.round(position.groundSpeed)} kt`}</td>
                    <td>{position.track === null ? "—" : `${Math.round(position.track)}°`}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <div className="history-note">No sampled positions found for this aircraft yet.</div>}
          </>
        )}
      </section>
    </main>
  );
}
