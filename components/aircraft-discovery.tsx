"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { LogbookInterestingAircraft, LogbookInterestingReason, LogbookSummaryResponse } from "@/lib/aircraft/types";
import { formatDistance, formatNumber, formatDateTime, t } from "@/lib/i18n";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import styles from "./aircraft-discovery.module.css";

type DiscoveryFilter = "all" | "live" | "new" | "rare" | "returning";

function aircraftHref(hex: string) {
  return { pathname: "/aircraft/" + encodeURIComponent(hex) } as const;
}

function watchlistHref(item: LogbookInterestingAircraft) {
  const params = new URLSearchParams({ icaoHex: item.icaoHex });
  if (item.registration) params.set("registration", item.registration);
  return "/watchlist?" + params.toString();
}

function reasonPriority(reason: LogbookInterestingReason): number {
  if (reason === "new") return 6;
  if (reason === "emergency") return 5;
  if (reason === "watchlisted") return 4;
  if (reason === "record") return 3;
  if (reason === "returning") return 2;
  return 1;
}

export function AircraftDiscovery() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Objevovat letadla",
    subtitle: "Co je dnes kolem přijímače nové, vzácné, vracející se nebo jinak zajímavé.",
    live: "Živě",
    all: "Vše",
    new: "Nové",
    rare: "Vzácné",
    returning: "Návraty",
    liveNow: "Živě teď",
    uniqueToday: "Unikátní dnes",
    newToday: "Nová dnes",
    rareToday: "Vzácná dnes",
    returningToday: "Návraty dnes",
    watchlistedLive: "Watchlist živě",
    interesting: "Zajímavá letadla",
    interestingDescription: "Bounded výběr z existujícího Logbook Summary; žádný nový historický scan.",
    noItems: "V této kategorii zatím není žádné zajímavé letadlo.",
    flights: "pozorovaných letů",
    returnGap: "návrat po",
    days: "dnech",
    distance: "vzdálenost",
    open: "Detail",
    watch: "Sledovat",
    reception: "Reception records",
    todayRecord: "Dnešní rekord",
    lifetimeRecord: "Historický rekord",
    noRecord: "Zatím bez rekordu",
    updated: "Aktualizováno",
    sourceUnavailable: "Discovery data jsou dočasně nedostupná.",
    labels: {
      new: "NEW",
      rare: "RARE",
      returning: "RETURNING",
      record: "RECORD",
      watchlisted: "WATCHLIST",
      emergency: "EMERGENCY",
    } as Record<LogbookInterestingReason, string>,
  } : {
    title: "Aircraft Discovery",
    subtitle: "See what is new, rare, returning or otherwise interesting around your receiver today.",
    live: "Live",
    all: "All",
    new: "New",
    rare: "Rare",
    returning: "Returning",
    liveNow: "Live now",
    uniqueToday: "Unique today",
    newToday: "New today",
    rareToday: "Rare today",
    returningToday: "Returning today",
    watchlistedLive: "Watchlist live",
    interesting: "Interesting aircraft",
    interestingDescription: "Bounded selection from the existing Logbook Summary; no new historical scan.",
    noItems: "There are no interesting aircraft in this category yet.",
    flights: "observed flights",
    returnGap: "returned after",
    days: "days",
    distance: "distance",
    open: "Detail",
    watch: "Watch",
    reception: "Reception records",
    todayRecord: "Today's record",
    lifetimeRecord: "Lifetime record",
    noRecord: "No record yet",
    updated: "Updated",
    sourceUnavailable: "Discovery data is temporarily unavailable.",
    labels: {
      new: "NEW",
      rare: "RARE",
      returning: "RETURNING",
      record: "RECORD",
      watchlisted: "WATCHLIST",
      emergency: "EMERGENCY",
    } as Record<LogbookInterestingReason, string>,
  };

  const [data, setData] = useState<LogbookSummaryResponse | null>(null);
  const [filter, setFilter] = useState<DiscoveryFilter>("all");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = () => {
      void fetch("/api/logbook/summary", { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("discovery request failed");
          return await response.json() as LogbookSummaryResponse;
        })
        .then((next) => {
          if (!active) return;
          setData(next);
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

  const items = useMemo(() => {
    const source = data?.interestingAircraft ?? [];
    const filtered = source.filter((item) => {
      if (filter === "all") return true;
      if (filter === "live") return item.isLive;
      return item.labels.includes(filter);
    });
    return [...filtered].sort((a, b) => {
      const aScore = Math.max(0, ...a.reasons.map(reasonPriority));
      const bScore = Math.max(0, ...b.reasons.map(reasonPriority));
      return bScore - aScore || Number(b.isLive) - Number(a.isLive) || a.icaoHex.localeCompare(b.icaoHex);
    });
  }, [data?.interestingAircraft, filter]);

  const filters: Array<[DiscoveryFilter, string]> = [
    ["all", copy.all],
    ["live", copy.live],
    ["new", copy.new],
    ["rare", copy.rare],
    ["returning", copy.returning],
  ];

  return <main className={styles.page} data-testid="aircraft-discovery-v1">
    <PageHeader
      kicker="AIRRADAR / DISCOVER"
      title={copy.title}
      description={copy.subtitle}
      actions={<div className={styles.meta}>
        <StatusBadge variant={failed || data?.source === "unavailable" ? "warning" : data ? "live" : "neutral"}>
          {failed || data?.source === "unavailable" ? copy.sourceUnavailable : data ? copy.live : t.common.loading}
        </StatusBadge>
        {data ? <small>{copy.updated} {formatDateTime(data.generatedAt, t)}</small> : null}
      </div>}
    />

    <MetricStrip>
      <MetricCard value={formatNumber(data?.liveAircraft ?? 0)} label={copy.liveNow} />
      <MetricCard value={formatNumber(data?.uniqueAircraftToday ?? 0)} label={copy.uniqueToday} />
      <MetricCard value={formatNumber(data?.newAircraftToday ?? 0)} label={copy.newToday} />
      <MetricCard value={formatNumber(data?.rareAircraftToday ?? 0)} label={copy.rareToday} />
      <MetricCard value={formatNumber(data?.returningAircraftToday ?? 0)} label={copy.returningToday} />
      <MetricCard value={formatNumber(data?.watchlistedLiveAircraft ?? 0)} label={copy.watchlistedLive} />
    </MetricStrip>

    <div className={styles.filters} role="group" aria-label={copy.interesting}>
      {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div>

    <div className={styles.layout}>
      <Panel className={styles.interestingPanel}>
        <SectionHeader kicker="DISCOVERY" title={copy.interesting} description={copy.interestingDescription} />
        {failed && !data ? <EmptyState title={copy.sourceUnavailable} /> : !data ? <p className={styles.loading}>{t.common.loading}</p> : items.length ? (
          <div className={styles.cards}>
            {items.map((item) => <article className={styles.card} key={item.icaoHex}>
              <div className={styles.cardHead}>
                <div>
                  <strong>{item.callsign ?? item.registration ?? item.icaoHex}</strong>
                  <span>{item.registration ?? item.icaoHex}{item.aircraftType ? " · " + item.aircraftType : ""}</span>
                </div>
                {item.isLive ? <StatusBadge variant="live">{copy.live}</StatusBadge> : null}
              </div>
              <div className={styles.badges}>
                {[...item.reasons].sort((a, b) => reasonPriority(b) - reasonPriority(a)).map((reason) => <span data-reason={reason} key={reason}>{copy.labels[reason]}</span>)}
              </div>
              <dl>
                <div><dt>{copy.flights}</dt><dd>{formatNumber(item.flightCount)}</dd></div>
                <div><dt>{copy.distance}</dt><dd>{formatDistance(item.distanceKm)}</dd></div>
                {item.returningGapDays !== null ? <div><dt>{copy.returnGap}</dt><dd>{formatNumber(item.returningGapDays)} {copy.days}</dd></div> : null}
              </dl>
              <div className={styles.actions}>
                <Link href={aircraftHref(item.icaoHex)}>{copy.open}</Link>
                <Link href={watchlistHref(item)}>{copy.watch}</Link>
              </div>
            </article>)}
          </div>
        ) : <EmptyState title={copy.noItems} />}
      </Panel>

      <Panel>
        <SectionHeader kicker="RANGE" title={copy.reception} />
        <div className={styles.records}>
          <RecordCard label={copy.todayRecord} record={data?.todayReceptionRecord ?? null} empty={copy.noRecord} />
          <RecordCard label={copy.lifetimeRecord} record={data?.lifetimeReceptionRecord ?? null} empty={copy.noRecord} />
        </div>
      </Panel>
    </div>
  </main>;
}

function RecordCard({
  label,
  record,
  empty,
}: {
  label: string;
  record: LogbookSummaryResponse["todayReceptionRecord"];
  empty: string;
}) {
  return <div className={styles.record}>
    <span>{label}</span>
    {record ? <>
      <strong>{formatDistance(record.distanceKm)}</strong>
      <Link href={aircraftHref(record.icaoHex)}>{record.registration ?? record.icaoHex}</Link>
      <small>{formatDateTime(record.recordedAt, t)} · {Math.round(record.bearing)}°</small>
    </> : <small>{empty}</small>}
  </div>;
}
