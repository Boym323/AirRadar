"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReceiverRecapResponse } from "@/lib/aircraft/types";
import { formatDateTime, formatDistance, formatNumber, getTranslations, type LocaleKey } from "@/lib/i18n";

type RecapRange = "daily" | "weekly";

function value(value: number | null, distance = false): string {
  return distance ? formatDistance(value) : formatNumber(value);
}

function Metric({ label, value: metric }: { label: string; value: string }) {
  return <div className="recap-metric"><strong>{metric}</strong><span>{label}</span></div>;
}

export function RecapPage({ range }: { range: RecapRange }) {
  const [locale, setLocale] = useState<LocaleKey>("cs");
  const dictionary = getTranslations(locale);
  const [data, setData] = useState<ReceiverRecapResponse | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch(`/api/recap?range=${range}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("recap request failed");
        return await response.json() as ReceiverRecapResponse;
      })
      .then((next) => { if (active) { setData(next); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [range]);

  const title = range === "daily" ? dictionary.recap.dailyTitle : dictionary.recap.weeklyTitle;
  return <main className="history-page recap-page">
    <header className="history-page-header">
      <div><Link className="back-link" href="/">{dictionary.recap.backToRadar}</Link><h1>{title}</h1><p className="statistics-subtitle">{dictionary.recap.subtitle}</p></div>
      <nav className="system-nav" aria-label={dictionary.recap.navigation}><Link href="/recap/daily">{dictionary.recap.daily}</Link><Link href="/recap/weekly">{dictionary.recap.weekly}</Link><Link href="/alerts">{dictionary.alerts.title}</Link><button type="button" className="language-button" onClick={() => setLocale((current) => current === "cs" ? "en" : "cs")} aria-label={locale === "cs" ? "English" : "Čeština"}>{locale === "cs" ? "EN" : "CZ"}</button></nav>
    </header>
    {data && <p className="recap-period">{data.from} → {data.to} · {data.timezone} · {data.isCurrentDay ? dictionary.recap.currentDay : dictionary.recap.completedPeriod}</p>}
    {error && <p className="statistics-error" role="alert">{dictionary.recap.loadFailed}</p>}
    {!data && !error && <p className="statistics-empty">{dictionary.common.loading}</p>}
    {data && !data.hasData && <p className="statistics-empty">{dictionary.recap.noData}</p>}
    {data && data.hasData && <>
      <div className="recap-metrics"><Metric label={dictionary.recap.uniqueAircraft} value={value(data.uniqueAircraft)} /><Metric label={dictionary.recap.observedFlights} value={value(data.observedFlights)} /><Metric label={dictionary.recap.newAircraft} value={value(data.newAircraft)} /><Metric label={dictionary.recap.rareReturning} value={value(data.rareOrReturning)} /><Metric label={dictionary.recap.maxDistance} value={value(data.maxDistanceKm, true)} /><Metric label={dictionary.recap.coverage} value={value(data.coverageKm, true)} /><Metric label={dictionary.recap.alerts} value={value(data.alertCount)} /></div>
      <div className="recap-grid">
        <section className="recap-card"><h2>{dictionary.recap.topTypes}</h2>{data.topAircraftTypes.length ? <ol>{data.topAircraftTypes.map((item) => <li key={item.name}><span>{item.name}</span><strong>{formatNumber(item.count)}</strong></li>)}</ol> : <p>{dictionary.recap.noBreakdown}</p>}</section>
        <section className="recap-card"><h2>{dictionary.recap.topRoutes}</h2>{data.topRoutes.length ? <ol>{data.topRoutes.map((item) => <li key={`${item.origin}-${item.destination}`}><span>{item.origin} → {item.destination}</span><strong>{formatNumber(item.count)}</strong></li>)}</ol> : <p>{dictionary.recap.noBreakdown}</p>}</section>
        <section className="recap-card"><h2>{dictionary.recap.interesting}</h2>{data.interestingAircraft.length ? <ul>{data.interestingAircraft.map((item) => <li key={`${item.icaoHex}-${item.reason}`}><Link href={`/aircraft/${encodeURIComponent(item.icaoHex)}`}>{item.callsign ?? item.registration ?? item.icaoHex}</Link><span>{dictionary.recap.reasons[item.reason]}</span></li>)}</ul> : <p>{dictionary.recap.noInteresting}</p>}</section>
        <section className="recap-card"><h2>{dictionary.recap.bestReception}</h2>{data.bestReception ? <Link className="recap-record" href={`/aircraft/${encodeURIComponent(data.bestReception.icaoHex)}`}><strong>{formatDistance(data.bestReception.distanceKm)}</strong><span>{data.bestReception.icaoHex} · {data.bestReception.registration ?? dictionary.common.emptyValue}</span><small>{formatDateTime(data.bestReception.recordedAt, dictionary)}</small></Link> : <p>{dictionary.recap.noReception}</p>}</section>
      </div>
      {range === "weekly" && data.comparison && <section className="recap-card recap-comparison"><h2>{dictionary.recap.comparison}</h2>{data.comparison.hasData ? <div className="recap-comparison-grid"><div><span>{dictionary.recap.uniqueAircraft}</span><strong>{value(data.comparison.uniqueAircraft)}</strong></div><div><span>{dictionary.recap.observedFlights}</span><strong>{value(data.comparison.observedFlights)}</strong></div><div><span>{dictionary.recap.maxDistance}</span><strong>{value(data.comparison.maxDistanceKm, true)}</strong></div></div> : <p>{dictionary.recap.noComparison}</p>}</section>}
    </>}
  </main>;
}
