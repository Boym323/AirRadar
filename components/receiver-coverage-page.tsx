"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PublicStateSnapshot } from "@/lib/aircraft/types";
import { formatDistance, formatNumber, formatTrack, t } from "@/lib/i18n";
import { receiverExplorerCopy } from "@/lib/i18n/receiver-explorer";
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

function healthStateLabel(state: string): string {
  switch (state) {
    case "GOOD": return receiverExplorerCopy(t.locale).good;
    case "IMPROVED": return receiverExplorerCopy(t.locale).better;
    case "DEGRADED": return receiverExplorerCopy(t.locale).worse;
    case "INSUFFICIENT_DATA": return receiverExplorerCopy(t.locale).insufficientHealth;
    default: return receiverExplorerCopy(t.locale).unknown;
  }
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
  const copy = receiverExplorerCopy(t.locale);
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
        kicker={copy.headerKicker}
        title={copy.headerTitle}
        description={copy.headerDescription}
        actions={
          <div className={styles.headerActions}>
            <Link className={styles.headerLink} href="/statistics">{copy.statistics}</Link>
            <Link className={styles.headerLink} href="/">Radar</Link>
          </div>
        }
      />

      <Panel className={styles.panel} data-testid="receiver-explorer-summary">
        <SectionHeader
          kicker={copy.rangeKicker}
          title={copy.rangeTitle}
          description={copy.rangeDescription}
          actions={
            <div className={styles.controls} role="tablist" aria-label={copy.historyPeriod}>
              <span className={styles.controlLabel}>{copy.history}</span>
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
            title={copy.historyUnavailable}
            description={copy.historyUnavailableDescription}
          />
        ) : !intelligence ? (
          <p className={styles.status}>{copy.loadingHistory}</p>
        ) : (
          <MetricStrip className={styles.metrics}>
            <MetricCard
              value={intelligence.coverage.bestReliableP95 ? formatDistance(intelligence.coverage.bestReliableP95.distanceKm) : "—"}
              label={copy.bestP95}
              detail={intelligence.coverage.bestReliableP95 ? sectorLabel(intelligence.coverage.bestReliableP95.bearingFrom, intelligence.coverage.bestReliableP95.bearingTo) : undefined}
            />
            <MetricCard
              value={`${intelligence.coverage.reliableSectors} / 36`}
              label={copy.reliableSectors}
              detail={`≥ ${intelligence.coverage.requiredReliableDays} ${copy.observedDays}`}
            />
            <MetricCard
              value={intelligence.records.farthestReception ? formatDistance(intelligence.records.farthestReception.distanceKm) : "—"}
              label={copy.periodRecord}
              detail={intelligence.records.farthestReception ? `${formatTrack(intelligence.records.farthestReception.bearing)} · ${intelligence.records.farthestReception.registration ?? intelligence.records.farthestReception.icaoHex}` : undefined}
            />
            <MetricCard
              value={healthStateLabel(intelligence.intelligenceV2.health.state)}
              label={copy.captureQuality}
              detail={`24 h ${percent(intelligence.intelligenceV2.health.currentRatio)} · Δ ${delta(intelligence.intelligenceV2.health.deltaPercentagePoints)}`}
            />
          </MetricStrip>
        )}
      </Panel>

      <div className={styles.grid}>
        <Panel className={`${styles.panel} ${styles.full}`} data-testid="receiver-explorer-range-polar">
          <SectionHeader
            kicker={copy.profileKicker}
            title={copy.profileTitle}
            description={copy.profileDescription}
          />
          {intelligence?.source === "postgres" ? (
            <ReceiverRangePolar sectors={intelligence.coverage.sectors} periodDays={intelligence.coverage.periodDays} />
          ) : (
            <EmptyState title={copy.profileEmpty} description={copy.profileEmptyDescription} />
          )}
        </Panel>

        <Panel className={styles.panel} data-testid="receiver-explorer-source-mix">
          <SectionHeader
            kicker={copy.sourceKicker}
            title={copy.sourceTitle}
            description={copy.sourceDescription}
          />
          <div className={styles.healthRow}>
            <span className={styles.healthBadge} data-state={streamConnected ? "GOOD" : "INSUFFICIENT_DATA"}>
              {streamConnected ? copy.live : copy.connecting}
            </span>
            <span className={styles.delta}>{formatNumber(totalSources)} {t.locale.startsWith("cs") ? "letadel se známou polohou nebo sledovaných v aktuálním lokálním přehledu" : "positioned or tracked aircraft in the current local view"}</span>
          </div>
          <div className={styles.sourceMix}>
            {[
              ["ADS-B", sourceCounts.adsb],
              ["MLAT", sourceCounts.mlat],
              ["Mode-S / TIS-B", sourceCounts.modes],
              [copy.otherSource, sourceCounts.other],
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
            kicker={copy.sectorKicker}
            title={copy.sectorTitle}
            description={copy.sectorDescription}
          />
          {intelligence ? (
            <>
              <div className={styles.healthRow}>
                <span className={styles.healthBadge} data-state={intelligence.intelligenceV2.health.state}>
                  {healthStateLabel(intelligence.intelligenceV2.health.state)}
                </span>
                <span className={styles.delta}>
                  {intelligence.intelligenceV2.health.degradedSectors} {copy.degraded} · {intelligence.intelligenceV2.health.improvedSectors} {copy.improved}
                </span>
              </div>
              {weakSectors.length || improvedSectors.length ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>{copy.sector}</th><th>24 h</th><th>{copy.referenceState}</th><th>Δ</th><th>{copy.state}</th></tr></thead>
                    <tbody>
                      {[...weakSectors, ...improvedSectors].slice(0, 12).map((sector) => (
                        <tr key={sector.bearingFrom} className={sector.state === "DEGRADED" ? styles.weakRow : styles.improvedRow}>
                          <th>{sectorLabel(sector.bearingFrom, sector.bearingTo)}</th>
                          <td>{percent(sector.currentRatio)}</td>
                          <td>{percent(sector.baselineRatio)}</td>
                          <td>{delta(sector.deltaPercentagePoints)}</td>
                          <td>{healthStateLabel(sector.state)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title={copy.sectorNone} description={copy.sectorNoneDescription} />
              )}
            </>
          ) : (
            <p className={styles.status}>{copy.sectorLoading}</p>
          )}
        </Panel>

        <Panel className={`${styles.panel} ${styles.full}`} data-testid="receiver-explorer-altitude">
          <SectionHeader
            kicker={copy.altitudeKicker}
            title={copy.altitudeTitle}
            description={copy.altitudeDescription}
          />
          {intelligence?.altitudeCoverage.bands.length ? (
            <div className={styles.altitudeBands}>
              {intelligence.altitudeCoverage.bands.map((band) => {
                const max = Math.max(...band.sectors.map((sector) => sector.p95DailyMaxDistanceKm ?? 0), 1);
                return (
                  <div className={styles.altitudeBand} key={band.id}>
                    <div className={styles.altitudeHeader}>
                      <strong>{altitudeLabel(band.minFt, band.maxFt)}</strong>
                      <span>{band.observedDays} {copy.observedDays} · {copy.record.toLowerCase()} {formatDistance(band.maxDistanceKm)}</span>
                    </div>
                    <div className={styles.azimuthStrip} role="img" aria-label={`${copy.altitudeRange} ${altitudeLabel(band.minFt, band.maxFt)}`}>
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
            <EmptyState title={copy.altitudeEmpty} description={copy.altitudeEmptyDescription} />
          )}
        </Panel>

        <Panel className={styles.panel} data-testid="receiver-explorer-trend">
          <SectionHeader
            kicker={copy.trendKicker}
            title={copy.trendTitle}
            description={copy.trendDescription}
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
            <EmptyState title={copy.trendEmpty} description={copy.trendEmptyDescription} />
          )}
        </Panel>

        <Panel className={styles.panel} data-testid="receiver-explorer-records">
          <SectionHeader
            kicker={copy.recordsKicker}
            title={copy.recordsTitle}
            description={copy.recordsDescription}
          />
          {bestDirections.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>{copy.sector}</th><th>{copy.median}</th><th>P95</th><th>{copy.record}</th></tr></thead>
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
            <EmptyState title={copy.recordsEmpty} description={copy.recordsEmptyDescription} />
          )}
        </Panel>

        <Panel className={`${styles.panel} ${styles.full}`} data-testid="receiver-explorer-reference-capture">
          <SectionHeader
            kicker={copy.referenceKicker}
            title={copy.referenceTitle}
            description={copy.referenceDescription}
            actions={
              <div className={styles.controls} role="tablist" aria-label={copy.referencePeriod}>
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
                    {item === "live" ? copy.live : item === "today" ? copy.today : item.toUpperCase()}
                  </button>
                ))}
              </div>
            }
          />
          {captureFailed ? (
            <EmptyState title={copy.referenceUnavailable} description={copy.referenceUnavailableDescription} />
          ) : capture ? (
            <>
              <p className={styles.referenceNote}>
                {formatNumber(capture.summary.captured)} / {formatNumber(capture.summary.available)} {t.locale.startsWith("cs") ? "použitelných pozorování zachyceno · poloměr" : "usable observations captured · radius"} {formatNumber(capture.comparisonRadiusNm)} NM · {t.locale.startsWith("cs") ? "referenční zdroje" : "reference providers"} {capture.metadata.referenceProviders.join(", ") || copy.noProviders}
              </p>
              <ReceiverCoveragePolar data={capture} />
            </>
          ) : (
            <p className={styles.status}>{copy.referenceLoading}</p>
          )}
        </Panel>
      </div>
    </main>
  );
}
