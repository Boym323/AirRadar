"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  OperationalTwinEventOutcomeReport,
  OperationalTwinOutcomeReport,
  OperationalTwinTruthFirstReport,
  OperationalTwinWindTimingGraduationReport,
  RegionalAttentionOutcomeReport,
} from "@/lib/operational-twin";
import { StatusBadge } from "@/components/ui-primitives";
import styles from "./digital-twin-calibration-center.module.css";

type PersistenceStatus = {
  storage: string;
  loaded: boolean;
  databaseAvailable: boolean;
  hydratedOutcomeBuckets: number;
  hydratedEventOutcomeBuckets: number;
  hydratedRegionalAttentionOutcomeBuckets: number;
  trackedPersistedBuckets: number;
  rowsWritten: number;
  rowsDeleted: number;
  loadFailures: number;
  flushFailures: number;
  lastLoadAt: string | null;
  lastFlushAt: string | null;
};

type CalibrationCenterReport = {
  version: "digital-twin-calibration-center-v1";
  generatedAt: string;
  corridor: OperationalTwinOutcomeReport;
  event: OperationalTwinEventOutcomeReport;
  truthFirst: OperationalTwinTruthFirstReport;
  windTiming: OperationalTwinWindTimingGraduationReport;
  regionalAttention: RegionalAttentionOutcomeReport;
  persistence: PersistenceStatus;
};

type LoadState = "loading" | "ready" | "unauthorized" | "error";

function decisionVariant(decision: "PASS" | "WAIT" | "FAIL") {
  return decision === "PASS" ? "live" : decision === "FAIL" ? "danger" : "warning";
}

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function number(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits);
}

