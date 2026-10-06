"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { LocaleKey } from "@/lib/i18n";
import type { AlertHistoryEntry, AlertHistoryPage } from "@/lib/server/alert-history";
import type { PublicWatchlistRule } from "@/lib/server/watchlist-store";
import { MetricCard, MetricStrip, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import styles from "./watchlist-intelligence-v2.module.css";

function aircraftHref(hex: string) {
  return { pathname: "/aircraft/" + encodeURIComponent(hex) } as const;
}

export function WatchlistIntelligenceV2({
  locale,
  rules,
}: {
  locale: LocaleKey;
  rules: readonly PublicWatchlistRule[];
}) {
  const cs = locale === "cs";
  const copy = cs ? {
    title: "Watchlist Intelligence",
    subtitle: "Živý souhrn pravidel, aktuálních shod a poslední bounded aktivity.",
    enabled: "Aktivní pravidla",
    matchingRules: "Matching pravidla",
    matchingAircraft: "Matching letadla",
    recentEvents: "Poslední události",
    delivered: "Doručeno",
    failed: "Selhalo",
    rules: "Pravidla",
    recent: "událostí v posledních 50",
    noRecent: "bez události v posledních 50",
    currentMatches: "Aktuální shody",
    lastActivity: "Poslední aktivita",
    openHistory: "Celá historie",
    bounded: "Statistiky aktivity jsou odvozeny z nejnovějších 50 watchlist událostí.",
    loadFailed: "Aktivitu se nepodařilo načíst.",
    disabled: "DISABLED",
    matching: "MATCHING",
    idle: "IDLE",
  } : {
    title: "Watchlist Intelligence",
    subtitle: "Live summary of rules, current matches and recent bounded activity.",
    enabled: "Enabled rules",
    matchingRules: "Matching rules",
    matchingAircraft: "Matching aircraft",
    recentEvents: "Recent events",
    delivered: "Delivered",
    failed: "Failed",
    rules: "Rules",
    recent: "events in latest 50",
    noRecent: "no event in latest 50",
    currentMatches: "Current matches",
    lastActivity: "Last activity",
    openHistory: "Full history",
    bounded: "Activity statistics are derived from the latest 50 watchlist events.",
    loadFailed: "Activity could not be loaded.",
    disabled: "DISABLED",
    matching: "MATCHING",
    idle: "IDLE",
  };

  const [activity, setActivity] = useState<AlertHistoryPage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = () => {
      void fetch("/api/watchlist/activity?page=0&pageSize=50", { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("watchlist intelligence request failed");
          return await response.json() as AlertHistoryPage;
        })
        .then((next) => {
          if (!active) return;
          setActivity(next);
          setFailed(false);
        })
        .catch((error) => {
          if (!active || (error as Error).name === "AbortError") return;
          setFailed(true);
        });
    };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller.abort();
    };
  }, []);

  const metrics = useMemo(() => {
    const enabledRules = rules.filter((rule) => rule.enabled);
    const matchingRules = enabledRules.filter((rule) => rule.currentState.status === "matching");
    const matchingAircraft = new Set(matchingRules.flatMap((rule) => rule.currentState.aircraft.map((item) => item.icaoHex)));
    const items = activity?.items ?? [];
    return {
      enabled: enabledRules.length,
      matchingRules: matchingRules.length,
      matchingAircraft: matchingAircraft.size,
      recentEvents: items.length,
      delivered: items.filter((item) => item.notificationStatus === "delivered").length,
      failed: items.filter((item) => item.notificationStatus === "failed").length,
    };
  }, [activity?.items, rules]);

  const ruleRows = useMemo(() => rules.map((rule) => {
    const events = (activity?.items ?? []).filter((entry) => entry.ruleIds.includes(rule.id));
    return {
      rule,
      recentCount: events.length,
      last: events[0] ?? null,
    };
  }), [activity?.items, rules]);

  return <Panel className={styles.panel} data-testid="watchlist-intelligence-v2">
    <SectionHeader
      kicker="WATCHLIST V2"
      title={copy.title}
      description={copy.subtitle}
      actions={<Link className={styles.historyLink} href="/alerts">{copy.openHistory} →</Link>}
    />

    <MetricStrip className={styles.metrics}>
      <MetricCard value={metrics.enabled} label={copy.enabled} />
      <MetricCard value={metrics.matchingRules} label={copy.matchingRules} />
      <MetricCard value={metrics.matchingAircraft} label={copy.matchingAircraft} />
      <MetricCard value={metrics.recentEvents} label={copy.recentEvents} detail={copy.bounded} />
      <MetricCard value={metrics.delivered} label={copy.delivered} />
      <MetricCard value={metrics.failed} label={copy.failed} />
    </MetricStrip>

    {failed ? <p className={styles.error}>{copy.loadFailed}</p> : null}

    <div className={styles.ruleGrid}>
      {ruleRows.map(({ rule, recentCount, last }) => {
        const status = !rule.enabled
          ? copy.disabled
          : rule.currentState.status === "matching" ? copy.matching : copy.idle;
        return <article className={styles.ruleCard} key={rule.id}>
          <div className={styles.ruleHead}>
            <div>
              <strong>{rule.name}</strong>
              <small>{rule.type} · {rule.value}</small>
            </div>
            <StatusBadge variant={!rule.enabled ? "neutral" : rule.currentState.status === "matching" ? "live" : "success"}>{status}</StatusBadge>
          </div>

          <dl className={styles.ruleStats}>
            <div>
              <dt>{copy.currentMatches}</dt>
              <dd>{rule.currentState.aircraft.length}</dd>
            </div>
            <div>
              <dt>{copy.recentEvents}</dt>
              <dd>{recentCount}</dd>
            </div>
          </dl>

          {rule.currentState.aircraft.length ? <div className={styles.matches}>
            {rule.currentState.aircraft.slice(0, 4).map((aircraft) => <Link href={aircraftHref(aircraft.icaoHex)} key={aircraft.icaoHex}>
              <strong>{aircraft.callsign ?? aircraft.registration ?? aircraft.icaoHex}</strong>
              <small>{aircraft.icaoHex}</small>
            </Link>)}
          </div> : null}

          <div className={styles.lastActivity}>
            <span>{copy.lastActivity}</span>
            {last ? <>
              <strong>{last.aircraft.callsign ?? last.aircraft.registration ?? last.aircraft.icaoHex}</strong>
              <small>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(last.detectedAt))}</small>
            </> : <small>{copy.noRecent}</small>}
          </div>
          <small className={styles.bound}>{recentCount ? recentCount + " " + copy.recent : copy.noRecent}</small>
        </article>;
      })}
    </div>
  </Panel>;
}
