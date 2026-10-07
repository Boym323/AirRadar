"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import { formatDateTime, t } from "@/lib/i18n";
import {
  NOTIFICATION_PREFERENCE_KEYS,
  parseNotificationPreferenceValues,
  type NotificationPreferenceKey,
  type NotificationPreferenceMode,
  type NotificationPreferenceValues,
} from "@/lib/notification-preferences";
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
  if (entry.type === "reception_record") return "Reception record";
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
  return cs ? "BEZ PUSH" : "NO PUSH";
}

type PreferenceAccess = "loading" | "ready" | "locked" | "error";

function preferenceLabel(key: NotificationPreferenceKey) {
  return t.notificationCenter.categories[key];
}

export function NotificationCenter() {
  const cs = t.locale.startsWith("cs");
  const copy = t.notificationCenter;
  const [data, setData] = useState<AlertHistoryPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [preferenceAccess, setPreferenceAccess] = useState<PreferenceAccess>("loading");
  const [preferenceDraft, setPreferenceDraft] = useState<NotificationPreferenceValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [preferenceMessage, setPreferenceMessage] = useState<string | null>(null);

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

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/alerts/delivery?view=preferences", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403 || response.status === 503) {
          if (!controller.signal.aborted) setPreferenceAccess("locked");
          return null;
        }
        if (!response.ok) throw new Error("notification preferences unavailable");
        return await response.json() as { preferences?: { values?: unknown } };
      })
      .then((payload) => {
        if (!payload || controller.signal.aborted) return;
        const values = parseNotificationPreferenceValues(payload.preferences?.values);
        if (!values) throw new Error("invalid notification preferences");
        setPreferenceDraft(values);
        setPreferenceAccess("ready");
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setPreferenceAccess("error");
      });
    return () => controller.abort();
  }, []);

  const entries = useMemo(() => dedupeNotificationEntries(data?.items ?? []), [data?.items]);
  const metrics = useMemo(() => notificationCenterMetrics(entries, lastSeen), [entries, lastSeen]);

  function updatePreference(key: NotificationPreferenceKey, mode: NotificationPreferenceMode) {
    setPreferenceDraft((current) => current ? { ...current, [key]: mode } : current);
    setPreferenceMessage(null);
  }

  async function savePreferences(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preferenceDraft || saving) return;
    setSaving(true);
    setPreferenceMessage(null);
    try {
      const response = await fetch("/api/admin/alerts/delivery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferenceDraft),
      });
      if (!response.ok) throw new Error("notification preferences could not be saved");
      const payload = await response.json() as { preferences?: { values?: unknown } };
      const values = parseNotificationPreferenceValues(payload.preferences?.values);
      if (!values) throw new Error("invalid notification preferences");
      setPreferenceDraft(values);
      setPreferenceAccess("ready");
      setPreferenceMessage(copy.saved);
    } catch {
      setPreferenceMessage(copy.saveFailed);
    } finally {
      setSaving(false);
    }
  }

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
      <SectionHeader kicker="DELIVERY POLICY" title={copy.preferences} description={copy.preferencesDescription} />
      {preferenceAccess === "loading" ? <p className={styles.loading}>{t.common.loading}</p> : null}
      {preferenceAccess === "locked" ? <div className={styles.preferenceLocked}>
        <p>{copy.locked}</p>
        <Link className={styles.openLink} href={"/watchlist" as Route}>{copy.signIn} →</Link>
      </div> : null}
      {preferenceAccess === "error" ? <EmptyState title={copy.saveFailed} /> : null}
      {preferenceAccess === "ready" && preferenceDraft ? <form className={styles.preferenceForm} onSubmit={savePreferences}>
        <div className={styles.preferenceGrid}>
          {NOTIFICATION_PREFERENCE_KEYS.map((key) => {
            const category = preferenceLabel(key);
            return <label key={key} className={styles.preferenceRow}>
              <span className={styles.preferenceCopy}>
                <strong>{category.label}</strong>
                <small>{category.description}</small>
              </span>
              <select
                value={preferenceDraft[key]}
                onChange={(event) => updatePreference(key, event.target.value as NotificationPreferenceMode)}
                aria-label={category.label}
              >
                <option value="OFF">{copy.modes.OFF}</option>
                <option value="CENTER_ONLY">{copy.modes.CENTER_ONLY}</option>
                <option value="PUSH">{copy.modes.PUSH}</option>
              </select>
            </label>;
          })}
        </div>
        <div className={styles.preferenceActions}>
          <button className={styles.saveButton} type="submit" disabled={saving}>{saving ? copy.saving : copy.save}</button>
          {preferenceMessage ? <span role="status">{preferenceMessage}</span> : null}
        </div>
      </form> : null}
    </Panel>

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
