"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AlertHistoryEntry, AlertHistoryFilter, AlertHistoryPage, AlertNotificationStatus } from "@/lib/server/alert-history";
import { formatDateTime, formatDistance, formatTrack, getTranslations, type LocaleKey } from "@/lib/i18n";

function isEmergencyEntry(entry: AlertHistoryEntry): boolean {
  return entry.type === "emergency" || entry.type === "emergency_7500" || entry.type === "emergency_7600" || entry.type === "emergency_7700";
}

function isRecordEntry(entry: AlertHistoryEntry): boolean {
  return entry.type === "new_aircraft" || entry.type === "reception_record";
}

function eventClass(entry: AlertHistoryEntry): string {
  if (isEmergencyEntry(entry)) return "emergency";
  if (isRecordEntry(entry)) return entry.type;
  return "watchlist";
}

function eventLabel(entry: AlertHistoryEntry, dictionary: ReturnType<typeof getTranslations>): string {
  const cs = dictionary.locale.startsWith("cs");
  if (entry.type === "aircraft_appeared") return cs ? "Zachyceno" : "Appeared";
  if (entry.type === "entered_radius") return cs ? "Vstup do dosahu" : "Entered radius";
  if (entry.type === "emergency_7500") return "Squawk 7500";
  if (entry.type === "emergency_7600") return "Squawk 7600";
  if (entry.type === "emergency_7700") return "Squawk 7700";
  if (entry.type === "new_aircraft") return dictionary.alerts.types.newAircraft;
  if (entry.type === "reception_record") return entry.record?.scope === "lifetime" ? dictionary.alerts.types.lifetimeRecord : dictionary.alerts.types.dailyRecord;
  if (entry.type === "emergency") return dictionary.alerts.types.emergency;
  return dictionary.alerts.types.watchlist;
}

function reasonLabel(entry: AlertHistoryEntry, dictionary: ReturnType<typeof getTranslations>): string {
  const cs = dictionary.locale.startsWith("cs");
  if (entry.reason === "appeared") return cs ? "Sledované letadlo bylo nově zachyceno přijímačem." : "A watchlisted aircraft was newly detected by the receiver.";
  if (entry.reason === "entered_radius") {
    const radius = entry.radiusKm === null ? "" : ` ${Math.round(entry.radiusKm)} km`;
    return cs ? `Sledované letadlo vstoupilo do nastaveného okruhu${radius}.` : `A watchlisted aircraft entered the configured${radius} radius.`;
  }
  if (entry.reason === "squawk_7500") return cs ? "Byl zaznamenán přechod na squawk 7500." : "A transition to squawk 7500 was detected.";
  if (entry.reason === "squawk_7600") return cs ? "Byl zaznamenán přechod na squawk 7600." : "A transition to squawk 7600 was detected.";
  if (entry.reason === "squawk_7700") return cs ? "Byl zaznamenán přechod na squawk 7700." : "A transition to squawk 7700 was detected.";
  if (entry.type === "new_aircraft") return dictionary.alerts.reasons.newAircraft;
  if (entry.type === "reception_record") return dictionary.alerts.reasons.record;
  if (entry.type === "emergency") return dictionary.alerts.reasons.emergency;
  return dictionary.alerts.reasons.watchlist;
}

function filterLabel(filter: AlertHistoryFilter, locale: LocaleKey): string {
  const cs = locale === "cs";
  if (filter === "watchlist") return cs ? "Sledované" : "Watchlist";
  if (filter === "emergency") return cs ? "Nouzové" : "Emergency";
  if (filter === "records") return cs ? "Rekordy" : "Records";
  return cs ? "Vše" : "All";
}

function statusLabel(status: AlertNotificationStatus, dictionary: ReturnType<typeof getTranslations>): string {
  return dictionary.alerts.notificationStatuses[status];
}

