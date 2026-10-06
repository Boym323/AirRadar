"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RecapDailyHighlight, RecapDailyWeatherHighlight, ReceiverRecapResponse } from "@/lib/aircraft/types";
import { formatAltitude, formatDateTime, formatDistance, formatNumber, formatSpeed, formatTime, getTranslations, type LocaleKey } from "@/lib/i18n";

type RecapRange = "daily" | "weekly";
type Dictionary = ReturnType<typeof getTranslations>;

function value(value: number | null, dictionary: Dictionary, distance = false): string {
  return distance
    ? formatDistance(value, dictionary)
    : formatNumber(value, 0, dictionary.locale);
}

function Metric({ label, value: metric }: { label: string; value: string }) {
  return <div className="recap-metric"><strong>{metric}</strong><span>{label}</span></div>;
}

function hourWindow(hour: number): string {
  const start = Math.min(23, Math.max(0, Math.trunc(hour))).toString().padStart(2, "0");
  return `${start}:00–${start}:59`;
}

function highlightLabel(item: RecapDailyHighlight, dictionary: Dictionary): string {
  if (item.kind === "flight_event" && item.eventType) {
    const labels = dictionary.intelligence.types as Record<string, string>;
    return labels[item.eventType] ?? item.eventType;
  }
  return dictionary.recap.dailyHighlightTypes[item.kind as keyof typeof dictionary.recap.dailyHighlightTypes]
    ?? dictionary.recap.operationalEvents;
}

function highlightIdentity(item: RecapDailyHighlight): string {
  return item.callsign ?? item.registration ?? item.icaoHex;
}

function highlightContext(item: RecapDailyHighlight, dictionary: Dictionary): string {
  const context = [
    item.airportIcao,
    item.runway ? `RWY ${item.runway}` : null,
    item.squawk ? `Squawk ${item.squawk}` : null,
    item.distanceKm !== null ? formatDistance(item.distanceKm, dictionary) : null,
    item.confidenceLevel ? dictionary.intelligence.confidence[item.confidenceLevel] : null,
  ].filter(Boolean);
  return context.join(" · ") || item.icaoHex;
}

function weatherHighlightLabel(item: RecapDailyWeatherHighlight, dictionary: Dictionary): string {
  return item.kind === "turbulence" ? dictionary.recap.weatherTurbulence : dictionary.recap.weatherStrongWind;
}

function weatherHighlightContext(item: RecapDailyWeatherHighlight, dictionary: Dictionary): string {
  const weather = item.kind === "turbulence"
    ? dictionary.recap.weatherTurbulenceValue(formatNumber(item.turbulenceLevel, 0, dictionary.locale))
    : dictionary.recap.weatherWindValue(
      item.windDirectionDeg === null ? dictionary.common.emptyValue : `${formatNumber(item.windDirectionDeg, 0, dictionary.locale)}°`,
      formatSpeed(item.windSpeedKt, dictionary),
    );
  return [
    formatAltitude(item.altitudeFt, dictionary),
    weather,
    `${item.quality} · ${item.source}`,
  ].join(" · ");
}

