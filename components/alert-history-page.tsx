"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AlertHistoryEntry, AlertHistoryPage, AlertNotificationStatus } from "@/lib/server/alert-history";
import { formatDateTime, formatDistance, formatTrack, getTranslations, type LocaleKey } from "@/lib/i18n";

function eventLabel(entry: AlertHistoryEntry, dictionary: ReturnType<typeof getTranslations>): string {
  if (entry.type === "new_aircraft") return dictionary.alerts.types.newAircraft;
  if (entry.type === "reception_record") return entry.record?.scope === "lifetime" ? dictionary.alerts.types.lifetimeRecord : dictionary.alerts.types.dailyRecord;
  if (entry.type === "emergency") return dictionary.alerts.types.emergency;
  return dictionary.alerts.types.watchlist;
}

function statusLabel(status: AlertNotificationStatus, dictionary: ReturnType<typeof getTranslations>): string {
  return dictionary.alerts.notificationStatuses[status];
}

function AlertRow({ entry, dictionary }: { entry: AlertHistoryEntry; dictionary: ReturnType<typeof getTranslations> }) {
  const name = entry.aircraft.callsign ?? entry.aircraft.registration ?? entry.aircraft.icaoHex;
  return <li className="alert-history-row">
    <div className="alert-history-row-main">
      <div className="alert-history-row-heading"><Link href={`/aircraft/${encodeURIComponent(entry.aircraft.icaoHex)}`}>{name}</Link><span className={`alert-history-type ${entry.type}`}>{eventLabel(entry, dictionary)}</span></div>
      <div className="alert-history-row-meta"><span>{entry.aircraft.icaoHex}</span><span>{entry.aircraft.registration ?? dictionary.common.emptyValue}</span><span>{entry.aircraft.aircraftType ?? dictionary.common.emptyValue}</span></div>
      <p>{entry.type === "new_aircraft" ? dictionary.alerts.reasons.newAircraft : entry.type === "reception_record" ? dictionary.alerts.reasons.record : entry.type === "emergency" ? dictionary.alerts.reasons.emergency : dictionary.alerts.reasons.watchlist}</p>
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

  useEffect(() => {
    let active = true;
    void fetch("/api/alerts?pageSize=50", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("alert history request failed");
        return await response.json() as AlertHistoryPage;
      })
      .then((next) => { if (active) { setData(next); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  return <main className="history-page alert-history-page">
    <header className="history-page-header">
      <div><Link className="back-link" href="/">{dictionary.alerts.backToRadar}</Link><h1>{dictionary.alerts.title}</h1><p className="statistics-subtitle">{dictionary.alerts.subtitle}</p></div>
      <nav className="system-nav" aria-label={dictionary.alerts.navigation}><Link href="/watchlist">{dictionary.watchlist.title}</Link><Link href="/statistics">{dictionary.statistics.title}</Link><button type="button" className="language-button" onClick={() => setLocale((current) => current === "cs" ? "en" : "cs")} aria-label={locale === "cs" ? "English" : "Čeština"}>{locale === "cs" ? "EN" : "CZ"}</button></nav>
    </header>
    <p className="alert-history-intro">{dictionary.alerts.description}</p>
    {error && <p className="statistics-error" role="alert">{dictionary.alerts.loadFailed}</p>}
    {!data && !error && <p className="statistics-empty">{dictionary.common.loading}</p>}
    {data && <>{data.items.length ? <ol className="alert-history-list">{data.items.map((entry) => <AlertRow key={entry.id} entry={entry} dictionary={dictionary} />)}</ol> : <p className="statistics-empty">{dictionary.alerts.empty}</p>}{data.nextPage !== null && <p className="alert-history-bounded">{dictionary.alerts.bounded}</p>}</>}
  </main>;
}
