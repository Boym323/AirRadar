"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  LogbookInterestingAircraft,
  LogbookInterestingReason,
  LogbookSummaryResponse,
  ReceiverReceptionRecord,
  ReceiverReceptionRecordsResponse,
} from "@/lib/aircraft/types";
import { formatDateTime, formatDistance, formatNumber, t } from "@/lib/i18n";
import {
  EmptyState,
  MetricCard,
  MetricStrip,
  PageHeader,
  Panel,
  SectionHeader,
  StatusBadge,
} from "@/components/ui-primitives";
import styles from "./reception-records-center.module.css";

const REFRESH_MS = 60_000;

function identity(item: LogbookInterestingAircraft): string {
  return item.callsign ?? item.registration ?? item.icaoHex;
}

function reasonLabel(reason: LogbookInterestingReason, cs: boolean): string {
  const labels: Record<LogbookInterestingReason, [string, string]> = {
    new: ["NEW", "NOVÉ"],
    rare: ["RARE", "VZÁCNÉ"],
    returning: ["RETURNING", "NÁVRAT"],
    record: ["RECORD", "REKORD"],
    watchlisted: ["WATCHLIST", "SLEDOVANÉ"],
    emergency: ["EMERGENCY", "NOUZE"],
  };
  return labels[reason][cs ? 1 : 0];
}

function RecordCard({
  label,
  record,
  empty,
}: {
  label: string;
  record: ReceiverReceptionRecord | null;
  empty: string;
}) {
  return (
    <article className={styles.recordCard}>
      <span>{label}</span>
      {record ? (
        <>
          <strong>{formatDistance(record.distanceKm)}</strong>
          <Link href={`/aircraft/${encodeURIComponent(record.icaoHex)}`}>
            {record.registration ?? record.icaoHex}
          </Link>
          <small>{formatDateTime(record.recordedAt)}</small>
        </>
      ) : <small>{empty}</small>}
    </article>
  );
}