function DailyIntelligence({ data, dictionary }: { data: ReceiverRecapResponse; dictionary: Dictionary }) {
  const intelligence = data.dailyIntelligence;
  if (!intelligence) return null;
  const topAirline = intelligence.topAirlines[0] ?? null;
  const topAirport = intelligence.topAirports[0] ?? null;
  const eventCount = intelligence.eventCounts.goArounds
    + intelligence.eventCounts.holdings
    + intelligence.eventCounts.diversions
    + intelligence.eventCounts.emergencies
    + intelligence.eventCounts.unusualTurns
    + intelligence.eventCounts.orbits;

  return <>
    <section className="recap-today-hero" aria-labelledby="recap-today-title" data-testid="daily-intelligence">
      <div className="recap-today-copy">
        <span className="recap-today-kicker">{dictionary.recap.dailyIntelligenceTitle}</span>
        <h2 id="recap-today-title">{dictionary.recap.dailyIntelligenceTitle}</h2>
        <p>{dictionary.recap.dailyIntelligenceSubtitle}</p>
        <p className="recap-today-story">
          {dictionary.recap.dailyStoryIntro(
            value(data.uniqueAircraft, dictionary),
            value(data.observedFlights, dictionary),
          )}
          {data.bestReception ? ` ${dictionary.recap.dailyStoryRecord(formatDistance(data.bestReception.distanceKm, dictionary))}` : ""}
          {topAirport ? ` ${dictionary.recap.dailyStoryAirport(topAirport.icao, formatNumber(topAirport.movements, 0, dictionary.locale))}` : ""}
          {intelligence.weatherHighlights.length
            ? ` ${dictionary.recap.dailyStoryWeather(formatNumber(intelligence.weatherHighlights.length, 0, dictionary.locale))}`
            : ""}
        </p>
      </div>
      <div className="recap-today-facts">
        <div>
          <span>{dictionary.recap.busiestHour}</span>
          <strong>{intelligence.busiestHour
            ? dictionary.recap.busiestHourValue(
              hourWindow(intelligence.busiestHour.hour),
              formatNumber(intelligence.busiestHour.flights, 0, dictionary.locale),
            )
            : dictionary.common.emptyValue}</strong>
        </div>
        <div>
          <span>{dictionary.recap.topAirline}</span>
          <strong>{topAirline ? topAirline.name : dictionary.common.emptyValue}</strong>
          {topAirline ? <small>{formatNumber(topAirline.count, 0, dictionary.locale)} ×</small> : null}
        </div>
        <div>
          <span>{dictionary.recap.busiestAirport}</span>
          <strong>{topAirport ? topAirport.icao : dictionary.common.emptyValue}</strong>
          {topAirport ? <small>{dictionary.recap.airportMovementValue(
            formatNumber(topAirport.movements, 0, dictionary.locale),
            formatNumber(topAirport.arrivals, 0, dictionary.locale),
            formatNumber(topAirport.departures, 0, dictionary.locale),
          )}</small> : null}
        </div>
        <div>
          <span>{dictionary.recap.operationalEvents}</span>
          <strong>{formatNumber(eventCount, 0, dictionary.locale)}</strong>
        </div>
        <div>
          <span>{dictionary.recap.weatherSignals}</span>
          <strong>{intelligence.weatherStatus === "unavailable"
            ? dictionary.common.emptyValue
            : formatNumber(intelligence.weatherHighlights.length, 0, dictionary.locale)}</strong>
        </div>
      </div>
      <div id="operational-events" className="recap-daily-event-strip" aria-label={dictionary.recap.operationalEvents}>
        <Metric label={dictionary.recap.goArounds} value={formatNumber(intelligence.eventCounts.goArounds, 0, dictionary.locale)} />
        <Metric label={dictionary.recap.holdings} value={formatNumber(intelligence.eventCounts.holdings, 0, dictionary.locale)} />
        <Metric label={dictionary.recap.diversions} value={formatNumber(intelligence.eventCounts.diversions, 0, dictionary.locale)} />
        <Metric label={dictionary.recap.emergencies} value={formatNumber(intelligence.eventCounts.emergencies, 0, dictionary.locale)} />
        <Metric label={dictionary.recap.unusualTurns} value={formatNumber(intelligence.eventCounts.unusualTurns, 0, dictionary.locale)} />
        <Metric label={dictionary.recap.orbits} value={formatNumber(intelligence.eventCounts.orbits, 0, dictionary.locale)} />
      </div>
    </section>
  </>;
}

