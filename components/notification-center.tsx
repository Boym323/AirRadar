"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import { formatDateTime, t } from "@/lib/i18n";
import {
  NOTIFICATION_CENTER_PAGE_SIZE,
  NOTIFICATION_CENTER_STORAGE_KEY,
  dedupeNotificationEntries,
  notificationCategory,
  notificationCenterMetrics,
  parseNotificationCenterLocalState,
  serializeNotificationCenterLocalState,
} from "@/lib/notification-center";
import type { AlertHistoryEntry, AlertHistoryPage, AlertNotificationStatus } from "@/lib/server/alert-history";
import styles from "./notification-center.module.css";

function eventTitle(entry: AlertHistoryEntry, cs: boolean): string {
  if (entry.type === "aircraft_appeared") return cs ? "Sledované letadlo zachyceno" : "Watchlisted aircraft detected";
  if (entry.type === "entered_radius") return cs ? "Vstup do sledovaného dosahu" : "Entered watch radius";
  if (entry.type === "new_aircraft") return cs ? "Nové letadlo" : "New aircraft";
  if (entry.type === "reception_record") return cs ? "Reception record" : "Reception record";
  if (entry.type === "emergency" || entry.type.startsWith("emergency_")) return entry.squawk ? `Emergency · Squawk ${entry.squawk}` : "Emergency";
  if (entry.type.startsWith("intelligence_")) {
    const label = entry.intelligence?.eventType ?? entry.type.slice("intelligence_".length);
    return `Flight Intelligence · ${label.replaceAll("_", " ")}`;
  }
  if (entry.type === "predictive_eta") return cs ? "Watchlist · ETA limit" : "Watchlist · ETA threshold";
  if (entry.type === "predictive_runway_change") return cs ? "Watchlist · predikovaná změna RWY" : "Watchlist · predicted runway change";
  if (entry.type === "alert_v1") return entry.alertV1?.ruleName ?? (cs ? "Alert pravidlo" : "Alert rule");
  return cs ? "Watchlist událost" : "Watchlist event";
}

function statusVariant(status: AlertNotificationStatus): "success" | "danger" | "warning" | "neutral" {
  if (status === "delivered") return "success";
  if (status === "failed") return "danger";
  if (status === "attempted" || status === "pending") return "warning";
  return "neutral";
}

function statusLabel(status: AlertNotificationStatus, cs: boolean): string {
  if (status === "delivered") return cs ? "DORUČENO" : "DELIVERED";
  if (status === "failed") return cs ? "SELHALO" : "FAILED";
  if (status === "attempted") return cs ? "ODESÍLÁ SE" : "ATTEMPTED";
  if (status === "pending") return cs ? "ČEKÁ" : "PENDING";
  return cs ? "VYPNUTO" : "DISABLED";
}

