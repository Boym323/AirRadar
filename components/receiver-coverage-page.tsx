"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PublicStateSnapshot } from "@/lib/aircraft/types";
import { formatDistance, formatNumber, formatTrack } from "@/lib/i18n";
import type { CoveragePeriod, CoverageResponse } from "@/lib/server/receiver-coverage-analytics";
import type { CoverageIntelligenceRange, CoverageIntelligenceResponse } from "@/lib/statistics-coverage-intelligence";
import { ReceiverCoveragePolar } from "@/components/receiver-coverage-polar";
import { ReceiverRangePolar } from "@/components/receiver-range-polar";
import {
  EmptyState,
  MetricCard,
  MetricStrip,
  PageHeader,
  Panel,
  SectionHeader,
} from "@/components/ui-primitives";
import styles from "./receiver-explorer.module.css";

const historyRanges: CoverageIntelligenceRange[] = ["7d", "30d"];
const capturePeriods: CoveragePeriod[] = ["live", "today", "7d", "30d"];

function sectorLabel(from: number, to: number): string {
  return `${String(from).padStart(3, "0")}°–${String(to).padStart(3, "0")}°`;
}

function percent(value: number | null, digits = 1): string {
  return value === null ? "—" : `${formatNumber(value * 100, digits)} %`;
}

