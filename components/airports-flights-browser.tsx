"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Airport } from "@/lib/airports/types";
import { t } from "@/lib/i18n";
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