export function NotificationCenter() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Centrum oznámení",
    subtitle: "Read-only přehled posledních canonical alert a intelligence událostí bez nového alert enginu.",
    recent: "Poslední události",
    delivered: "Doručeno",
    failed: "Selhalo",
    unread: "Nepřečteno",
    feed: "Události",
    feedDescription: `Nejvýše ${NOTIFICATION_CENTER_PAGE_SIZE} posledních záznamů z existující historie alertů.`,
    unavailable: "Historie oznámení je dočasně nedostupná.",
    empty: "Zatím nejsou k dispozici žádné události.",
    open: "Detail letadla",
    detected: "Detekováno",
    localUnread: "Unread stav je pouze v tomto prohlížeči.",
    bounded: "BOUNDED · READ ONLY",
  } : {
    title: "Notification Center",
    subtitle: "Read-only view of recent canonical alert and intelligence events without a new alert engine.",
    recent: "Recent events",
    delivered: "Delivered",
    failed: "Failed",
    unread: "Unread",
    feed: "Events",
    feedDescription: `At most ${NOTIFICATION_CENTER_PAGE_SIZE} recent entries from the existing alert history.`,
    unavailable: "Notification history is temporarily unavailable.",
    empty: "There are no notification events yet.",
    open: "Aircraft detail",
    detected: "Detected",
    localUnread: "Unread state is local to this browser only.",
    bounded: "BOUNDED · READ ONLY",
  };

  const [data, setData] = useState<AlertHistoryPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  useEffect(() => {
    const openedAt = new Date().toISOString();
    try {
      const local = parseNotificationCenterLocalState(window.localStorage.getItem(NOTIFICATION_CENTER_STORAGE_KEY));
      setLastSeen(local?.lastSeen ?? null);
      window.localStorage.setItem(NOTIFICATION_CENTER_STORAGE_KEY, serializeNotificationCenterLocalState(openedAt));
    } catch {
      setLastSeen(null);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/alerts?page=0&pageSize=${NOTIFICATION_CENTER_PAGE_SIZE}&filter=all`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("notification history unavailable");
        return await response.json() as AlertHistoryPage;
      })
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
        setFailed(false);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const entries = useMemo(() => dedupeNotificationEntries(data?.items ?? []), [data?.items]);
  const metrics = useMemo(() => notificationCenterMetrics(entries, lastSeen), [entries, lastSeen]);

  return <main className={styles.page} data-testid="notification-center-v1">
    <PageHeader
      kicker="AIRRADAR / NOTIFICATIONS"
      title={copy.title}
      description={copy.subtitle}
      actions={<StatusBadge variant={failed ? "warning" : data ? "success" : "neutral"}>{failed ? copy.unavailable : copy.bounded}</StatusBadge>}
    />

    <MetricStrip className={styles.metrics}>
      <MetricCard value={data ? metrics.recent : "—"} label={copy.recent} />
      <MetricCard value={data ? metrics.delivered : "—"} label={copy.delivered} />
      <MetricCard value={data ? metrics.failed : "—"} label={copy.failed} />
      <MetricCard value={data ? metrics.unread : "—"} label={copy.unread} detail={copy.localUnread} />
    </MetricStrip>

    <Panel>
      <SectionHeader kicker="FEED" title={copy.feed} description={copy.feedDescription} />
      {failed && !data ? <EmptyState title={copy.unavailable} />
        : !data ? <p className={styles.loading}>{t.common.loading}</p>
        : entries.length ? <ol className={styles.feed}>
          {entries.map((entry) => {
            const name = entry.aircraft.callsign ?? entry.aircraft.registration ?? entry.aircraft.icaoHex;
            const category = notificationCategory(entry);
            return <li key={entry.id} className={styles.item}>
              <div className={styles.itemMain}>
                <div className={styles.itemHeading}>
                  <span className={styles.category}>{category}</span>
                  <strong>{eventTitle(entry, cs)}</strong>
                </div>
                <div className={styles.identity}>
                  <Link href={`/aircraft/${encodeURIComponent(entry.aircraft.icaoHex)}` as Route}>{name}</Link>
                  <span>{entry.aircraft.registration ?? entry.aircraft.icaoHex}</span>
                  {entry.aircraft.aircraftType ? <span>{entry.aircraft.aircraftType}</span> : null}
                  {entry.intelligence?.airportIcao ? <span>{entry.intelligence.airportIcao}</span> : null}
                  {entry.intelligence?.sectorId ? <span>{entry.intelligence.sectorId}</span> : null}
                </div>
                {entry.ruleNames.length ? <small>{entry.ruleNames.join(", ")}</small> : null}
                <Link className={styles.openLink} href={`/aircraft/${encodeURIComponent(entry.aircraft.icaoHex)}` as Route}>{copy.open} →</Link>
              </div>
              <div className={styles.itemSide}>
                <span>{copy.detected}</span>
                <time dateTime={entry.detectedAt}>{formatDateTime(entry.detectedAt, t)}</time>
                <StatusBadge variant={statusVariant(entry.notificationStatus)}>{statusLabel(entry.notificationStatus, cs)}</StatusBadge>
              </div>
            </li>;
          })}
        </ol> : <EmptyState title={copy.empty} />}
    </Panel>
  </main>;
}
