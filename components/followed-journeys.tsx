"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge, Button } from "@/components/ui-primitives";
import { TrustStamp } from "@/components/trust-stamp";
import { formatDateTime, formatNumber, t } from "@/lib/i18n";
import {
  FOLLOWED_JOURNEYS_STORAGE_KEY,
  parseFollowedJourneys,
  removeFollowedJourney,
  serializeFollowedJourneys,
  updateJourneyFromEvents,
  type FollowedJourneysState,
} from "@/lib/followed-journeys";
import styles from "./followed-journeys.module.css";

export function FollowedJourneys() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Sledované cesty",
    subtitle: "Konkrétní sledované lety oddělené od dlouhodobého watchlistu letadla.",
    active: "Aktivní",
    completed: "Dokončené",
    provisional: "PROVISIONAL",
    durable: "DURABLE",
    empty: "Zatím nesleduješ žádný konkrétní let.",
    emptyHint: "Na detailu živého letadla použij „Sledovat tento let“.",
    timeline: "Timeline",
    timelineHint: "Canonical Flight Intelligence události pro tuto cestu.",
    noEvents: "Pro tuto cestu zatím nejsou dostupné Flight Intelligence události.",
    unfollow: "Přestat sledovat",
    flightRecord: "Flight Story",
  } : {
    title: "Followed Journeys",
    subtitle: "Specific followed flights kept separate from the long-term aircraft watchlist.",
    active: "Active",
    completed: "Completed",
    provisional: "PROVISIONAL",
    durable: "DURABLE",
    empty: "You are not following a specific flight yet.",
    emptyHint: "Use “Follow this flight” on a live aircraft detail.",
    timeline: "Timeline",
    timelineHint: "Canonical Flight Intelligence events for this journey.",
    noEvents: "No Flight Intelligence events are available for this journey yet.",
    unfollow: "Unfollow",
    flightRecord: "Flight Story",
  };
  const [state, setState] = useState<FollowedJourneysState>({ version: 1, journeys: [] });
  const [eventsByKey, setEventsByKey] = useState<Record<string, Array<{ eventKey: string; flightId: number | null; lifecycleKey: string; type: string; occurredAt: string; airportIcao: string | null; runway: string | null }>>>({});

  useEffect(() => {
    const refresh = () => {
      try { setState(parseFollowedJourneys(window.localStorage.getItem(FOLLOWED_JOURNEYS_STORAGE_KEY))); }
      catch { setState({ version: 1, journeys: [] }); }
    };
    refresh();
    window.addEventListener("airradar:followed-journeys-changed", refresh);
    return () => window.removeEventListener("airradar:followed-journeys-changed", refresh);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void Promise.all(state.journeys.slice(0, 12).map(async (journey) => {
      try {
        const response = await fetch("/api/intelligence/events?aircraft=" + encodeURIComponent(journey.icaoHex) + "&limit=60", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return { key: journey.key, events: [] };
        const payload = await response.json() as { events?: Array<{ eventKey: string; flightId: number | null; lifecycleKey: string; type: string; occurredAt: string; airportIcao: string | null; runway: string | null }> };
        const events = (payload.events ?? []).filter((event) =>
          (journey.flightId !== null && event.flightId === journey.flightId)
          || (journey.lifecycleKey !== null && event.lifecycleKey === journey.lifecycleKey)
          || journey.identity === "PROVISIONAL"
        );
        return { key: journey.key, events };
      } catch {
        return { key: journey.key, events: [] };
      }
    })).then((results) => {
      if (!active) return;
      const nextEvents = Object.fromEntries(results.map((result) => [result.key, result.events]));
      setEventsByKey(nextEvents);
      let next = state;
      for (const journey of state.journeys) next = { ...next, journeys: next.journeys.map((item) => item.key === journey.key ? updateJourneyFromEvents(item, nextEvents[journey.key] ?? []) : item) };
      if (JSON.stringify(next) !== JSON.stringify(state)) {
        setState(next);
        try { window.localStorage.setItem(FOLLOWED_JOURNEYS_STORAGE_KEY, serializeFollowedJourneys(next)); } catch {}
      }
    });
    return () => { active = false; controller.abort(); };
  }, [state.journeys.length]);

  const activeCount = useMemo(() => state.journeys.filter((item) => item.status === "ACTIVE").length, [state.journeys]);
  const completedCount = state.journeys.length - activeCount;

  const remove = (key: string) => {
    const next = removeFollowedJourney(state, key);
    setState(next);
    try { window.localStorage.setItem(FOLLOWED_JOURNEYS_STORAGE_KEY, serializeFollowedJourneys(next)); } catch {}
  };

  return <main className={styles.page} data-testid="followed-journeys-v1">
    <PageHeader kicker="AIRRADAR / JOURNEYS" title={copy.title} description={copy.subtitle} />
    <MetricStrip>
      <MetricCard value={formatNumber(activeCount)} label={copy.active} />
      <MetricCard value={formatNumber(completedCount)} label={copy.completed} />
    </MetricStrip>
    {state.journeys.length ? <div className={styles.grid}>{state.journeys.map((journey) => {
      const events = eventsByKey[journey.key] ?? [];
      const identity = journey.callsign ?? journey.registration ?? journey.icaoHex;
      return <Panel key={journey.key}>
        <SectionHeader kicker={journey.identity === "DURABLE" ? copy.durable : copy.provisional}
          title={identity}
          description={[journey.origin, journey.destination].some(Boolean) ? (journey.origin ?? "—") + " → " + (journey.destination ?? "—") : journey.icaoHex}
          actions={<div className={styles.trustActions}><StatusBadge variant={journey.status === "COMPLETED" ? "success" : "live"}>{journey.status === "COMPLETED" ? copy.completed : copy.active}</StatusBadge><TrustStamp compact provenance={{ kind: "BROWSER", source: journey.identity === "DURABLE" ? "localStorage + Flight Intelligence" : "localStorage" }} /></div>} />
        <div className={styles.actions}>
          <Link href={("/aircraft/" + encodeURIComponent(journey.icaoHex)) as Route}>{identity}</Link>
          {journey.flightId ? <Link href={("/flights/" + journey.flightId) as Route}>{copy.flightRecord}</Link> : null}
          <Button size="compact" variant="ghost" onClick={() => remove(journey.key)}>{copy.unfollow}</Button>
        </div>
        <div className={styles.timeline}>
          <strong>{copy.timeline}</strong><small>{copy.timelineHint}</small>
          {events.length ? events.slice().sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt)).slice(-12).map((event) => <div key={event.eventKey}>
            <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
            <span>{event.type.replaceAll("_"," ")}</span>
            <small>{[event.airportIcao, event.runway ? "RWY "+event.runway : null].filter(Boolean).join(" · ")}</small>
          </div>) : <p>{copy.noEvents}</p>}
        </div>
      </Panel>;
    })}</div> : <EmptyState title={copy.empty} description={copy.emptyHint} />}
  </main>;
}
