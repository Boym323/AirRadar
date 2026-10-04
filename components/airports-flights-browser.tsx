"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Airport } from "@/lib/airports/types";
import type { HistoryFlightRange, HistoryFlightSummary } from "@/lib/server/history";
import { formatAltitude, formatDateTime, t } from "@/lib/i18n";
import { EmptyState, Panel } from "@/components/ui-primitives";

function BrowserHeader({ title, description, search, onSearch, placeholder, count, children }: {
  title: string; description: string; search: string; onSearch: (value: string) => void;
  placeholder: string; count: number | null; children?: React.ReactNode;
}) {
  return <header className="browse-page-header">
    <div><div className="ui-kicker">AIRRADAR / OPERATIONS</div><h1>{title}</h1><p>{description}</p></div>
    <div className="browse-header-meta">{count !== null && <span>{count.toLocaleString(t.locale)} {t.browse.results}</span>}<Link className="back-link" href="/">{t.browse.backToRadar}</Link></div>
    <div className="browse-controls">
      <label className="browse-search"><span className="sr-only">{placeholder}</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={placeholder} autoComplete="off" /></label>
      {children}
    </div>
  </header>;
}

function BrowserState({ kind, title, description }: { kind: "loading" | "empty" | "error"; title: string; description?: string }) {
  return <EmptyState className={`browse-state browse-state-${kind}`} title={title} description={description} />;
}

export function AirportsPage() {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/airports", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("airport request failed");
      return await response.json() as Airport[];
    }).then((value) => { if (active) setAirports(value); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toUpperCase();
    return airports.filter((airport) => !query || [airport.icaoCode, airport.iataCode, airport.name, airport.city, airport.country].some((value) => value?.toUpperCase().includes(query))).sort((a, b) => a.icaoCode.localeCompare(b.icaoCode));
  }, [airports, search]);

  return <main className="browse-page">
    <BrowserHeader title={t.browse.airportsTitle} description={t.browse.airportsDescription} search={search} onSearch={setSearch} placeholder={t.browse.airportsSearch} count={loading || error ? null : visible.length} />
    <Panel className="browse-panel">
      <div className="browse-list-heading"><span>{t.browse.airportIdentity}</span><span>{t.browse.airportLocation}</span></div>
      {loading ? <BrowserState kind="loading" title={t.common.loading} /> : error ? <BrowserState kind="error" title={t.browse.unavailable} description={t.browse.tryAgain} /> : visible.length === 0 ? <BrowserState kind="empty" title={search ? t.browse.noResults : t.browse.noAirports} description={search ? t.browse.clearSearch : undefined} /> : <div className="browse-list">{visible.map((airport) => <Link className="browse-row airport-browse-row" href={`/airports/${encodeURIComponent(airport.icaoCode)}`} key={airport.icaoCode}><span className="browse-primary-code"><strong>{airport.icaoCode}</strong><small>{airport.iataCode || t.common.emptyValue}</small></span><span className="browse-secondary"><strong>{airport.name}</strong><small>{[airport.city, airport.country].filter(Boolean).join(" · ") || t.common.emptyValue}</small></span><span className="browse-row-arrow" aria-hidden="true">→</span></Link>)}</div>}
    </Panel>
  </main>;
}

export function FlightsPage() {
  const [range, setRange] = useState<HistoryFlightRange>("7d");
  const [search, setSearch] = useState("");
  const [destination, setDestination] = useState<string | null>(null);
  const [flights, setFlights] = useState<HistoryFlightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextRange = params.get("range");
    setRange(nextRange === "today" || nextRange === "yesterday" || nextRange === "7d" ? nextRange : "7d");
    setSearch(params.get("q") ?? "");
    const nextDestination = params.get("destination")?.trim().toUpperCase() ?? "";
    setDestination(/^[A-Z]{4}$/.test(nextDestination) ? nextDestination : null);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const params = new URLSearchParams({ range });
    if (search.trim()) params.set("q", search.trim());
    if (destination) params.set("destination", destination);
    setLoading(true); setError(false);
    void fetch(`/api/history/flights?${params.toString()}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("flight request failed");
      return await response.json() as { flights: HistoryFlightSummary[] };
    }).then((value) => { if (active) setFlights(value.flights); }).catch((caught) => { if (active && (caught as Error).name !== "AbortError") { setFlights([]); setError(true); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [range, search, destination]);

  function replaceFlightsUrl(nextRange: HistoryFlightRange, nextSearch: string, nextDestination: string | null) {
    const params = new URLSearchParams({ range: nextRange });
    if (nextSearch.trim()) params.set("q", nextSearch.trim());
    if (nextDestination) params.set("destination", nextDestination);
    window.history.replaceState(null, "", `/flights?${params.toString()}`);
  }

  function updateRange(next: HistoryFlightRange) {
    setRange(next);
    replaceFlightsUrl(next, search, destination);
  }

  function updateSearch(value: string) {
    setSearch(value);
    replaceFlightsUrl(range, value, destination);
  }

  function clearDestination() {
    setDestination(null);
    replaceFlightsUrl(range, search, null);
  }

  return <main className="browse-page">
    <BrowserHeader title={t.browse.flightsTitle} description={t.browse.flightsDescription} search={search} onSearch={updateSearch} placeholder={t.browse.flightsSearch} count={loading || error ? null : flights.length}>
      <div className="browse-segmented" role="group" aria-label={t.history.flightList}>{(["today", "yesterday", "7d"] as const).map((value) => <button key={value} type="button" className={range === value ? "active" : ""} aria-pressed={range === value} onClick={() => updateRange(value)}>{value === "today" ? t.history.today : value === "yesterday" ? t.history.yesterday : t.history.lastSevenDays}</button>)}</div>
      {destination ? <button type="button" className="browse-filter-chip" onClick={clearDestination}>{t.route.destination}: {destination} ×</button> : null}
    </BrowserHeader>
    <Panel className="browse-panel">
      <div className="browse-list-heading flight-browse-heading"><span>{t.browse.flightIdentity}</span><span>{t.browse.flightTelemetry}</span><span>{t.browse.flightTiming}</span></div>
      {loading ? <BrowserState kind="loading" title={t.common.loading} /> : error ? <BrowserState kind="error" title={t.browse.unavailable} description={t.browse.tryAgain} /> : flights.length === 0 ? <BrowserState kind="empty" title={search ? t.browse.noResults : t.browse.noFlights} description={search ? t.browse.clearSearch : undefined} /> : <div className="browse-list">{flights.map((flight) => <Link className="browse-row flight-browse-row" href={`/flights/${encodeURIComponent(String(flight.id))}`} key={flight.id}><span className="browse-secondary"><strong className="browse-mono">{flight.callsign || t.history.unknownCallsign}</strong><small>{flight.origin || t.common.emptyValue} → {flight.destination || t.common.emptyValue}</small></span><span className="browse-secondary"><strong>{flight.aircraftType || t.aircraft.unknownAircraftType} <span className="browse-muted">· {flight.registration || t.common.emptyValue}</span></strong><small>{formatAltitude(flight.maxAltitude)} · {flight.icaoHex}</small></span><span className="browse-secondary browse-time"><strong>{formatDateTime(flight.startTime)}</strong><small>{formatDateTime(flight.endTime ?? flight.lastSeenAt)}</small></span></Link>)}</div>}
    </Panel>
  </main>;
}