function DailyTimeline({ data, dictionary }: { data: ReceiverRecapResponse; dictionary: Dictionary }) {
  const intelligence = data.dailyIntelligence;
  if (!intelligence) return null;
  return <section className="recap-card recap-daily-timeline" aria-labelledby="recap-daily-timeline-title" data-testid="daily-intelligence-timeline">
    <div className="recap-card-heading">
      <div>
        <h2 id="recap-daily-timeline-title">{dictionary.recap.dailyTimeline}</h2>
        <p>{dictionary.recap.dailyTimelineHint}</p>
      </div>
      <Link href="/intelligence">{dictionary.intelligence.title}</Link>
    </div>
    {intelligence.highlights.length ? <ol className="recap-timeline-list">
      {intelligence.highlights.map((item) => <li key={item.key}>
        <time dateTime={item.occurredAt}>{formatTime(item.occurredAt, dictionary)}</time>
        <span className={`recap-timeline-kind ${item.kind}`}>{highlightLabel(item, dictionary)}</span>
        <span className="recap-timeline-aircraft">
          <Link href={`/aircraft/${encodeURIComponent(item.icaoHex)}`}>{highlightIdentity(item)}</Link>
          <small>{highlightContext(item, dictionary)}</small>
        </span>
      </li>)}
    </ol> : <p>{dictionary.recap.noDailyTimeline}</p>}
    {!intelligence.complete ? <p className="recap-timeline-bounded">{dictionary.recap.dailyTimelinePartial}</p> : null}
  </section>;
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
      {range === "daily" ? <DailyIntelligence data={data} dictionary={dictionary} /> : null}
      <div className="recap-metrics"><Metric label={dictionary.recap.uniqueAircraft} value={value(data.uniqueAircraft, dictionary)} /><Metric label={dictionary.recap.observedFlights} value={value(data.observedFlights, dictionary)} /><Metric label={dictionary.recap.newAircraft} value={value(data.newAircraft, dictionary)} /><Metric label={dictionary.recap.rareReturning} value={value(data.rareOrReturning, dictionary)} /><Metric label={dictionary.recap.maxDistance} value={value(data.maxDistanceKm, dictionary, true)} /><Metric label={dictionary.recap.coverage} value={value(data.coverageKm, dictionary, true)} /><Metric label={dictionary.recap.alerts} value={value(data.alertCount, dictionary)} /></div>
      <div className="recap-grid">
        <section className="recap-card"><h2>{dictionary.recap.topTypes}</h2>{data.topAircraftTypes.length ? <ol>{data.topAircraftTypes.map((item) => <li key={item.name}><span>{item.name}</span><strong>{formatNumber(item.count, 0, dictionary.locale)}</strong></li>)}</ol> : <p>{dictionary.recap.noBreakdown}</p>}</section>
        <section className="recap-card"><h2>{dictionary.recap.topRoutes}</h2>{data.topRoutes.length ? <ol>{data.topRoutes.map((item) => <li key={`${item.origin}-${item.destination}`}><span>{item.origin} → {item.destination}</span><strong>{formatNumber(item.count, 0, dictionary.locale)}</strong></li>)}</ol> : <p>{dictionary.recap.noBreakdown}</p>}</section>
        {range === "daily" && data.dailyIntelligence ? <section className="recap-card" data-testid="daily-top-airports"><h2>{dictionary.recap.topAirports}</h2>{data.dailyIntelligence.topAirports.length ? <ol>{data.dailyIntelligence.topAirports.map((item) => <li key={item.icao}><span><Link href={`/airports/${encodeURIComponent(item.icao)}`}>{item.icao}</Link> · {dictionary.recap.airportFlowValue(
          formatNumber(item.arrivals, 0, dictionary.locale),
          formatNumber(item.departures, 0, dictionary.locale),
        )}</span><strong>{formatNumber(item.movements, 0, dictionary.locale)}</strong></li>)}</ol> : <p>{dictionary.recap.noAirportBreakdown}</p>}</section> : null}
        {range === "daily" && data.dailyIntelligence ? <section className="recap-card recap-weather-story" data-testid="daily-weather-highlights"><h2>{dictionary.recap.weatherHighlights}</h2><p>{dictionary.recap.weatherHighlightsHint}</p>{data.dailyIntelligence.weatherStatus === "unavailable" ? <p>{dictionary.recap.weatherUnavailable}</p> : data.dailyIntelligence.weatherHighlights.length ? <ul>{data.dailyIntelligence.weatherHighlights.map((item) => <li key={item.key}><span><Link href={`/aircraft/${encodeURIComponent(item.icaoHex)}`}>{item.callsign ?? item.icaoHex}</Link><small>{weatherHighlightLabel(item, dictionary)} · {weatherHighlightContext(item, dictionary)}</small></span><time dateTime={item.observedAt}>{formatTime(item.observedAt, dictionary)}</time></li>)}</ul> : <p>{dictionary.recap.noWeatherHighlights}</p>}{data.dailyIntelligence.weatherStatus === "truncated" ? <p className="recap-weather-note">{dictionary.recap.weatherPartial}</p> : null}<p className="recap-weather-disclaimer">{dictionary.recap.weatherDisclaimer}</p></section> : null}
        {range === "daily" && data.dailyIntelligence ? <section className="recap-card"><h2>{dictionary.recap.topAirlines}</h2>{data.dailyIntelligence.topAirlines.length ? <ol>{data.dailyIntelligence.topAirlines.map((item) => <li key={item.name}><span>{item.name}</span><strong>{formatNumber(item.count, 0, dictionary.locale)}</strong></li>)}</ol> : <p>{dictionary.recap.noBreakdown}</p>}</section> : null}
        <section id="interesting-aircraft" className="recap-card"><h2>{dictionary.recap.interesting}</h2>{data.interestingAircraft.length ? <ul>{data.interestingAircraft.map((item) => <li key={`${item.icaoHex}-${item.reason}`}><Link href={`/aircraft/${encodeURIComponent(item.icaoHex)}`}>{item.callsign ?? item.registration ?? item.icaoHex}</Link><span>{dictionary.recap.reasons[item.reason]}</span></li>)}</ul> : <p>{dictionary.recap.noInteresting}</p>}</section>
        <section className="recap-card"><h2>{dictionary.recap.bestReception}</h2>{data.bestReception ? <Link className="recap-record" href={`/aircraft/${encodeURIComponent(data.bestReception.icaoHex)}`}><strong>{formatDistance(data.bestReception.distanceKm, dictionary)}</strong><span>{data.bestReception.icaoHex} · {data.bestReception.registration ?? dictionary.common.emptyValue}</span><small>{formatDateTime(data.bestReception.recordedAt, dictionary)}</small></Link> : <p>{dictionary.recap.noReception}</p>}</section>
      </div>
      {range === "daily" ? <DailyTimeline data={data} dictionary={dictionary} /> : null}
      {range === "weekly" && data.comparison && <section className="recap-card recap-comparison"><h2>{dictionary.recap.comparison}</h2>{data.comparison.hasData ? <div className="recap-comparison-grid"><div><span>{dictionary.recap.uniqueAircraft}</span><strong>{value(data.comparison.uniqueAircraft, dictionary)}</strong></div><div><span>{dictionary.recap.observedFlights}</span><strong>{value(data.comparison.observedFlights, dictionary)}</strong></div><div><span>{dictionary.recap.maxDistance}</span><strong>{value(data.comparison.maxDistanceKm, dictionary, true)}</strong></div></div> : <p>{dictionary.recap.noComparison}</p>}</section>}
    </>}
  </main>;
}
