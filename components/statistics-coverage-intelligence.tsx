"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDateTime, formatDistance, formatNumber, formatTrack } from "@/lib/i18n";
import { statisticsCoverageIntelligenceText as text } from "@/lib/i18n/statistics-coverage-intelligence";
import type {
  CoverageIntelligenceAltitudeBand,
  CoverageIntelligenceRange,
  CoverageIntelligenceResponse,
  CoverageIntelligenceSector,
} from "@/lib/statistics-coverage-intelligence";
import styles from "./statistics-coverage-intelligence.module.css";

function rangeLabel(range: CoverageIntelligenceRange): string {
  return range === "7d" ? text.sevenDays : text.thirtyDays;
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div>;
}

function v2HealthLabel(state: CoverageIntelligenceResponse["intelligenceV2"]["health"]["state"]): string {
  if (state === "GOOD") return text.coverageV2HealthGood;
  if (state === "DEGRADED") return text.coverageV2HealthDegraded;
  if (state === "RECOVERING") return text.coverageV2HealthRecovering;
  return text.coverageHealthInsufficient;
}

function formatRatio(value: number | null): string {
  return value === null ? "—" : `${formatNumber(value * 100, 1)} %`;
}

function formatDelta(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${formatNumber(value, 1)} pp`;
}

function healthReasonLabel(reason: string): string {
  if (reason === "coverage.baseline_insufficient") return text.trendReasonBaseline;
  if (reason === "coverage.source_unavailable") return text.trendReasonSource;
  if (reason === "coverage.range_below_baseline") return text.trendReasonRange;
  if (reason === "coverage.sectors_below_baseline") return text.trendReasonSectors;
  if (reason === "coverage.unique_aircraft_below_baseline") return text.trendReasonUnique;
  if (reason === "coverage.messages_below_baseline") return text.trendReasonMessages;
  return reason;
}

function sectorLabel(sector: Pick<CoverageIntelligenceSector, "bearingFrom" | "bearingTo">): string {
  return `${String(sector.bearingFrom).padStart(3, "0")}°–${String(sector.bearingTo).padStart(3, "0")}°`;
}

function altitudeBandLabel(band: Pick<CoverageIntelligenceAltitudeBand, "minFt" | "maxFt">): string {
  return band.maxFt === null
    ? `${formatNumber(band.minFt)}+ ft`
    : `${formatNumber(band.minFt)}–${formatNumber(band.maxFt)} ft`;
}

export default function StatisticsCoverageIntelligence() {
  const [range, setRange] = useState<CoverageIntelligenceRange>("30d");
  const [data, setData] = useState<CoverageIntelligenceResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setFailed(false);
    void fetch(`/api/statistics/coverage-intelligence?range=${range}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("coverage intelligence request failed");
        return await response.json() as CoverageIntelligenceResponse;
      })
      .then((next) => {
        if (!controller.signal.aborted) setData(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [range]);

  const populatedSectors = useMemo(() => data?.coverage.sectors.filter((sector) => sector.observedDays > 0) ?? [], [data]);
  const maxHourlyCount = useMemo(() => Math.max(...(data?.hourly.bins.map((item) => item.count) ?? []), 1), [data]);
  const unavailable = failed || data?.source === "unavailable";

  return (
    <div className={styles.wrapper}>
      <section className={`statistics-card ${styles.panel}`} aria-labelledby="coverage-intelligence-title">
        <div className={`statistics-card-header ${styles.header}`}>
          <div>
            <h2 id="coverage-intelligence-title">{text.title}</h2>
            <p>{text.description}</p>
          </div>
          <div className="statistics-range-tabs" role="tablist" aria-label={text.rangeSelector}>
            {(["7d", "30d"] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={range === item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>
                {rangeLabel(item)}
              </button>
            ))}
          </div>
        </div>

        {!data && !failed ? <p className={styles.status}>{text.loading}</p> : unavailable ? <p className={styles.status}>{text.unavailable}</p> : data ? <>
          <div className={styles.metrics}>
            <SummaryMetric
              label={text.reliableCoverage}
              value={data.coverage.bestReliableP95 ? formatDistance(data.coverage.bestReliableP95.distanceKm) : "—"}
              detail={data.coverage.bestReliableP95 ? sectorLabel(data.coverage.bestReliableP95) : undefined}
            />
            <SummaryMetric label={text.reliableSectors} value={`${formatNumber(data.coverage.reliableSectors)} / 36`} detail={`≥ ${data.coverage.requiredReliableDays} d`} />
            <SummaryMetric
              label={text.coverageHealth}
              value={v2HealthLabel(data.intelligenceV2.health.state)}
              detail={`${text.coverageV2Rolling}: ${formatRatio(data.intelligenceV2.health.currentRatio)} · Δ ${formatDelta(data.intelligenceV2.health.deltaPercentagePoints)}`}
            />
            <SummaryMetric
              label={text.uniqueAircraftToday}
              value={data.intelligence.trend.currentDay ? formatNumber(data.intelligence.trend.currentDay.uniqueAircraft) : "—"}
              detail={data.intelligence.trend.currentDay?.date}
            />
            <SummaryMetric label={text.peakConcurrent} value={data.records.peakConcurrent ? formatNumber(data.records.peakConcurrent.count) : "—"} detail={data.records.peakConcurrent?.date} />
            <SummaryMetric
              label={text.receiverMessages}
              value={data.messages.total !== null ? formatNumber(data.messages.total) : "—"}
              detail={data.messages.observedDays ? `${data.messages.observedDays} ${text.messageDays}` : undefined}
            />
            <SummaryMetric
              label={text.fastestAircraft}
              value={data.records.fastestAircraft ? `${formatNumber(data.records.fastestAircraft.speedKt)} kt` : "—"}
              detail={data.records.fastestAircraft?.callsign ?? data.records.fastestAircraft?.registration ?? data.records.fastestAircraft?.icaoHex}
            />
            <SummaryMetric
              label={text.busiestHour}
              value={data.hourly.busiestHour ? formatNumber(data.hourly.busiestHour.count) : "—"}
              detail={data.hourly.busiestHour ? `${data.hourly.busiestHour.localHour.replace("T", " ")} · ${text.observedFlights}` : undefined}
            />
            <SummaryMetric
              label={text.highestFlight}
              value={data.records.highestFlight ? `${formatNumber(data.records.highestFlight.maxAltitudeFt)} ft` : "—"}
              detail={data.records.highestFlight?.callsign ?? data.records.highestFlight?.registration ?? data.records.highestFlight?.icaoHex}
            />
            <SummaryMetric
              label={text.farthestReception}
              value={data.records.farthestReception ? formatDistance(data.records.farthestReception.distanceKm) : "—"}
              detail={data.records.farthestReception ? `${data.records.farthestReception.icaoHex} · ${formatTrack(data.records.farthestReception.bearing)}` : undefined}
            />
          </div>

          <div className={styles.sections}>
            <section className={styles.section} aria-labelledby="receiver-coverage-v2-title" data-testid="receiver-coverage-intelligence-v2">
              <div className={styles.sectionHeader}>
                <div><h3 id="receiver-coverage-v2-title">{text.coverageV2Title}</h3><p>{text.coverageV2Description}</p></div>
              </div>
              <div className={styles.metrics}>
                <SummaryMetric label={text.coverageV2State} value={v2HealthLabel(data.intelligenceV2.health.state)} />
                <SummaryMetric label={text.coverageV2Rolling} value={formatRatio(data.intelligenceV2.health.currentRatio)} detail={`Δ ${formatDelta(data.intelligenceV2.health.deltaPercentagePoints)}`} />
                <SummaryMetric label={text.coverageV2Baseline} value={formatRatio(data.intelligenceV2.health.baselineRatio)} />
                <SummaryMetric label={text.coverageV2Sectors} value={`${data.intelligenceV2.health.degradedSectors} / ${data.intelligenceV2.health.evaluatedSectors}`} detail={text.coverageV2Degraded} />
              </div>
              {data.intelligenceV2.hourly.length ? <div className={styles.hourChart} role="img" aria-label={text.coverageV2Hourly}>
                {data.intelligenceV2.hourly.map((point) => {
                  const ratio = point.captureRatio ?? 0;
                  const hour = new Date(point.hour).getHours();
                  return <div className={styles.hourColumn} key={point.hour} title={`${formatDateTime(point.hour)} · ${formatRatio(point.captureRatio)} · ${formatNumber(point.captured)}/${formatNumber(point.available)}`}>
                    <div className={styles.hourBarTrack}><span className={styles.hourBar} style={{ height: `${Math.max(2, ratio * 100)}%` }} /></div>
                    <strong>{String(hour).padStart(2, "0")}</strong>
                    <small>{point.captureRatio === null ? "—" : formatNumber(point.captureRatio * 100, 0)}</small>
                  </div>;
                })}
              </div> : <p className={styles.status}>{text.noData}</p>}
              {data.intelligenceV2.sectors.some((sector) => sector.state !== "INSUFFICIENT_DATA") ? <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead><tr><th>{text.sector}</th><th>{text.coverageV2Rolling}</th><th>{text.coverageV2Baseline}</th><th>{text.coverageV2Delta}</th><th>{text.coverageV2SectorState}</th></tr></thead>
                  <tbody>{data.intelligenceV2.sectors.filter((sector) => sector.state !== "INSUFFICIENT_DATA").map((sector) => <tr key={sector.bearingFrom}>
                    <th>{sectorLabel(sector)}</th>
                    <td>{formatRatio(sector.currentRatio)}</td>
                    <td>{formatRatio(sector.baselineRatio)}</td>
                    <td>{formatDelta(sector.deltaPercentagePoints)}</td>
                    <td>{sector.state === "DEGRADED" ? text.coverageV2Degraded : sector.state === "IMPROVED" ? text.coverageV2Improved : text.coverageV2Stable}</td>
                  </tr>)}</tbody>
                </table>
              </div> : null}
              <p className={styles.note}>{data.intelligenceV2.health.reasons.length ? data.intelligenceV2.health.reasons.map((reason) => reason === "coverage_v2.overall_capture_below_baseline" ? text.coverageV2ReasonOverall : reason === "coverage_v2.sector_degradation" ? text.coverageV2ReasonSector : text.coverageV2ReasonBaseline).join(" · ") : text.coverageV2NoIssues}</p>
            </section>

            <section className={styles.section} aria-labelledby="receiver-trend-title" data-testid="receiver-coverage-intelligence-v1">
              <div className={styles.sectionHeader}>
                <div><h3 id="receiver-trend-title">{text.trendTitle}</h3><p>{text.trendDescription}</p></div>
              </div>
              {data.intelligence.trend.recentDays.length ? <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead><tr><th>{text.trendDate}</th><th>{text.trendMedianRange}</th><th>{text.trendMaxRange}</th><th>{text.trendSectors}</th><th>{text.trendUniqueAircraft}</th><th>{text.trendMessages}</th></tr></thead>
                  <tbody>{data.intelligence.trend.recentDays.map((point) => <tr key={point.date}>
                    <th>{point.date}{point.complete ? "" : ` · ${text.trendCurrent}`}</th>
                    <td>{formatDistance(point.medianSectorRangeKm)}</td>
                    <td>{formatDistance(point.maxDistanceKm)}</td>
                    <td>{formatNumber(point.populatedSectors)} / 36</td>
                    <td>{formatNumber(point.uniqueAircraft)}</td>
                    <td>{point.receiverMessages === null ? "—" : formatNumber(point.receiverMessages)}</td>
                  </tr>)}</tbody>
                </table>
              </div> : <p className={styles.status}>{text.noData}</p>}
              <p className={styles.note}>
                <strong>{text.trendHealthReasons}:</strong>{" "}
                {data.intelligence.health.reasons.length ? data.intelligence.health.reasons.map(healthReasonLabel).join(" · ") : text.trendNoHealthReasons}
              </p>
            </section>

            <section className={styles.section} aria-labelledby="coverage-reliability-title">
              <div className={styles.sectionHeader}>
                <div><h3 id="coverage-reliability-title">{text.coverageTitle}</h3><p>{text.coverageDescription}</p></div>
              </div>
              {populatedSectors.length ? <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead><tr><th>{text.sector}</th><th>{text.days}</th><th>{text.median}</th><th>{text.p95}</th><th>{text.p99}</th><th>{text.maximum}</th></tr></thead>
                  <tbody>{populatedSectors.map((sector) => <tr key={sector.bearingFrom} className={sector.reliable ? styles.reliable : undefined}>
                    <th>{sectorLabel(sector)}</th>
                    <td>{`${sector.observedDays}/${data.coverage.periodDays}`}</td>
                    <td>{formatDistance(sector.medianDailyMaxDistanceKm)}</td>
                    <td><strong>{formatDistance(sector.p95DailyMaxDistanceKm)}</strong></td>
                    <td>{formatDistance(sector.p99DailyMaxDistanceKm)}</td>
                    <td>{formatDistance(sector.maxDistanceKm)}</td>
                  </tr>)}</tbody>
                </table>
              </div> : <p className={styles.status}>{text.noData}</p>}
              <p className={styles.note}>{text.methodNote}</p>
            </section>

            <section className={styles.section} aria-labelledby="coverage-altitude-title">
              <div className={styles.sectionHeader}>
                <div><h3 id="coverage-altitude-title">{text.altitudeCoverageTitle}</h3><p>{text.altitudeCoverageDescription}</p></div>
              </div>
              <div className={styles.altitudeBands}>
                {data.altitudeCoverage.bands.map((band) => {
                  const maxP95 = Math.max(...band.sectors.map((sector) => sector.p95DailyMaxDistanceKm ?? 0), 0);
                  return <div className={styles.altitudeBand} key={band.id}>
                    <div className={styles.altitudeBandHeader}>
                      <strong>{altitudeBandLabel(band)}</strong>
                      <span>{band.observedDays} {text.altitudeObservedDays} · {formatDistance(band.maxDistanceKm)}</span>
                    </div>
                    <div className={styles.azimuthStrip} role="img" aria-label={`${altitudeBandLabel(band)} · ${text.altitudeDirectionHint}`}>
                      {band.sectors.map((sector) => {
                        const value = sector.p95DailyMaxDistanceKm;
                        const opacity = value !== null && maxP95 > 0 ? Math.max(0.16, value / maxP95) : 0.05;
                        return <span
                          key={sector.bearingFrom}
                          className={styles.azimuthCell}
                          style={{ opacity }}
                          title={`${sectorLabel(sector)} · P95 ${formatDistance(value)} · ${sector.observedDays} d`}
                        />;
                      })}
                    </div>
                  </div>;
                })}
              </div>
              <p className={styles.note}>{text.altitudeDirectionHint}</p>
            </section>

            <section className={styles.section} aria-labelledby="coverage-hourly-title">
              <div className={styles.sectionHeader}><div><h3 id="coverage-hourly-title">{text.hourlyTitle}</h3><p>{text.hourlyDescription}</p></div></div>
              {!data.hourly.complete ? <p className={styles.status}>{text.incompleteHourly}</p> : data.hourly.bins.length ? <div className={styles.hourChart} role="img" aria-label={text.hourlyTitle}>
                {data.hourly.bins.map((item) => <div className={styles.hourColumn} key={item.hour} title={`${String(item.hour).padStart(2, "0")}:00 · ${formatNumber(item.count)}`}>
                  <div className={styles.hourBarTrack}><span className={styles.hourBar} style={{ height: `${Math.max(2, (item.count / maxHourlyCount) * 100)}%` }} /></div>
                  <strong>{String(item.hour).padStart(2, "0")}</strong>
                  <small>{formatNumber(item.count)}</small>
                </div>)}
              </div> : <p className={styles.status}>{text.noData}</p>}
            </section>

            {(data.records.highestFlight || data.records.farthestReception || data.records.fastestAircraft) && <section className={`${styles.section} ${styles.records}`}>
              {data.records.highestFlight && <div>
                <span>{text.highestFlight}</span>
                <strong><Link href={`/flights/${data.records.highestFlight.flightId}`}>{data.records.highestFlight.callsign ?? data.records.highestFlight.icaoHex}</Link> · {formatNumber(data.records.highestFlight.maxAltitudeFt)} ft</strong>
                <small>{data.records.highestFlight.registration ?? data.records.highestFlight.icaoHex} · {formatDateTime(data.records.highestFlight.observedAt)}</small>
              </div>}
              {data.records.farthestReception && <div>
                <span>{text.farthestReception}</span>
                <strong><Link href={`/aircraft/${encodeURIComponent(data.records.farthestReception.icaoHex)}`}>{data.records.farthestReception.icaoHex}</Link> · {formatDistance(data.records.farthestReception.distanceKm)}</strong>
                <small>{formatTrack(data.records.farthestReception.bearing)} · {formatDateTime(data.records.farthestReception.recordedAt)}</small>
              </div>}
              {data.records.fastestAircraft && <div>
                <span>{text.fastestAircraft}</span>
                <strong><Link href={`/aircraft/${encodeURIComponent(data.records.fastestAircraft.icaoHex)}`}>{data.records.fastestAircraft.callsign ?? data.records.fastestAircraft.icaoHex}</Link> · {formatNumber(data.records.fastestAircraft.speedKt)} kt</strong>
                <small>{data.records.fastestAircraft.registration ?? data.records.fastestAircraft.icaoHex} · {formatDateTime(data.records.fastestAircraft.recordedAt)}</small>
              </div>}
            </section>}
            <p className={styles.note}>{text.messageNote} {text.fastestNote}</p>
          </div>
        </> : null}
      </section>
    </div>
  );
}