export function ReceptionRecordsCenter() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Rekordy příjmu",
    subtitle: "Rekordní dosah a dnešní spotting milníky pozorované tímto přijímačem.",
    back: "Zpět na radar",
    statistics: "Statistiky",
    today: "Dnes",
    lifetime: "Historický rekord",
    newAircraft: "Nová letadla",
    rareAircraft: "Vzácná letadla",
    returningAircraft: "Návraty",
    watchlisted: "Sledovaná v dosahu",
    distanceRecords: "Rekordy vzdálenosti",
    distanceDescription: "Aktuální denní a lifetime maximum z existujícího bounded reception-records kontraktu.",
    milestones: "Discovery milníky",
    milestonesDescription: "Dnešní NEW / RARE / RETURNING a další důvody z existujícího Logbook Summary.",
    aircraftType: "Typ",
    distance: "Vzdálenost",
    reasons: "Důvod",
    noRecords: "Pro rekordy příjmu zatím nejsou dostupná data.",
    noMilestones: "Dnes zatím nejsou žádné discovery milníky.",
    recordsUnavailable: "Zdroj rekordů příjmu je dočasně nedostupný.",
    summaryUnavailable: "Logbook Summary je dočasně nedostupný.",
    loading: "Načítám receiver-observed data…",
    disclosure: "Pouze receiver-observed data AirRadar. Rekordy ani discovery klasifikace nejsou globální letecké statistiky; seznam zajímavých letadel je bounded výstup existujícího Logbook Summary.",
  } : {
    title: "Reception Records",
    subtitle: "Record reception range and today's spotting milestones observed by this receiver.",
    back: "Back to radar",
    statistics: "Statistics",
    today: "Today",
    lifetime: "Lifetime",
    newAircraft: "New aircraft",
    rareAircraft: "Rare aircraft",
    returningAircraft: "Returning",
    watchlisted: "Watchlisted live",
    distanceRecords: "Distance Records",
    distanceDescription: "Current daily and lifetime maxima from the existing bounded reception-records contract.",
    milestones: "Discovery Milestones",
    milestonesDescription: "Today's NEW / RARE / RETURNING and other reasons from the existing Logbook Summary.",
    aircraftType: "Type",
    distance: "Distance",
    reasons: "Reason",
    noRecords: "No reception-record data is available yet.",
    noMilestones: "There are no discovery milestones today.",
    recordsUnavailable: "The reception-record source is temporarily unavailable.",
    summaryUnavailable: "Logbook Summary is temporarily unavailable.",
    loading: "Loading receiver-observed data…",
    disclosure: "AirRadar receiver-observed data only. Records and discovery classifications are not global aviation statistics; the interesting-aircraft list is the bounded output of the existing Logbook Summary.",
  };

  const [records, setRecords] = useState<ReceiverReceptionRecordsResponse | null>(null);
  const [summary, setSummary] = useState<LogbookSummaryResponse | null>(null);
  const [recordsFailed, setRecordsFailed] = useState(false);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void fetch("/api/reception-records", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("reception records unavailable");
        return response.json() as Promise<ReceiverReceptionRecordsResponse>;
      })
      .then((payload) => {
        if (!active) return;
        setRecords(payload);
        setRecordsFailed(payload.source === "unavailable");
      })
      .catch((error) => {
        if (!active || (error as Error).name === "AbortError") return;
        setRecordsFailed(true);
      });

    void fetch("/api/logbook/summary", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("logbook summary unavailable");
        return response.json() as Promise<LogbookSummaryResponse>;
      })
      .then((payload) => {
        if (!active) return;
        setSummary(payload);
        setSummaryFailed(payload.source === "unavailable");
      })
      .catch((error) => {
        if (!active || (error as Error).name === "AbortError") return;
        setSummaryFailed(true);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [revision]);

  useEffect(() => {
    const timer = window.setInterval(() => setRevision((value) => value + 1), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const milestones = useMemo(
    () => (summary?.interestingAircraft ?? []).filter((item) =>
      item.reasons.some((reason) => reason === "new" || reason === "rare" || reason === "returning" || reason === "record")
    ),
    [summary],
  );

  const todayRecord = records?.today ?? summary?.todayReceptionRecord ?? null;
  const lifetimeRecord = records?.lifetime ?? summary?.lifetimeReceptionRecord ?? null;
  const loading = !records && !summary && !recordsFailed && !summaryFailed;

  return (
    <main className={styles.page} data-testid="reception-records-center-v1">
      <PageHeader
        kicker="AIRRADAR · RECEIVER"
        title={copy.title}
        description={copy.subtitle}
        backLink={<Link className="back-link" href="/">{copy.back}</Link>}
        actions={<Link className="back-link" href="/statistics">{copy.statistics}</Link>}
      />

      {loading ? <p className={styles.status}>{copy.loading}</p> : null}
      <MetricStrip className={styles.metrics}>
        <MetricCard value={todayRecord ? formatDistance(todayRecord.distanceKm) : "—"} label={copy.today} detail={todayRecord?.registration ?? todayRecord?.icaoHex ?? undefined} />
        <MetricCard value={lifetimeRecord ? formatDistance(lifetimeRecord.distanceKm) : "—"} label={copy.lifetime} detail={lifetimeRecord?.registration ?? lifetimeRecord?.icaoHex ?? undefined} />
        <MetricCard value={summary ? formatNumber(summary.newAircraftToday) : "—"} label={copy.newAircraft} />
        <MetricCard value={summary ? formatNumber(summary.rareAircraftToday) : "—"} label={copy.rareAircraft} />
        <MetricCard value={summary ? formatNumber(summary.returningAircraftToday) : "—"} label={copy.returningAircraft} />
        <MetricCard value={summary ? formatNumber(summary.watchlistedLiveAircraft) : "—"} label={copy.watchlisted} />
      </MetricStrip>

      <div className={styles.grid}>
        <Panel>
          <SectionHeader kicker="DISTANCE" title={copy.distanceRecords} description={copy.distanceDescription} />
          {recordsFailed ? <p className={styles.warning}>{copy.recordsUnavailable}</p> : null}
          {!todayRecord && !lifetimeRecord && !recordsFailed ? <EmptyState title={copy.noRecords} /> : (
            <div className={styles.records}>
              <RecordCard label={copy.today} record={todayRecord} empty={copy.noRecords} />
              <RecordCard label={copy.lifetime} record={lifetimeRecord} empty={copy.noRecords} />
            </div>
          )}
        </Panel>

        <Panel>
          <SectionHeader kicker="LOGBOOK" title={copy.milestones} description={copy.milestonesDescription} />
          {summaryFailed ? <p className={styles.warning}>{copy.summaryUnavailable}</p> : null}
          {milestones.length ? (
            <div className={styles.milestones}>
              {milestones.map((item) => (
                <article key={item.icaoHex}>
                  <div className={styles.identity}>
                    <Link href={`/aircraft/${encodeURIComponent(item.icaoHex)}`}>{identity(item)}</Link>
                    <small>{item.registration && item.registration !== identity(item) ? item.registration : item.icaoHex}</small>
                  </div>
                  <div className={styles.badges}>
                    {item.reasons.map((reason) => <StatusBadge key={reason} variant={reason === "emergency" ? "danger" : reason === "record" ? "warning" : "neutral"}>{reasonLabel(reason, cs)}</StatusBadge>)}
                  </div>
                  <dl>
                    <div><dt>{copy.aircraftType}</dt><dd>{item.aircraftType ?? "—"}</dd></div>
                    <div><dt>{copy.distance}</dt><dd>{item.distanceKm === null ? "—" : formatDistance(item.distanceKm)}</dd></div>
                    <div><dt>{copy.reasons}</dt><dd>{item.reasons.map((reason) => reasonLabel(reason, cs)).join(" · ")}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          ) : !summaryFailed ? <EmptyState title={copy.noMilestones} /> : null}
        </Panel>
      </div>

      <p className={styles.disclosure}>{copy.disclosure}</p>
    </main>
  );
}
