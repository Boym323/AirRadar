"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import { formatDateTime, t } from "@/lib/i18n";
import {
  filterNotificationGroups,
  groupNotificationEntries,
  NOTIFICATION_CENTER_PAGE_SIZE,
  NOTIFICATION_CENTER_STORAGE_KEY,
  notificationCategory,
  notificationCenterMetrics,
  notificationRuleReferences,
  notificationWhyCode,
  parseNotificationCenterLocalState,
  serializeNotificationCenterLocalState,
  type NotificationCategoryFilter,
  type NotificationDeliveryFilter,
  type NotificationGroup,
} from "@/lib/notification-center";
import {
  parseNotificationCenterServerState,
  type NotificationCenterServerState,
  type NotificationCenterStatePatch,
} from "@/lib/notification-center-state";
import {
  NOTIFICATION_PREFERENCE_KEYS,
  parseNotificationPreferenceValues,
  type NotificationPreferenceKey,
  type NotificationPreferenceMode,
  type NotificationPreferenceValues,
} from "@/lib/notification-preferences";
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
  if (entry.type === "alert_v1") {
    if (entry.alertV1?.trigger === "SQUAWK") return entry.squawk ? `Emergency · Squawk ${entry.squawk}` : "Emergency";
    if (entry.alertV1?.sourceType === "FLIGHT_EVENT" && entry.alertV1.flightEventType) {
      return `Flight Intelligence · ${entry.alertV1.flightEventType.replaceAll("_", " ")}`;
    }
    return entry.alertV1?.ruleName ?? (cs ? "Alert pravidlo" : "Alert rule");
  }
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
  if (status === "center_only") return cs ? "JEN CENTRUM" : "CENTER ONLY";
  return cs ? "BEZ PUSH" : "NO PUSH";
}

type AdminAccess = "loading" | "ready" | "locked" | "error";

function preferenceLabel(key: NotificationPreferenceKey) {
  return t.notificationCenter.categories[key];
}

function groupIdentity(group: NotificationGroup): AlertHistoryEntry {
  return group.entries.find((entry) => entry.aircraft.callsign || entry.aircraft.registration || entry.aircraft.aircraftType) ?? group.primary;
}

function groupRuleNames(group: NotificationGroup): string[] {
  return [...new Set(group.entries.flatMap((entry) => entry.ruleNames))];
}