function seconds(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} s`;
}

function timestamp(value: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <span className={styles.metric}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function DecisionHeader({
  title,
  decision,
  reasons,
}: {
  title: string;
  decision: "PASS" | "WAIT" | "FAIL";
  reasons: readonly string[];
}) {
  return (
    <div className={styles.cardHeader}>
      <div>
        <h2>{title}</h2>
        <small>{reasons.length ? reasons.join(" · ") : "thresholds satisfied"}</small>
      </div>
      <StatusBadge variant={decisionVariant(decision)}>{decision}</StatusBadge>
    </div>
  );
}

export function DigitalTwinCalibrationCenter() {
  const [report, setReport] = useState<CalibrationCenterReport | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const reload = useCallback(async () => {
    setState((current) => current === "ready" ? current : "loading");
    try {
      const response = await fetch("/api/admin/operational-twin/calibration", { cache: "no-store" });
      if (response.status === 401) {
        setReport(null);
        setState("unauthorized");
        return;
      }
      if (!response.ok) throw new Error(`Calibration Center request failed: ${response.status}`);
      setReport(await response.json() as CalibrationCenterReport);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (state === "unauthorized") {
    return (
      <main className="history-page" data-testid="digital-twin-calibration-center">
        <header className="history-page-header">
          <div>
            <h1>Digital Twin Calibration Center</h1>
            <p className="statistics-subtitle">Administrative calibration and readiness diagnostics.</p>
          </div>
        </header>
        <section className="statistics-card">
          <h2>Admin session required</h2>
          <p>Sign in through Watchlist administration, then return to this page.</p>
          <Link className="primary-button" href="/watchlist">Open Watchlist sign-in</Link>
        </section>
      </main>
    );
  }

  return (
    <main
      className="history-page"
      data-testid="digital-twin-calibration-center"
      aria-busy={state === "loading"}
    >
      <header className="history-page-header">
        <div>
          <h1>Digital Twin Calibration Center</h1>
          <p className="statistics-subtitle">
            Outcome quality, truth-first recall, graduation evidence and persistence health.
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void reload()}>
          Refresh
        </button>
      </header>

      {state === "loading" && !report ? <p>Loading calibration evidence…</p> : null}
      {state === "error" ? <p role="alert">Calibration diagnostics are temporarily unavailable.</p> : null}

      {report ? (
        <>
          <div className={styles.summary}>
            <Metric label="Generated" value={timestamp(report.generatedAt)} />
            <Metric label="Persistence" value={report.persistence.databaseAvailable ? "PostgreSQL" : "Unavailable"} />
            <Metric label="Persisted buckets" value={report.persistence.trackedPersistedBuckets} />
            <Metric
              label="Persistence failures"
              value={report.persistence.loadFailures + report.persistence.flushFailures}
            />
          </div>

          <div className={styles.grid}>
            <section className="statistics-card" data-testid="calibration-corridor-outcome">
              <DecisionHeader
                title="Corridor outcome"
                decision={report.corridor.decision}
                reasons={report.corridor.reasons}
              />
              <div className={styles.metrics}>
                <Metric label="Samples" value={report.corridor.overall.samples} />
                <Metric label="Uncertainty coverage" value={pct(report.corridor.overall.uncertaintyCoverage)} />
                <Metric
                  label="Error / uncertainty"
                  value={number(report.corridor.overall.meanErrorToUncertaintyRatio, 2)}
                />
                <Metric label="Expired truth" value={pct(report.corridor.expiredTruthRate)} />
              </div>
              <small>LOCAL receiver truth · 5 / 15 / 30 min horizons</small>
            </section>

            <section className="statistics-card" data-testid="calibration-event-outcome">
              <DecisionHeader
                title="Event outcome"
                decision={report.event.decision}
                reasons={report.event.reasons}
              />
              <div className={styles.metrics}>
                <Metric label="Predictions" value={report.event.overall.predictions} />
                <Metric label="Scoreable" value={report.event.overall.scoreable} />
                <Metric label="Precision" value={pct(report.event.overall.precision)} />
                <Metric label="Timing MAE" value={seconds(report.event.overall.meanAbsoluteTimingErrorSeconds)} />
              </div>
              <small>Waypoint · sector · SIGMET · arrival · runway</small>
            </section>

            <section className="statistics-card" data-testid="calibration-truth-first">
              <DecisionHeader
                title="Truth-first recall"
                decision={report.truthFirst.decision}
                reasons={report.truthFirst.reasons}
              />
              <div className={styles.metrics}>
                <Metric label="Truth events" value={report.truthFirst.overall.truthEvents} />
                <Metric label="Recalled" value={report.truthFirst.overall.predictedTruthEvents} />
                <Metric label="Recall" value={pct(report.truthFirst.overall.recall)} />
                <Metric label="Timing MAE" value={seconds(report.truthFirst.overall.meanAbsoluteTimingErrorSeconds)} />
              </div>
              <small>Independent terminal, sector, route-progress and SIGMET truth</small>
            </section>

            <section className="statistics-card" data-testid="calibration-wind-timing">
              <DecisionHeader
                title="Wind timing graduation"
                decision={report.windTiming.decision}
                reasons={report.windTiming.reasons}
              />
              <div className={styles.metrics}>
                <Metric label="Paired samples" value={report.windTiming.pairedSamples} />
                <Metric label="Truth coverage" value={pct(report.windTiming.truthCoverage)} />
                <Metric label="Shadow win rate" value={pct(report.windTiming.shadowWinRate)} />
                <Metric label="Relative MAE gain" value={pct(report.windTiming.relativeMaeImprovement)} />
              </div>
              <small>
                Manual promotion eligible: {report.windTiming.manualPromotionEligible ? "yes" : "no"}
              </small>
            </section>

            <section className="statistics-card" data-testid="calibration-regional-attention">
              <DecisionHeader
                title="Regional Attention outcome"
                decision={report.regionalAttention.decision}
                reasons={report.regionalAttention.reasons}
              />
              <div className={styles.metrics}>
                <Metric label="Predictions" value={report.regionalAttention.overall.predictions} />
                <Metric label="Scoreable" value={report.regionalAttention.overall.scoreable} />
                <Metric label="Precision" value={pct(report.regionalAttention.overall.precision)} />
                <Metric
                  label="Truth coverage"
                  value={pct(report.regionalAttention.overall.truthCoverage)}
                />
                <Metric
                  label="Timing MAE"
                  value={seconds(report.regionalAttention.overall.meanAbsoluteTimingErrorSeconds)}
                />
                <Metric
                  label="Destination clusters unscored"
                  value={report.regionalAttention.unscoredDestinationClusters}
                />
              </div>
              <div className={styles.horizonGrid}>
                {report.regionalAttention.horizonsMinutes.map((horizon) => {
                  const slice = report.regionalAttention.horizons[String(horizon)];
                  return (
                    <span className={styles.horizon} key={horizon}>
                      <strong>{horizon} min</strong>
                      <small>{slice?.scoreable ?? 0} scoreable · {pct(slice?.precision ?? null)}</small>
                    </span>
                  );
                })}
              </div>
            </section>

            <section className="statistics-card" data-testid="calibration-persistence">
              <div className={styles.cardHeader}>
                <div>
                  <h2>Calibration persistence</h2>
                  <small>{report.persistence.storage}</small>
                </div>
                <StatusBadge
                  variant={
                    report.persistence.databaseAvailable
                      && report.persistence.loaded
                      && report.persistence.loadFailures + report.persistence.flushFailures === 0
                      ? "live"
                      : "warning"
                  }
                >
                  {report.persistence.databaseAvailable ? "DB" : "NO DB"}
                </StatusBadge>
              </div>
              <div className={styles.metrics}>
                <Metric label="Corridor hydrated" value={report.persistence.hydratedOutcomeBuckets} />
                <Metric label="Event hydrated" value={report.persistence.hydratedEventOutcomeBuckets} />
                <Metric
                  label="Regional hydrated"
                  value={report.persistence.hydratedRegionalAttentionOutcomeBuckets}
                />
                <Metric label="Tracked buckets" value={report.persistence.trackedPersistedBuckets} />
                <Metric label="Rows written" value={report.persistence.rowsWritten} />
                <Metric label="Rows deleted" value={report.persistence.rowsDeleted} />
              </div>
              <small>
                Last load {timestamp(report.persistence.lastLoadAt)} · last flush {timestamp(report.persistence.lastFlushAt)}
              </small>
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