function AlertRow({ entry, dictionary }: { entry: AlertHistoryEntry; dictionary: ReturnType<typeof getTranslations> }) {
  const name = entry.aircraft.callsign ?? entry.aircraft.registration ?? entry.aircraft.icaoHex;
  return <li className="alert-history-row">
    <div className="alert-history-row-main">
      <div className="alert-history-row-heading"><Link href={`/aircraft/${encodeURIComponent(entry.aircraft.icaoHex)}`}>{name}</Link><span className={`alert-history-type ${eventClass(entry)}`}>{eventLabel(entry, dictionary)}</span></div>
      <div className="alert-history-row-meta"><span>{entry.aircraft.icaoHex}</span><span>{entry.aircraft.registration ?? dictionary.common.emptyValue}</span><span>{entry.aircraft.aircraftType ?? dictionary.common.emptyValue}</span>{entry.squawk && <span>Squawk {entry.squawk}</span>}</div>
      <p>{reasonLabel(entry, dictionary)}</p>
      {entry.ruleNames.length > 0 && <p className="alert-history-rule">{dictionary.locale.startsWith("cs") ? "Pravidlo" : "Rule"}: {entry.ruleNames.join(", ")}</p>}
      {entry.record && <div className="alert-history-record"><strong>{formatDistance(entry.record.distanceKm)}</strong><span>{formatTrack(entry.record.bearing)} · {formatDateTime(entry.record.recordedAt, dictionary)}</span>{entry.record.previousDistanceKm !== null && <span>{dictionary.alerts.previousRecord}: {formatDistance(entry.record.previousDistanceKm)}</span>}</div>}
    </div>
    <div className="alert-history-row-side"><time dateTime={entry.detectedAt}>{formatDateTime(entry.detectedAt, dictionary)}</time><span className={`alert-history-notification ${entry.notificationStatus}`}>{statusLabel(entry.notificationStatus, dictionary)}</span></div>
  </li>;
}

export function AlertHistoryPage() {
  const [locale, setLocale] = useState<LocaleKey>("cs");
  const dictionary = getTranslations(locale);
  const [data, setData] = useState<AlertHistoryPage | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<AlertHistoryFilter>("all");

  useEffect(() => {
    let active = true;
    setData(null);
    void fetch(`/api/alerts?pageSize=50&filter=${encodeURIComponent(filter)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("alert history request failed");
        return await response.json() as AlertHistoryPage;
      })
      .then((next) => { if (active) { setData(next); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [filter]);

  return <main className="history-page alert-history-page">
    <header className="history-page-header">
      <div><Link className="back-link" href="/">{dictionary.alerts.backToRadar}</Link><h1>{dictionary.alerts.title}</h1><p className="statistics-subtitle">{dictionary.alerts.subtitle}</p></div>
      <nav className="system-nav" aria-label={dictionary.alerts.navigation}><Link href="/watchlist">{dictionary.watchlist.title}</Link><Link href="/statistics">{dictionary.statistics.title}</Link><button type="button" className="language-button" onClick={() => setLocale((current) => current === "cs" ? "en" : "cs")} aria-label={locale === "cs" ? "English" : "Čeština"}>{locale === "cs" ? "EN" : "CZ"}</button></nav>
    </header>
    <p className="alert-history-intro">{dictionary.alerts.description}</p>
    <div className="watchlist-editor-actions" role="group" aria-label={locale === "cs" ? "Filtr upozornění" : "Alert filter"}>
      {(["all", "watchlist", "emergency", "records"] as const).map((value) => <button key={value} type="button" className="secondary-button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{filterLabel(value, locale)}</button>)}
    </div>
    {error && <p className="statistics-error" role="alert">{dictionary.alerts.loadFailed}</p>}
    {!data && !error && <p className="statistics-empty">{dictionary.common.loading}</p>}
    {data && <>{data.items.length ? <ol className="alert-history-list">{data.items.map((entry) => <AlertRow key={entry.id} entry={entry} dictionary={dictionary} />)}</ol> : <p className="statistics-empty">{dictionary.alerts.empty}</p>}{data.nextPage !== null && <p className="alert-history-bounded">{dictionary.alerts.bounded}</p>}</>}
  </main>;
}