function delta(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${formatNumber(value, 1)} pp`;
}

function altitudeLabel(minFt: number, maxFt: number | null): string {
  return maxFt === null
    ? `${formatNumber(minFt)}+ ft`
    : `${formatNumber(minFt)}–${formatNumber(maxFt)} ft`;
}

function liveSourceCounts(snapshot: PublicStateSnapshot | null) {
  const counts = { adsb: 0, mlat: 0, modes: 0, other: 0 };
  for (const aircraft of snapshot?.aircraft ?? []) {
    if (aircraft.source === "ADS-B") counts.adsb += 1;
    else if (aircraft.source === "MLAT") counts.mlat += 1;
    else if (aircraft.source === "Mode-S" || aircraft.source === "TIS-B") counts.modes += 1;
    else counts.other += 1;
  }
  return counts;
}

export default function ReceiverCoveragePage() {
  const [range, setRange] = useState<CoverageIntelligenceRange>("30d");
  const [capturePeriod, setCapturePeriod] = useState<CoveragePeriod>("live");
  const [intelligence, setIntelligence] = useState<CoverageIntelligenceResponse | null>(null);
  const [capture, setCapture] = useState<CoverageResponse | null>(null);
  const [snapshot, setSnapshot] = useState<PublicStateSnapshot | null>(null);
  const [intelligenceFailed, setIntelligenceFailed] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setIntelligence(null);
    setIntelligenceFailed(false);
    void fetch(`/api/statistics/coverage-intelligence?range=${range}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("coverage intelligence unavailable");
        return await response.json() as CoverageIntelligenceResponse;
      })
      .then((value) => {
        if (!controller.signal.aborted) setIntelligence(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setIntelligenceFailed(true);
      });
    return () => controller.abort();
  }, [range]);

  useEffect(() => {
    const controller = new AbortController();
    setCapture(null);
    setCaptureFailed(false);
    void fetch(`/api/receiver/coverage?period=${capturePeriod}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("receiver coverage unavailable");
        return await response.json() as CoverageResponse;
      })
      .then((value) => {
        if (!controller.signal.aborted) setCapture(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCaptureFailed(true);
      });
    return () => controller.abort();
  }, [capturePeriod]);

  useEffect(() => {
    let active = true;
    const source = new EventSource("/api/stream?coverage=local");
    source.addEventListener("snapshot", (event) => {
      try {
        const value = JSON.parse((event as MessageEvent<string>).data) as PublicStateSnapshot;
        if (active) {
          setSnapshot(value);
          setStreamConnected(true);
        }
      } catch {
        if (active) setStreamConnected(false);
      }
    });
    source.onopen = () => { if (active) setStreamConnected(true); };
    source.onerror = () => { if (active) setStreamConnected(false); };
    return () => {
      active = false;
      source.close();
    };
  }, []);

  const sourceCounts = useMemo(() => liveSourceCounts(snapshot), [snapshot]);
  const totalSources = sourceCounts.adsb + sourceCounts.mlat + sourceCounts.modes + sourceCounts.other;

  const weakSectors = useMemo(
    () => (intelligence?.intelligenceV2.sectors ?? [])
      .filter((sector) => sector.state === "DEGRADED")
      .sort((a, b) => (a.deltaPercentagePoints ?? 0) - (b.deltaPercentagePoints ?? 0)),
    [intelligence],
  );

  const improvedSectors = useMemo(
    () => (intelligence?.intelligenceV2.sectors ?? [])
      .filter((sector) => sector.state === "IMPROVED")
      .sort((a, b) => (b.deltaPercentagePoints ?? 0) - (a.deltaPercentagePoints ?? 0)),
    [intelligence],
  );

  const bestDirections = useMemo(
    () => [...(intelligence?.coverage.sectors ?? [])]
      .filter((sector) => sector.maxDistanceKm !== null)
      .sort((a, b) => (b.maxDistanceKm ?? 0) - (a.maxDistanceKm ?? 0))
      .slice(0, 8),
    [intelligence],
  );

  const trendMax = useMemo(
    () => Math.max(...(intelligence?.intelligence.trend.recentDays.map((day) => day.maxDistanceKm ?? 0) ?? []), 1),
    [intelligence],
  );

  return (
    <main className={styles.page} data-testid="receiver-explorer-v2">
      <PageHeader
        kicker="AIRRADAR / RECEIVER"
        title="Receiver Explorer V2"
        description="Directional range, altitude coverage, receiver trend, weak sectors and live ADS-B / MLAT source mix built from existing AirRadar receiver aggregates."
        actions={
          <div className={styles.headerActions}>
            <Link className={styles.headerLink} href="/statistics">Statistics</Link>
            <Link className={styles.headerLink} href="/">Radar</Link>
          </div>
        }
      />

      <Panel className={styles.panel} data-testid="receiver-explorer-summary">
        <SectionHeader
          kicker="RANGE ANALYTICS"
          title="Receiver range overview"
          description="Historical values use daily receiver maxima. P95 is preferred for stable directional range; maximum is a record, not a typical range."
          actions={
            <div className={styles.controls} role="tablist" aria-label="Receiver Explorer history period">
              <span className={styles.controlLabel}>History</span>
              {historyRanges.map((item) => (
                <button
                  className={styles.controlButton}
                  data-active={range === item ? "true" : "false"}
                  aria-selected={range === item}
                  role="tab"
                  type="button"
                  key={item}
                  onClick={() => setRange(item)}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
          }
        />

        {intelligenceFailed || intelligence?.source === "unavailable" ? (
          <EmptyState
            title="Historical receiver analytics unavailable"
            description="The Explorer keeps live source telemetry available, but PostgreSQL-backed 7/30-day range analytics cannot be loaded."
          />
        ) : !intelligence ? (
          <p className={styles.status}>Loading receiver history…</p>
        ) : (
          <MetricStrip className={styles.metrics}>
            <MetricCard
              value={intelligence.coverage.bestReliableP95 ? formatDistance(intelligence.coverage.bestReliableP95.distanceKm) : "—"}
              label="Best reliable P95"
              detail={intelligence.coverage.bestReliableP95 ? sectorLabel(intelligence.coverage.bestReliableP95.bearingFrom, intelligence.coverage.bestReliableP95.bearingTo) : undefined}
            />
            <MetricCard
              value={`${intelligence.coverage.reliableSectors} / 36`}
              label="Reliable sectors"
              detail={`≥ ${intelligence.coverage.requiredReliableDays} observed days`}
            />
            <MetricCard
              value={intelligence.records.farthestReception ? formatDistance(intelligence.records.farthestReception.distanceKm) : "—"}
              label="Period record"
              detail={intelligence.records.farthestReception ? `${formatTrack(intelligence.records.farthestReception.bearing)} · ${intelligence.records.farthestReception.registration ?? intelligence.records.farthestReception.icaoHex}` : undefined}
            />
            <MetricCard
              value={intelligence.intelligenceV2.health.state.replaceAll("_", " ")}
              label="Capture health"
              detail={`24 h ${percent(intelligence.intelligenceV2.health.currentRatio)} · Δ ${delta(intelligence.intelligenceV2.health.deltaPercentagePoints)}`}
            />
          </MetricStrip>
        )}
      </Panel>

      <div className={styles.grid}>
        <Panel className={`${styles.panel} ${styles.full}`} data-testid="receiver-explorer-range-polar">
          <SectionHeader
            kicker="DIRECTIONAL PROFILE"
            title="Median / P95 / maximum range by azimuth"
            description="Thirty-six 10° sectors. Median shows the normal daily maximum, P95 the strong repeatable edge, and maximum the period record."
          />
          {intelligence?.source === "postgres" ? (
            <ReceiverRangePolar sectors={intelligence.coverage.sectors} periodDays={intelligence.coverage.periodDays} />
          ) : (
            <EmptyState title="No directional range data" description="Historical receiver coverage has not produced a usable sector profile yet." />
          )}
        </Panel>

        <Panel className={styles.panel} data-testid="receiver-explorer-source-mix">
          <SectionHeader
            kicker="LIVE SOURCE MIX"
            title="ADS-B / MLAT telemetry"
            description="Current local receiver snapshot only; this is not a historical source-distribution metric."
          />
          <div className={styles.healthRow}>
            <span className={styles.healthBadge} data-state={streamConnected ? "GOOD" : "INSUFFICIENT_DATA"}>
              {streamConnected ? "LIVE" : "RECONNECTING"}
            </span>
            <span className={styles.delta}>{formatNumber(totalSources)} positioned / tracked aircraft in current local snapshot</span>
          </div>
          <div className={styles.sourceMix}>
            {[
              ["ADS-B", sourceCounts.adsb],
              ["MLAT", sourceCounts.mlat],
              ["Mode-S / TIS-B", sourceCounts.modes],
              ["Other / unknown", sourceCounts.other],
            ].map(([label, value]) => (
              <div className={styles.sourceItem} key={String(label)}>
                <strong>{formatNumber(Number(value))}</strong>
                <span>{label}{totalSources ? ` · ${formatNumber(Number(value) / totalSources * 100, 1)} %` : ""}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className={styles.panel} data-testid="receiver-explorer-weak-sectors">
          <SectionHeader
            kicker="SECTOR HEALTH"
            title="Weak and improving sectors"
            description="Rolling 24 h network-reference capture compared with the previous 7-day hourly baseline."
          />
          {intelligence ? (
            <>
              <div className={styles.healthRow}>
                <span className={styles.healthBadge} data-state={intelligence.intelligenceV2.health.state}>
                  {intelligence.intelligenceV2.health.state.replaceAll("_", " ")}
                </span>
                <span className={styles.delta}>
                  {intelligence.intelligenceV2.health.degradedSectors} degraded · {intelligence.intelligenceV2.health.improvedSectors} improved
                </span>
              </div>
              {weakSectors.length || improvedSectors.length ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Sector</th><th>24 h</th><th>Baseline</th><th>Δ</th><th>State</th></tr></thead>
                    <tbody>
                      {[...weakSectors, ...improvedSectors].slice(0, 12).map((sector) => (
                        <tr key={sector.bearingFrom} className={sector.state === "DEGRADED" ? styles.weakRow : styles.improvedRow}>
                          <th>{sectorLabel(sector.bearingFrom, sector.bearingTo)}</th>
                          <td>{percent(sector.currentRatio)}</td>
                          <td>{percent(sector.baselineRatio)}</td>
                          <td>{delta(sector.deltaPercentagePoints)}</td>
                          <td>{sector.state}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No directional degradation detected" description="No evaluated sector currently meets the conservative degraded/improved thresholds." />
              )}
            </>
          ) : (
            <p className={styles.status}>Loading sector health…</p>
          )}
        </Panel>

        <Panel className={`${styles.panel} ${styles.full}`} data-testid="receiver-explorer-altitude">
          <SectionHeader
            kicker="ALTITUDE PROFILE"
            title="Directional range by altitude band"
            description="P95 daily maximum distance in each 10° sector. Brighter cells indicate stronger directional reach within the altitude band."
          />
          {intelligence?.altitudeCoverage.bands.length ? (
            <div className={styles.altitudeBands}>
              {intelligence.altitudeCoverage.bands.map((band) => {
                const max = Math.max(...band.sectors.map((sector) => sector.p95DailyMaxDistanceKm ?? 0), 1);
                return (
                  <div className={styles.altitudeBand} key={band.id}>
                    <div className={styles.altitudeHeader}>
                      <strong>{altitudeLabel(band.minFt, band.maxFt)}</strong>
                      <span>{band.observedDays} observed days · record {formatDistance(band.maxDistanceKm)}</span>
                    </div>
                    <div className={styles.azimuthStrip} role="img" aria-label={`Directional altitude coverage ${altitudeLabel(band.minFt, band.maxFt)}`}>
                      {band.sectors.map((sector) => (
                        <span
                          className={styles.azimuthCell}
                          key={sector.bearingFrom}
                          style={{ opacity: sector.p95DailyMaxDistanceKm === null ? 0.05 : Math.max(0.12, sector.p95DailyMaxDistanceKm / max) }}
                          title={`${sectorLabel(sector.bearingFrom, sector.bearingTo)} · P95 ${formatDistance(sector.p95DailyMaxDistanceKm)} · max ${formatDistance(sector.maxDistanceKm)}`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No altitude coverage" description="Altitude-banded receiver maxima are not available for this period." />
          )}
        </Panel>

        <Panel className={styles.panel} data-testid="receiver-explorer-trend">
          <SectionHeader
            kicker="7 / 30 DAY TREND"
            title="Daily receiver reach"
            description="Median directional range and maximum reception distance by day."
          />
          {intelligence?.intelligence.trend.recentDays.length ? (
            <div className={styles.trendBars}>
              {intelligence.intelligence.trend.recentDays.map((day) => (
                <div className={styles.trendRow} key={day.date}>
                  <strong>{day.date.slice(5)}</strong>
                  <div className={styles.trendTrack} title={`Maximum ${formatDistance(day.maxDistanceKm)}`}>
                    <div className={styles.trendFill} style={{ width: `${Math.max(2, (day.maxDistanceKm ?? 0) / trendMax * 100)}%` }} />
                  </div>
                  <span>{formatDistance(day.medianSectorRangeKm)}</span>
                  <span>{formatDistance(day.maxDistanceKm)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No daily trend" description="Not enough daily receiver aggregates are available for this range." />
          )}
        </Panel>

        <Panel className={styles.panel} data-testid="receiver-explorer-records">
          <SectionHeader
            kicker="DIRECTIONAL RECORDS"
            title="Best azimuth sectors"
            description="Top period maxima by 10° sector, with median and P95 context so one-off records are not mistaken for typical reach."
          />
          {bestDirections.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Sector</th><th>Median</th><th>P95</th><th>Record</th></tr></thead>
                <tbody>
                  {bestDirections.map((sector) => (
                    <tr key={sector.bearingFrom}>
                      <th>{sectorLabel(sector.bearingFrom, sector.bearingTo)}</th>
                      <td>{formatDistance(sector.medianDailyMaxDistanceKm)}</td>
                      <td>{formatDistance(sector.p95DailyMaxDistanceKm)}</td>
                      <td><strong>{formatDistance(sector.maxDistanceKm)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No directional records" description="No historical azimuth maxima are available yet." />
          )}
        </Panel>

        <Panel className={`${styles.panel} ${styles.full}`} data-testid="receiver-explorer-reference-capture">
          <SectionHeader
            kicker="NETWORK REFERENCE"
            title="Reference capture polar"
            description="Existing capture-ratio diagnostic: local receiver captures divided by eligible network-reference observations. This is not antenna efficiency."
            actions={
              <div className={styles.controls} role="tablist" aria-label="Reference capture period">
                {capturePeriods.map((item) => (
                  <button
                    className={styles.controlButton}
                    data-active={capturePeriod === item ? "true" : "false"}
                    aria-selected={capturePeriod === item}
                    role="tab"
                    type="button"
                    key={item}
                    onClick={() => setCapturePeriod(item)}
                  >
                    {item.toUpperCase()}
                  </button>
                ))}
              </div>
            }
          />
          {captureFailed ? (
            <EmptyState title="Reference capture unavailable" description="The network-reference coverage endpoint is temporarily unavailable." />
          ) : capture ? (
            <>
              <p className={styles.referenceNote}>
                {formatNumber(capture.summary.captured)} / {formatNumber(capture.summary.available)} eligible observations captured · radius {formatNumber(capture.comparisonRadiusNm)} NM · reference {capture.metadata.referenceProviders.join(", ") || "none"}
              </p>
              <ReceiverCoveragePolar data={capture} />
            </>
          ) : (
            <p className={styles.status}>Loading reference capture…</p>
          )}
        </Panel>
      </div>
    </main>
  );
}
