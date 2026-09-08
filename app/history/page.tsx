"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { formatTime, t } from "@/lib/i18n";
import type { HistoryFlightDetail, HistoryFlightRange, HistoryFlightSummary } from "@/lib/server/history";
import { FlightDetailPanel } from "@/components/flight-detail";

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
            {detailLoading ? <div className="history-note">{t.common.loading}</div> : detailError ? <div className="history-note">{detailError}</div> : !detail ? <div className="history-note">{t.history.selectFlight}</div> : <FlightDetailPanel detail={detail} />}
          </section>
        </div>
      </section>
    </main>
  );
}