export function NotificationCenter() {
  const cs = t.locale.startsWith("cs");
  const copy = t.notificationCenter;
  const [data, setData] = useState<AlertHistoryPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [preferenceAccess, setPreferenceAccess] = useState<AdminAccess>("loading");
  const [preferenceDraft, setPreferenceDraft] = useState<NotificationPreferenceValues | null>(null);
  const [stateAccess, setStateAccess] = useState<AdminAccess>("loading");
  const [serverState, setServerState] = useState<NotificationCenterServerState | null>(null);
  const [saving, setSaving] = useState(false);
  const [preferenceMessage, setPreferenceMessage] = useState<string | null>(null);
  const [mutePending, setMutePending] = useState<string | null>(null);
  const [muteMessage, setMuteMessage] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategoryFilter>("ALL");
  const [deliveryFilter, setDeliveryFilter] = useState<NotificationDeliveryFilter>("ALL");
  const [query, setQuery] = useState("");

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

  useEffect(() => {
    const controller = new AbortController();
    const openedAt = new Date().toISOString();
    void fetch("/api/admin/alerts/delivery?view=notification-state", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403 || response.status === 503) {
          if (!controller.signal.aborted) setStateAccess("locked");
          return null;
        }
        if (!response.ok) throw new Error("notification state unavailable");
        return await response.json() as { notificationState?: unknown };
      })
      .then(async (payload) => {
        if (!payload || controller.signal.aborted) return;
        const state = parseNotificationCenterServerState(payload.notificationState);
        if (!state) throw new Error("invalid notification state");
        setLastSeen(state.lastSeen);
        setServerState(state);
        setStateAccess("ready");
        const response = await fetch("/api/admin/alerts/delivery?view=notification-state", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastSeen: openedAt }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const updated = await response.json() as { notificationState?: unknown };
        const next = parseNotificationCenterServerState(updated.notificationState);
        if (next && !controller.signal.aborted) setServerState(next);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setStateAccess("error");
      });
    return () => controller.abort();
  }, []);

  const groups = useMemo(() => groupNotificationEntries(data?.items ?? []), [data?.items]);
  const filteredGroups = useMemo(() => filterNotificationGroups(groups, {
    category: categoryFilter,
    delivery: deliveryFilter,
    query,
  }), [groups, categoryFilter, deliveryFilter, query]);
  const metrics = useMemo(() => notificationCenterMetrics(data?.items ?? [], lastSeen), [data?.items, lastSeen]);

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

  async function updateNotificationState(patch: NotificationCenterStatePatch, key: string) {
    if (stateAccess !== "ready" || mutePending) return;
    setMutePending(key);
    setMuteMessage(null);
    try {
      const response = await fetch("/api/admin/alerts/delivery?view=notification-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("notification state update failed");
      const payload = await response.json() as { notificationState?: unknown };
      const next = parseNotificationCenterServerState(payload.notificationState);
      if (!next) throw new Error("invalid notification state");
      setServerState(next);
    } catch {
      setMuteMessage(copy.muteFailed);
    } finally {
      setMutePending(null);
    }
  }

  return <main className={styles.page} data-testid="notification-center-v2">
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
      <MetricCard value={data ? metrics.unread : "—"} label={copy.unread} detail={stateAccess === "ready" ? copy.serverUnread : copy.localUnread} />
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
      <SectionHeader kicker="CENTER V2" title={copy.feed} description={copy.feedDescription} />
      <div className={styles.filters} aria-label={copy.filters}>
        <label>
          <span>{copy.categoryFilter}</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as NotificationCategoryFilter)}>
            {(["ALL", "WATCHLIST", "EMERGENCY", "INTELLIGENCE", "RECORDS"] as const).map((value) =>
              <option key={value} value={value}>{copy.filterCategories[value]}</option>)}
          </select>
        </label>
        <label>
          <span>{copy.deliveryFilter}</span>
          <select value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value as NotificationDeliveryFilter)}>
            {(["ALL", "DELIVERED", "FAILED", "CENTER_ONLY"] as const).map((value) =>
              <option key={value} value={value}>{copy.filterDelivery[value]}</option>)}
          </select>
        </label>
        <label className={styles.searchField}>
          <span>{copy.search}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder={copy.search} />
        </label>
      </div>
      {muteMessage ? <p className={styles.inlineError} role="status">{muteMessage}</p> : null}
      {failed && !data ? <EmptyState title={copy.unavailable} />
        : !data ? <p className={styles.loading}>{t.common.loading}</p>
        : filteredGroups.length ? <ol className={styles.feed}>
          {filteredGroups.map((group) => {
            const primary = group.primary;
            const identity = groupIdentity(group);
            const name = identity.aircraft.callsign ?? identity.aircraft.registration ?? group.aircraftIcao;
            const category = notificationCategory(primary);
            const rules = groupRuleNames(group);
            const ruleRefs = notificationRuleReferences(group);
            const aircraftMuted = serverState?.mutedAircraft.includes(group.aircraftIcao) ?? false;
            return <li key={group.id} className={styles.item}>
              <div className={styles.itemMain}>
                <div className={styles.itemHeading}>
                  <span className={styles.category}>{category}</span>
                  <strong>{eventTitle(primary, cs)}</strong>
                  {group.entries.length > 1 ? <span className={styles.threadCount}>{copy.groupedEvents(group.entries.length)}</span> : null}
                  {aircraftMuted ? <span className={styles.mutedBadge}>{copy.muted}</span> : null}
                </div>
                <div className={styles.identity}>
                  <Link href={`/aircraft/${encodeURIComponent(group.aircraftIcao)}` as Route}>{name}</Link>
                  <span>{identity.aircraft.registration ?? group.aircraftIcao}</span>
                  {identity.aircraft.aircraftType ? <span>{identity.aircraft.aircraftType}</span> : null}
                  {primary.intelligence?.airportIcao ? <span>{primary.intelligence.airportIcao}</span> : null}
                  {primary.intelligence?.sectorId ? <span>{primary.intelligence.sectorId}</span> : null}
                </div>
                {rules.length ? <small>{rules.join(", ")}</small> : null}

                <div className={styles.whyBlock}>
                  <strong>{copy.why}</strong>
                  <span>{copy.whyReasons[notificationWhyCode(primary)]}</span>
                </div>

                {ruleRefs.length ? <div className={styles.ruleRefs}>
                  <strong>{copy.rules}</strong>
                  <div>
                    {ruleRefs.map((rule) => {
                      const muted = serverState?.mutedRuleIds.includes(rule.id) ?? false;
                      const href = (rule.kind === "durable"
                        ? `/admin/alerts?rule=${encodeURIComponent(rule.id)}`
                        : `/watchlist?rule=${encodeURIComponent(rule.id)}`) as Route;
                      const key = `rule:${rule.id}`;
                      return <span key={`${rule.kind}:${rule.id}`} className={styles.ruleRef}>
                        <Link href={href}>{rule.label}</Link>
                        {stateAccess === "ready" ? <button
                          type="button"
                          disabled={mutePending !== null}
                          onClick={() => void updateNotificationState({ rule: { id: rule.id, muted: !muted } }, key)}
                        >{muted ? copy.unmuteRule : copy.muteRule}</button> : null}
                      </span>;
                    })}
                  </div>
                </div> : null}

                {group.entries.length > 1 ? <div className={styles.timeline}>
                  <span className={styles.timelineLabel}>{copy.timeline}</span>
                  <ol>
                    {[...group.entries].reverse().map((entry) => <li key={entry.id} className={styles.timelineItem}>
                      <span className={styles.timelineDot} aria-hidden="true" />
                      <time dateTime={entry.detectedAt}>{formatDateTime(entry.detectedAt, t)}</time>
                      <span className={styles.timelineEvent}>
                        <strong>{eventTitle(entry, cs)}</strong>
                        <small>{notificationCategory(entry)}</small>
                      </span>
                      <StatusBadge variant={statusVariant(entry.notificationStatus)}>{statusLabel(entry.notificationStatus, cs)}</StatusBadge>
                    </li>)}
                  </ol>
                </div> : null}

                <div className={styles.itemActions}>
                  <Link className={styles.openLink} href={`/aircraft/${encodeURIComponent(group.aircraftIcao)}` as Route}>{copy.open} →</Link>
                  {stateAccess === "ready" ? <button
                    type="button"
                    disabled={mutePending !== null}
                    onClick={() => void updateNotificationState({ aircraft: { icaoHex: group.aircraftIcao, muted: !aircraftMuted } }, `aircraft:${group.aircraftIcao}`)}
                  >{aircraftMuted ? copy.unmuteAircraft : copy.muteAircraft}</button> : null}
                </div>
              </div>
              <div className={styles.itemSide}>
                <span>{group.entries.length > 1 ? copy.latest : copy.detected}</span>
                <time dateTime={group.latestAt}>{formatDateTime(group.latestAt, t)}</time>
                <StatusBadge variant={statusVariant(group.notificationStatus)}>{statusLabel(group.notificationStatus, cs)}</StatusBadge>
              </div>
            </li>;
          })}
        </ol> : <EmptyState title={data.items.length ? copy.noMatches : copy.empty} />}
    </Panel>
  </main>;
}
