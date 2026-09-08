"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LogbookLabel, LogbookSummaryResponse, ReceiverReceptionRecord } from "@/lib/aircraft/types";
import { formatDateTime, formatDistance, formatNumber, formatTrack, t } from "@/lib/i18n";

function labelText(label: LogbookLabel): string {
  if (label === "new") return t.logbook.newAircraft;
  if (label === "rare") return t.logbook.rareAircraft;
  return t.logbook.returningAircraft;
}

function labelClass(label: LogbookLabel): string {
  return label === "new" ? "new" : label;
}

function DashboardRecord({ title, record }: { title: string; record: ReceiverReceptionRecord | null }) {
  return <div className="dashboard-record">
    <span>{title}</span>
    {record ? <Link href={`/aircraft/${encodeURIComponent(record.icaoHex)}`}>
      <strong>{formatDistance(record.distanceKm)}</strong>
      <small>{record.icaoHex} · {record.registration ?? t.common.emptyValue} · {formatTrack(record.bearing)} · {formatDateTime(record.recordedAt)}</small>
    </Link> : <small>{t.common.emptyValue}</small>}
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="dashboard-logbook-metric"><strong>{formatNumber(value)}</strong><span>{label}</span></div>;
}

export function LogbookSummary() {
  const [data, setData] = useState<LogbookSummaryResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/logbook/summary", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("logbook summary request failed");
        return await response.json() as LogbookSummaryResponse;
      })
      .then((next) => {
        if (!active) return;
        setData(next);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => { active = false; };
  }, []);

  return <section className="logbook-summary-panel" aria-labelledby="dashboard-logbook-title">
    <div className="logbook-summary-heading">
      <div>
        <h2 id="dashboard-logbook-title">{t.dashboard.logbookTitle}</h2>
        <p>{t.dashboard.logbookDescription}</p>
      </div>
      <div className="logbook-summary-links"><Link href="/fleet">{t.dashboard.openFleet}</Link><Link href="/statistics">{t.dashboard.openStatistics}</Link></div>
    </div>
    {failed ? <p className="logbook-summary-message">{t.dashboard.unavailable}</p> : !data ? <p className="logbook-summary-message">{t.dashboard.loading}</p> : <>
      <div className="dashboard-logbook-metrics">
        <Metric label={t.dashboard.liveAircraft} value={data.liveAircraft} />
        <Metric label={t.dashboard.uniqueToday} value={data.uniqueAircraftToday} />
        <Metric label={t.dashboard.newToday} value={data.newAircraftToday} />
        <Metric label={t.dashboard.rareToday} value={data.rareAircraftToday} />
        <Metric label={t.dashboard.returningToday} value={data.returningAircraftToday} />
        <Metric label={t.dashboard.watchlistedLive} value={data.watchlistedLiveAircraft} />
      </div>
      <div className="dashboard-logbook-lower">
        <div className="dashboard-logbook-highlights">
          <h3>{t.dashboard.interesting}</h3>
          {data.interestingAircraft.length ? <ul>{data.interestingAircraft.slice(0, 4).map((aircraft) => <li key={aircraft.icaoHex}><Link href={`/aircraft/${encodeURIComponent(aircraft.icaoHex)}`}>{aircraft.icaoHex}</Link><span>{aircraft.labels.map((label) => <span className={`dashboard-logbook-label ${labelClass(label)}`} key={label}>{labelText(label)}</span>)}</span></li>)}</ul> : <p>{t.dashboard.noInteresting}</p>}
        </div>
        <div className="dashboard-logbook-records">
          <DashboardRecord title={t.dashboard.todayRecord} record={data.todayReceptionRecord} />
          <DashboardRecord title={t.dashboard.lifetimeRecord} record={data.lifetimeReceptionRecord} />
        </div>
      </div>
    </>}
  </section>;
}
