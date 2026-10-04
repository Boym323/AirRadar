"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTranslations, type LocaleKey } from "@/lib/i18n";
import type { AlertHistoryEntry, AlertHistoryPage } from "@/lib/server/alert-history";

function eventLabel(entry: AlertHistoryEntry, locale: LocaleKey): string {
  const cs = locale === "cs";
  if (entry.type === "aircraft_appeared") return cs ? "Zachyceno" : "Detected";
  if (entry.type === "entered_radius") return cs ? "Vstup do dosahu" : "Entered range";
  if (entry.type === "intelligence_takeoff") return cs ? "Vzlet" : "Takeoff";
  if (entry.type === "intelligence_landing") return cs ? "Přistání" : "Landing";
  if (entry.type === "intelligence_approach") return cs ? "Přiblížení" : "Approach";
  if (entry.type === "intelligence_go_around") return "Go-around";
  if (entry.type === "intelligence_holding") return "Holding";
  if (entry.type === "intelligence_diversion") return cs ? "Odklon" : "Diversion";
  if (entry.type === "intelligence_top_of_descent") return "Top of descent";
  if (entry.type === "predictive_eta") return locale === "cs" ? "ETA limit" : "ETA threshold";
  if (entry.type === "predictive_runway_change") return locale === "cs" ? "Predikovaná změna RWY" : "Predicted runway change";
  if (entry.type === "emergency_7500") return "Squawk 7500";
  if (entry.type === "emergency_7600") return "Squawk 7600";
  if (entry.type === "emergency_7700") return "Squawk 7700";
  return cs ? "Událost sledování" : "Watchlist event";
}

function contextLabel(entry: AlertHistoryEntry, locale: LocaleKey): string | null {
  if (entry.type === "entered_radius" && entry.radiusKm !== null) {
    return locale === "cs" ? `Okruh ${Math.round(entry.radiusKm)} km` : `${Math.round(entry.radiusKm)} km radius`;
  }
  if (entry.squawk) return `Squawk ${entry.squawk}`;
  if (entry.type === "predictive_eta") {
    const destination = typeof entry.metadata?.destinationIcao === "string" ? entry.metadata.destinationIcao : null;
    const horizon = typeof entry.metadata?.horizonMinutes === "number" ? Math.round(entry.metadata.horizonMinutes) : null;
    if (destination && horizon !== null) return `${destination} · ${horizon} min`;
    if (horizon !== null) return `${horizon} min`;
    return destination;
  }
  if (entry.type === "predictive_runway_change") {
    const from = typeof entry.metadata?.changedFrom === "string" ? entry.metadata.changedFrom : null;
    const runway = typeof entry.metadata?.runway === "string" ? entry.metadata.runway : null;
    const destination = typeof entry.metadata?.destinationIcao === "string" ? entry.metadata.destinationIcao : null;
    const transition = from && runway ? `RWY ${from} → ${runway}` : null;
    return [destination, transition].filter(Boolean).join(" · ") || null;
  }
  const intelligence = entry.intelligence;
  if (intelligence?.airportIcao) return intelligence.airportIcao;
  return null;
}

function timeLabel(value: string, locale: LocaleKey): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" }).format(parsed);
}

export function WatchlistActivity({ locale }: { locale: LocaleKey }) {
  const dictionary = getTranslations(locale);
  const [data, setData] = useState<AlertHistoryPage | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/watchlist/activity?page=0&pageSize=20", { cache: "no-store" });
        if (!response.ok) throw new Error("watchlist activity request failed");
        const next = await response.json() as AlertHistoryPage;
        if (active) {
          setData(next);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const copy = dictionary.watchlist.activity;

  return (
    <section className="statistics-card watchlist-activity-card" aria-labelledby="watchlist-activity-title" data-testid="watchlist-activity">
      <div className="statistics-card-header">
        <div>
          <h2 id="watchlist-activity-title">{copy.title}</h2>
          <p className="statistics-subtitle">{copy.subtitle}</p>
        </div>
        <Link className="secondary-button" href="/alerts">{copy.openHistory}</Link>
      </div>

      <div className="watchlist-editor-actions" aria-label={copy.coverage}>
        <span className="watchlist-status enabled">{copy.appeared}</span>
        <span className="watchlist-status enabled">{copy.range}</span>
        <span className="watchlist-status enabled">{copy.takeoff}</span>
        <span className="watchlist-status enabled">{copy.landing}</span>
        <span className="watchlist-status enabled">{copy.prediction}</span>
        <span className="watchlist-status enabled">7500 / 7600 / 7700</span>
      </div>

      {error && <p className="statistics-error" role="alert">{copy.loadFailed}</p>}
      {!data && !error && <p className="statistics-empty">{dictionary.common.loading}</p>}
      {data && data.items.length === 0 && <p className="statistics-empty">{copy.empty}</p>}

      {data && data.items.length > 0 && (
        <ol className="alert-history-list watchlist-activity-list">
          {data.items.map((entry) => {
            const name = entry.aircraft.callsign ?? entry.aircraft.registration ?? entry.aircraft.icaoHex;
            const context = contextLabel(entry, locale);
            return (
              <li className="alert-history-row" key={entry.id}>
                <div className="alert-history-row-main">
                  <div className="alert-history-row-heading">
                    <Link href={`/aircraft/${encodeURIComponent(entry.aircraft.icaoHex)}`}>{name}</Link>
                    <span className={`alert-history-type ${entry.type.startsWith("emergency_") ? "emergency" : "watchlist"}`}>{eventLabel(entry, locale)}</span>
                  </div>
                  <div className="alert-history-row-meta">
                    <span>{entry.aircraft.icaoHex}</span>
                    {entry.aircraft.registration && <span>{entry.aircraft.registration}</span>}
                    {context && <span>{context}</span>}
                  </div>
                  {entry.ruleNames.length > 0 && <p className="alert-history-rule">{copy.rule}: {entry.ruleNames.join(", ")}</p>}
                </div>
                <div className="alert-history-row-side">
                  <time dateTime={entry.detectedAt}>{timeLabel(entry.detectedAt, locale)}</time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
