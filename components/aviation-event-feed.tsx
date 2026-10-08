"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { useFavoriteAirports } from "@/components/pwa-register";
import { EmptyState, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import { TrustStamp } from "@/components/trust-stamp";
import { formatDateTime, t } from "@/lib/i18n";
import {
  alertFeedItems,
  airportMovementFeedItems,
  flightIntelligenceFeedItems,
  mergeAviationEventFeed,
  navigationIntegrityFeedItems,
  type AviationEventFeedItem,
  type AviationEventFeedSource,
} from "@/lib/aviation-event-feed";
import styles from "./aviation-event-feed.module.css";

const REFRESH_MS = 30_000;

function sourceLabel(source: AviationEventFeedSource): string {
  if (source === "FLIGHT_INTELLIGENCE") return "FLIGHT INTELLIGENCE";
  if (source === "NAVIGATION_INTEGRITY") return "NAV INTEGRITY";
  if (source === "AIRPORT_OPERATIONS") return "AIRPORT OPS";
  return "ALERT";
}

export function AviationEventFeed() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Přehled leteckých událostí",
    subtitle: "Chronologický přehled již dostupných událostí AirRadaru. Bez dalšího detektoru či samostatného systému analýzy letů.",
    feed: "Události",
    feedDescription: "Analýza letů, upozornění, integrita navigačních dat a významné pohyby na prvním oblíbeném letišti.",
    loading: "Načítám zdroje událostí…",
    empty: "V aktuálním časovém období nejsou žádné události.",
    degraded: "Část zdrojů událostí je nedostupná.",
    live: "AKTUÁLNÍ",
    open: "Otevřít",
    favoriteHint: "Provozní události letiště se přidají po výběru oblíbeného letiště.",
  } : {
    title: "Aviation Event Feed",
    subtitle: "One chronological timeline over existing AirRadar events. No new detector or parallel intelligence engine.",
    feed: "Events",
    feedDescription: "Flight Intelligence, alerts, Navigation Integrity and notable movements at your first favorite airport.",
    loading: "Loading event sources…",
    empty: "There are no events in the current bounded window.",
    degraded: "Some event sources are unavailable.",
    live: "CURRENT",
    open: "Open",
    favoriteHint: "Airport Operations is included when you have a favorite airport.",
  };
  const [favorites] = useFavoriteAirports();
  const favorite = favorites[0] ?? null;
  const [items, setItems] = useState<AviationEventFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    let active = true;
    let controller = new AbortController();

    const load = async () => {
      controller.abort();
      controller = new AbortController();
      const requests: Array<Promise<unknown>> = [
        fetch("/api/intelligence/events?limit=60", { cache: "no-store", signal: controller.signal }).then(async (r) => {
          if (!r.ok) throw new Error("intelligence");
          return { kind: "intelligence", value: await r.json() as { events?: Parameters<typeof flightIntelligenceFeedItems>[0] } };
        }),
        fetch("/api/alerts?page=0&pageSize=40", { cache: "no-store", signal: controller.signal }).then(async (r) => {
          if (!r.ok) throw new Error("alerts");
          return { kind: "alerts", value: await r.json() as { items?: Parameters<typeof alertFeedItems>[0] } };
        }),
        fetch("/api/navigation-integrity/current?window=15m", { cache: "no-store", signal: controller.signal }).then(async (r) => {
          if (!r.ok) throw new Error("navigation");
          return { kind: "navigation", value: await r.json() as { activeAnomalies?: Parameters<typeof navigationIntegrityFeedItems>[0] } };
        }),
      ];
      if (favorite) {
        requests.push(fetch("/api/airports/" + encodeURIComponent(favorite) + "/operations?period=24h", { cache: "no-store", signal: controller.signal }).then(async (r) => {
          if (!r.ok) throw new Error("airport");
          return { kind: "airport", value: await r.json() as { goArounds?: Parameters<typeof airportMovementFeedItems>[0]; holding?: Parameters<typeof airportMovementFeedItems>[0] } };
        }));
      }

      const results = await Promise.allSettled(requests);
      if (!active || controller.signal.aborted) return;
      const groups: AviationEventFeedItem[][] = [];
      let failed = 0;
      for (const result of results) {
        if (result.status === "rejected") { failed += 1; continue; }
        const payload = result.value as { kind: string; value: Record<string, unknown> };
        if (payload.kind === "intelligence") groups.push(flightIntelligenceFeedItems((payload.value.events ?? []) as Parameters<typeof flightIntelligenceFeedItems>[0]));
        if (payload.kind === "alerts") groups.push(alertFeedItems((payload.value.items ?? []) as Parameters<typeof alertFeedItems>[0]));
        if (payload.kind === "navigation") groups.push(navigationIntegrityFeedItems((payload.value.activeAnomalies ?? []) as Parameters<typeof navigationIntegrityFeedItems>[0]));
        if (payload.kind === "airport") groups.push(airportMovementFeedItems([
          ...((payload.value.goArounds ?? []) as Parameters<typeof airportMovementFeedItems>[0]),
          ...((payload.value.holding ?? []) as Parameters<typeof airportMovementFeedItems>[0]),
        ]));
      }
      setItems(mergeAviationEventFeed(groups, 60));
      setFailures(failed);
      setLoading(false);
    };

    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => { active = false; window.clearInterval(timer); controller.abort(); };
  }, [favorite]);

  const counts = useMemo(() => new Map([...new Set(items.map((item) => item.source))].map((source) => [source, items.filter((item) => item.source === source).length])), [items]);

  return <main className={styles.page} data-testid="aviation-event-feed-v1">
    <PageHeader kicker="AIRRADAR / EVENTS" title={copy.title} description={copy.subtitle}
      actions={<StatusBadge variant={failures ? "warning" : items.length ? "success" : "neutral"}>{failures ? copy.degraded : copy.live}</StatusBadge>} />
    <Panel>
      <SectionHeader kicker="TIMELINE" title={copy.feed} description={copy.feedDescription}
        actions={<div className={styles.sources}>{[...counts].map(([source, count]) => <span key={source}>{sourceLabel(source)} · {count}</span>)}</div>} />
      {!favorite ? <p className={styles.hint}>{copy.favoriteHint}</p> : null}
      {loading ? <p className={styles.hint}>{copy.loading}</p> : items.length ? <ol className={styles.feed}>
        {items.map((item) => <li key={item.id} className={styles[item.severity]}>
          <time dateTime={item.occurredAt}>{formatDateTime(item.occurredAt)}</time>
          <div>
            <span className={styles.meta}><TrustStamp compact provenance={{ kind: item.provenance, source: sourceLabel(item.source), observedAt: item.occurredAt, staleAfterMs: 60 * 60_000 }} /></span>
            <strong>{item.title}</strong>
            {item.subject ? <span>{item.subject}</span> : null}
            {item.context ? <small>{item.context}</small> : null}
          </div>
          {item.href ? <Link href={item.href as Route}>{copy.open} →</Link> : null}
        </li>)}
      </ol> : <EmptyState title={copy.empty} />}
    </Panel>
  </main>;
}
