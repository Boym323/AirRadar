"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FleetAircraft, FleetResponse } from "@/lib/server/fleet";
import { formatDateTime, formatNumber, getTranslations, type LocaleDictionary, type LocaleKey } from "@/lib/i18n";
import type { AircraftPhotoApiResponse } from "@/lib/aircraft/photo";

function FleetPhoto({ aircraft, dictionary }: { aircraft: FleetAircraft; dictionary: LocaleDictionary }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [result, setResult] = useState<AircraftPhotoApiResponse | null>(null);
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);
  const registration = aircraft.registration?.trim() || aircraft.icaoHex;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || requested) return;
    if (typeof IntersectionObserver === "undefined") {
      setRequested(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setRequested(true);
      observer.disconnect();
    }, { rootMargin: "180px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, [requested]);

  useEffect(() => {
    if (!requested || result || failed) return;
    let active = true;
    void fetch(`/api/aircraft/${encodeURIComponent(aircraft.icaoHex)}/photo`, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as AircraftPhotoApiResponse : null)
      .then((value) => { if (active) setResult(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [aircraft.icaoHex, failed, requested, result]);

  const photo = result?.photo;
  return <div ref={hostRef} className={`fleet-photo${photo ? " has-photo" : ""}`}>
    {photo ? <a href={photo.sourceUrl} target="_blank" rel="noreferrer">
      {/* The photo endpoint validates the provider URL before it reaches the browser. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.thumbnailUrl} alt={`${dictionary.fleet.photoAlt} ${registration}`} loading="lazy" onError={() => setFailed(true)} />
    </a> : <span aria-hidden="true">✈</span>}
  </div>;
}

function FleetCard({ aircraft, dictionary }: { aircraft: FleetAircraft; dictionary: LocaleDictionary }) {
  return <article className="fleet-aircraft-card">
    <div className="fleet-aircraft-heading">
      <FleetPhoto aircraft={aircraft} dictionary={dictionary} />
      <div className="fleet-aircraft-title">
        <Link href={`/aircraft/${encodeURIComponent(aircraft.icaoHex)}`}><h2>{aircraft.registration || aircraft.icaoHex}</h2></Link>
        <div className="fleet-aircraft-subtitle">{aircraft.icaoHex} · {aircraft.aircraftType || dictionary.common.unknown}</div>
      </div>
      <span className={`fleet-live-status ${aircraft.live ? "live" : "offline"}`}>{aircraft.live ? dictionary.status.liveShort : dictionary.status.offlineShort}</span>
    </div>
    <dl className="fleet-aircraft-grid">
      <div><dt>{dictionary.fleet.operator}</dt><dd>{aircraft.operator || dictionary.common.emptyValue}</dd></div>
      <div><dt>{dictionary.fleet.callsign}</dt><dd>{aircraft.callsign || dictionary.common.emptyValue}</dd></div>
      <div><dt>{dictionary.fleet.lastObserved}</dt><dd>{formatDateTime(aircraft.lastObservedAt, dictionary)}</dd></div>
      <div><dt>{dictionary.fleet.observations7d}</dt><dd>{formatNumber(aircraft.observations7d, 0, dictionary.locale)}</dd></div>
      <div><dt>{dictionary.fleet.observations30d}</dt><dd>{formatNumber(aircraft.observations30d, 0, dictionary.locale)}</dd></div>
      <div><dt>{dictionary.fleet.topAirports}</dt><dd>{aircraft.topAirports.length ? aircraft.topAirports.map((airport) => `${airport.code} (${airport.count})`).join(", ") : dictionary.common.emptyValue}</dd></div>
    </dl>
    {aircraft.topRoutes.length > 0 && <div className="fleet-route"><span>{dictionary.fleet.topRoute}</span><strong>{aircraft.topRoutes[0]!.origin} → {aircraft.topRoutes[0]!.destination}</strong><small>{formatNumber(aircraft.topRoutes[0]!.count, 0, dictionary.locale)}×</small></div>}
  </article>;
}

export function FleetPage({ data }: { data: FleetResponse }) {
  const [locale, setLocale] = useState<LocaleKey>("cs");
  const dictionary = getTranslations(locale);
  return <main className="history-page fleet-page">
    <header className="history-page-header fleet-page-header">
      <div>
        <Link className="back-link" href="/watchlist">{dictionary.fleet.backToWatchlist}</Link>
        <h1>{dictionary.fleet.title}</h1>
        <p className="statistics-subtitle">{dictionary.fleet.subtitle}</p>
      </div>
      <nav className="fleet-nav" aria-label={dictionary.fleet.navigation}>
        <Link href="/">{dictionary.fleet.backToRadar}</Link>
        <button type="button" className="language-button" onClick={() => setLocale((current) => current === "cs" ? "en" : "cs")} aria-label={locale === "cs" ? "English" : "Čeština"}>{locale === "cs" ? "EN" : "CZ"}</button>
      </nav>
    </header>
    {data.ignoredRuleCount > 0 && <p className="fleet-note">{dictionary.fleet.ignoredRules(data.ignoredRuleCount)}</p>}
    {data.aircraft.length === 0 ? <section className="statistics-card fleet-empty"><h2>{dictionary.fleet.emptyTitle}</h2><p>{dictionary.fleet.emptyDescription}</p><Link className="primary-button" href="/watchlist">{dictionary.fleet.openWatchlist}</Link></section> : <div className="fleet-grid">{data.aircraft.map((aircraft) => <FleetCard key={aircraft.icaoHex} aircraft={aircraft} dictionary={dictionary} />)}</div>}
  </main>;
}
