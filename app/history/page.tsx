"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { HistoryResponse } from "@/lib/server/history";

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
