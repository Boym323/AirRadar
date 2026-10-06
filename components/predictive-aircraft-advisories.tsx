"use client";

import { useEffect, useState } from "react";
import type {
  AdminEtaAdvisoryPreview,
  AdminRunwayAdvisoryPreview,
  AdminRunwayChangeAdvisoryPreview,
  AdminTrajectoryAdvisoryPreview,
  PublicEtaAdvisory,
  PublicRunwayAdvisory,
  PublicRunwayChangeAdvisory,
  PublicTrajectoryAdvisory,
  type ExplainablePredictionEvidence,
} from "@/lib/predictive-intelligence";
import { ETA_ADVISORY_STALE_AFTER_MS } from "@/lib/predictive-intelligence/eta-advisory";
import { RUNWAY_ADVISORY_STALE_AFTER_MS } from "@/lib/predictive-intelligence/runway-advisory";
import {
  RUNWAY_CHANGE_ADVISORY_EVENT_WINDOW_MS,
  RUNWAY_CHANGE_ADVISORY_STALE_AFTER_MS,
} from "@/lib/predictive-intelligence/runway-change-advisory";
import { TRAJECTORY_ADVISORY_STALE_AFTER_MS } from "@/lib/predictive-intelligence/trajectory-advisory";
import { formatAge, formatNumber, formatTime, t } from "@/lib/i18n";
import styles from "./predictive-aircraft-advisories.module.css";

interface PredictiveAdvisoryApiResponse {
  etaAdvisory: PublicEtaAdvisory | null;
  runwayAdvisory: PublicRunwayAdvisory | null;
  runwayChangeAdvisory: PublicRunwayChangeAdvisory | null;
  trajectoryAdvisory: PublicTrajectoryAdvisory | null;
  adminPreview?: AdminEtaAdvisoryPreview;
  runwayAdminPreview?: AdminRunwayAdvisoryPreview;
  runwayChangeAdminPreview?: AdminRunwayChangeAdvisoryPreview;
  trajectoryAdminPreview?: AdminTrajectoryAdvisoryPreview;
}

type AdvisoryConfidence =
  | PublicEtaAdvisory["confidence"]
  | AdminEtaAdvisoryPreview["confidence"]
  | PublicRunwayAdvisory["confidence"]
  | AdminRunwayAdvisoryPreview["confidence"]
  | PublicRunwayChangeAdvisory["confidence"]
  | AdminRunwayChangeAdvisoryPreview["confidence"]
  | PublicTrajectoryAdvisory["confidence"]
  | AdminTrajectoryAdvisoryPreview["confidence"];


function explainabilityCopy() {
  const cs = t.locale.startsWith("cs");
  return cs ? {
    why: "Proč?",
    subtitle: "Evidence použitá canonical predikcí",
    publicGate: "PUBLIC · readiness PASS",
    adminGate: "Admin preview",
    model: "Model",
    provenance: "Provenance",
    noEvidence: "Pro tuto advisory není k dispozici žádná publikovatelná evidence.",
    readiness: "Readiness důvody",
    labels: {
      distanceRemainingNm: "Zbývající vzdálenost",
      effectiveSpeedKt: "Efektivní rychlost",
      phase: "Letová fáze",
      progressWindowSec: "Okno trendu",
      recentRunwayUsage: "Nedávný runway flow",
      surfaceWind: "Povrchový vítr",
      candidateMargin: "Rozdíl kandidátů",
      crossTrackKm: "Cross-track odchylka",
      distanceChangeKm: "Změna vzdálenosti",
    } as Record<ExplainablePredictionEvidence["key"], string>,
  } : {
    why: "Why?",
    subtitle: "Evidence used by the canonical prediction",
    publicGate: "PUBLIC · readiness PASS",
    adminGate: "Admin preview",
    model: "Model",
    provenance: "Provenance",
    noEvidence: "No publishable evidence is available for this advisory.",
    readiness: "Readiness reasons",
    labels: {
      distanceRemainingNm: "Distance remaining",
      effectiveSpeedKt: "Effective speed",
      phase: "Flight phase",
      progressWindowSec: "Progress window",
      recentRunwayUsage: "Recent runway flow",
      surfaceWind: "Surface wind",
      candidateMargin: "Candidate margin",
      crossTrackKm: "Cross-track offset",
      distanceChangeKm: "Distance change",
    } as Record<ExplainablePredictionEvidence["key"], string>,
  };
}

function explainableValue(item: ExplainablePredictionEvidence): string {
  if (typeof item.value === "string") return item.value;
  if (item.key === "distanceRemainingNm") return formatNumber(item.value, 1) + " NM";
  if (item.key === "effectiveSpeedKt") return formatNumber(item.value, 0) + " kt";
  if (item.key === "progressWindowSec") return formatNumber(item.value, 0) + " s";
  if (item.key === "candidateMargin") return formatNumber(item.value, 2);
  if (item.key === "crossTrackKm" || item.key === "distanceChangeKm") return formatNumber(item.value, 1) + " km";
  return formatNumber(item.value);
}

function PredictionExplainability({
  testId,
  evidence,
  modelVersion,
  adminOnly,
  readinessReasons = [],
}: {
  testId: string;
  evidence: readonly ExplainablePredictionEvidence[];
  modelVersion: string | null;
  adminOnly: boolean;
  readinessReasons?: readonly string[];
}) {
  const copy = explainabilityCopy();
  return <details className={styles.root} data-testid={testId}>
    <summary>{copy.why}<span>{copy.subtitle}</span></summary>
    <div className={styles.body}>
      <div className={styles.context}>
        <span>{adminOnly ? copy.adminGate : copy.publicGate}</span>
        <span>{copy.provenance}: predicted</span>
        {modelVersion ? <span>{copy.model}: {modelVersion}</span> : null}
      </div>
      {evidence.length ? <ul className={styles.list}>
        {evidence.map((item) => <li key={item.key}>
          <span>{copy.labels[item.key]}</span>
          <strong>{explainableValue(item)}</strong>
        </li>)}
      </ul> : <p className={styles.empty}>{copy.noEvidence}</p>}
      {adminOnly && readinessReasons.length > 0 ? <>
        <small>{copy.readiness}</small>
        <ul className={styles.reasons}>{readinessReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </> : null}
    </div>
  </details>;
}

function confidenceLabel(value: AdvisoryConfidence): string {
  if (value === "HIGH") return t.aircraft.predictiveConfidenceHigh;
  if (value === "MEDIUM") return t.aircraft.predictiveConfidenceMedium;
  if (value === "LOW") return t.aircraft.predictiveConfidenceLow;
  return t.aircraft.predictiveConfidenceUnknown;
}

function trajectoryStateLabel(value: "NORMAL" | "POSSIBLE_DEVIATION" | "DEVIATING" | "UNKNOWN"): string {
  if (value === "NORMAL") return t.aircraft.predictiveTrajectoryNormal;
  if (value === "POSSIBLE_DEVIATION") return t.aircraft.predictiveTrajectoryPossibleDeviation;
  if (value === "DEVIATING") return t.aircraft.predictiveTrajectoryDeviating;
  return t.aircraft.predictiveTrajectoryUnknown;
}

function readinessLabel(value: "PASS" | "WAIT" | "FAIL"): string {
  if (value === "PASS") return t.aircraft.predictiveReadinessPass;
  if (value === "FAIL") return t.aircraft.predictiveReadinessFail;
  return t.aircraft.predictiveReadinessWait;
}

function previewStateLabel(value: "available" | "unavailable" | "stale" | "expired"): string {
  if (value === "stale") return t.aircraft.predictiveStateStale;
  if (value === "expired") return t.aircraft.predictiveStateExpired;
  if (value === "available") return t.aircraft.predictiveStateAvailable;
  return t.aircraft.predictiveStateUnavailable;
}

function remainingFreshMs(ageSeconds: number, staleAfterMs: number): number {
  return Math.max(250, staleAfterMs - ageSeconds * 1_000 + 1_000);
}

function percent(value: number | null): string {
  return value === null ? t.common.emptyValue : `${Math.round(value * 100)} %`;
}

export function PredictiveAircraftAdvisories({
  icaoHex,
  enabled,
}: {
  icaoHex: string;
  enabled: boolean;
}) {
  const [response, setResponse] = useState<PredictiveAdvisoryApiResponse | null>(null);

  useEffect(() => {
    if (!enabled) {
      setResponse(null);
      return;
    }

    const controller = new AbortController();
    setResponse(null);
    void fetch(`/api/aircraft/${encodeURIComponent(icaoHex)}/prediction`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (result) => {
        if (!result.ok) throw new Error("prediction request failed");
        return await result.json() as PredictiveAdvisoryApiResponse;
      })
      .then((value) => {
        if (!controller.signal.aborted) setResponse(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setResponse(null);
      });

    return () => controller.abort();
  }, [enabled, icaoHex]);

  const etaAdvisory = response?.etaAdvisory ?? null;
  useEffect(() => {
    if (!etaAdvisory) return;

    const evaluatedAt = etaAdvisory.evaluatedAt;
    const timeout = window.setTimeout(() => {
      setResponse((current) => {
        if (!current || current.etaAdvisory?.evaluatedAt !== evaluatedAt) return current;
        return {
          ...current,
          etaAdvisory: null,
          ...(current.adminPreview
            ? {
              adminPreview: {
                ...current.adminPreview,
                state: "stale",
                ageSeconds: Math.max(
                  current.adminPreview.ageSeconds ?? 0,
                  Math.floor(ETA_ADVISORY_STALE_AFTER_MS / 1_000) + 1,
                ),
              },
            }
            : {}),
        };
      });
    }, remainingFreshMs(etaAdvisory.ageSeconds, ETA_ADVISORY_STALE_AFTER_MS));

    return () => window.clearTimeout(timeout);
  }, [etaAdvisory]);

  const runwayAdvisory = response?.runwayAdvisory ?? null;
  useEffect(() => {
    if (!runwayAdvisory) return;

    const evaluatedAt = runwayAdvisory.evaluatedAt;
    const timeout = window.setTimeout(() => {
      setResponse((current) => {
        if (!current || current.runwayAdvisory?.evaluatedAt !== evaluatedAt) return current;
        return {
          ...current,
          runwayAdvisory: null,
          ...(current.runwayAdminPreview
            ? {
              runwayAdminPreview: {
                ...current.runwayAdminPreview,
                state: "stale",
                ageSeconds: Math.max(
                  current.runwayAdminPreview.ageSeconds ?? 0,
                  Math.floor(RUNWAY_ADVISORY_STALE_AFTER_MS / 1_000) + 1,
                ),
              },
            }
            : {}),
        };
      });
    }, remainingFreshMs(runwayAdvisory.ageSeconds, RUNWAY_ADVISORY_STALE_AFTER_MS));

    return () => window.clearTimeout(timeout);
  }, [runwayAdvisory]);

  const runwayChangeAdvisory = response?.runwayChangeAdvisory ?? null;
  useEffect(() => {
    if (!runwayChangeAdvisory) return;

    const evaluatedAt = runwayChangeAdvisory.evaluatedAt;
    const timeout = window.setTimeout(() => {
      setResponse((current) => {
        if (!current || current.runwayChangeAdvisory?.evaluatedAt !== evaluatedAt) return current;
        return {
          ...current,
          runwayChangeAdvisory: null,
          ...(current.runwayChangeAdminPreview
            ? {
              runwayChangeAdminPreview: {
                ...current.runwayChangeAdminPreview,
                state: current.runwayChangeAdminPreview.changedAt
                  && Number.isFinite(Date.parse(current.runwayChangeAdminPreview.changedAt))
                  && Date.now() - Date.parse(current.runwayChangeAdminPreview.changedAt) >= RUNWAY_CHANGE_ADVISORY_EVENT_WINDOW_MS
                  ? "expired"
                  : "stale",
                ageSeconds: Math.max(
                  current.runwayChangeAdminPreview.ageSeconds ?? 0,
                  Math.floor(RUNWAY_CHANGE_ADVISORY_STALE_AFTER_MS / 1_000) + 1,
                ),
              },
            }
            : {}),
        };
      });
    }, Math.min(
      remainingFreshMs(runwayChangeAdvisory.ageSeconds, RUNWAY_CHANGE_ADVISORY_STALE_AFTER_MS),
      remainingFreshMs(runwayChangeAdvisory.changeAgeSeconds, RUNWAY_CHANGE_ADVISORY_EVENT_WINDOW_MS),
    ));

    return () => window.clearTimeout(timeout);
  }, [runwayChangeAdvisory]);

  const trajectoryAdvisory = response?.trajectoryAdvisory ?? null;
  useEffect(() => {
    if (!trajectoryAdvisory) return;

    const evaluatedAt = trajectoryAdvisory.evaluatedAt;
    const timeout = window.setTimeout(() => {
      setResponse((current) => {
        if (!current || current.trajectoryAdvisory?.evaluatedAt !== evaluatedAt) return current;
        return {
          ...current,
          trajectoryAdvisory: null,
          ...(current.trajectoryAdminPreview
            ? {
              trajectoryAdminPreview: {
                ...current.trajectoryAdminPreview,
                state: "stale",
                ageSeconds: Math.max(
                  current.trajectoryAdminPreview.ageSeconds ?? 0,
                  Math.floor(TRAJECTORY_ADVISORY_STALE_AFTER_MS / 1_000) + 1,
                ),
              },
            }
            : {}),
        };
      });
    }, remainingFreshMs(trajectoryAdvisory.ageSeconds, TRAJECTORY_ADVISORY_STALE_AFTER_MS));

    return () => window.clearTimeout(timeout);
  }, [trajectoryAdvisory]);

  const etaPreview = response?.adminPreview;
  const runwayPreview = response?.runwayAdminPreview;
  const runwayChangePreview = response?.runwayChangeAdminPreview;
  const trajectoryPreview = response?.trajectoryAdminPreview;
  if (!etaAdvisory && !etaPreview && !runwayAdvisory && !runwayPreview && !runwayChangeAdvisory && !runwayChangePreview && !trajectoryAdvisory && !trajectoryPreview) return null;

  const etaAdminOnly = !etaAdvisory && Boolean(etaPreview);
  const etaEstimatedArrivalAt = etaAdvisory?.estimatedArrivalAt ?? etaPreview?.estimatedArrivalAt ?? null;
  const etaUncertaintyMinutes = etaAdvisory?.uncertaintyMinutes ?? etaPreview?.uncertaintyMinutes ?? null;
  const etaHorizonMinutes = etaAdvisory?.horizonMinutes ?? etaPreview?.horizonMinutes ?? null;
  const etaAgeSeconds = etaAdvisory?.ageSeconds ?? etaPreview?.ageSeconds ?? null;
  const etaConfidence = etaAdvisory?.confidence ?? etaPreview?.confidence ?? "UNKNOWN";

  const runwayAdminOnly = !runwayAdvisory && Boolean(runwayPreview);
  const runway = runwayAdvisory?.runway ?? runwayPreview?.runway ?? null;
  const runwayAlternative = runwayAdvisory?.alternative ?? runwayPreview?.alternative ?? null;
  const runwayAgeSeconds = runwayAdvisory?.ageSeconds ?? runwayPreview?.ageSeconds ?? null;
  const runwayConfidence = runwayAdvisory?.confidence ?? runwayPreview?.confidence ?? "UNKNOWN";

  const runwayChangeAdminOnly = !runwayChangeAdvisory && Boolean(runwayChangePreview);
  const changedFrom = runwayChangeAdvisory?.changedFrom ?? runwayChangePreview?.changedFrom ?? null;
  const changedRunway = runwayChangeAdvisory?.runway ?? runwayChangePreview?.runway ?? null;
  const runwayChangeAgeSeconds = runwayChangeAdvisory?.changeAgeSeconds ?? runwayChangePreview?.changeAgeSeconds ?? null;
  const runwayChangeSnapshotAgeSeconds = runwayChangeAdvisory?.ageSeconds ?? runwayChangePreview?.ageSeconds ?? null;
  const runwayChangeConfidence = runwayChangeAdvisory?.confidence ?? runwayChangePreview?.confidence ?? "UNKNOWN";

  const trajectoryAdminOnly = !trajectoryAdvisory && Boolean(trajectoryPreview);
  const trajectoryState = trajectoryAdvisory?.trajectoryState ?? trajectoryPreview?.trajectoryState ?? "UNKNOWN";
  const trajectoryAgeSeconds = trajectoryAdvisory?.ageSeconds ?? trajectoryPreview?.ageSeconds ?? null;
  const trajectoryConfidence = trajectoryAdvisory?.confidence ?? trajectoryPreview?.confidence ?? "UNKNOWN";

  return <>
    {(etaAdvisory || etaPreview) && <section
      className={`predictive-eta-advisory${etaAdminOnly ? " admin-preview" : ""}`}
      aria-labelledby="predictive-eta-title"
      data-testid="predictive-eta-advisory"
      data-mode={etaAdminOnly ? "admin-preview" : "public"}
    >
      <div className="predictive-eta-heading">
        <div>
          <span className="ui-kicker">{etaAdminOnly ? t.aircraft.predictiveAdminPreview : t.aircraft.predictiveLabel}</span>
          <h2 id="predictive-eta-title">{t.aircraft.predictiveEtaTitle}</h2>
        </div>
        <span className={`predictive-eta-confidence ${etaConfidence.toLowerCase()}`}>{confidenceLabel(etaConfidence)}</span>
      </div>

      <div className="predictive-eta-primary">
        <strong>{etaEstimatedArrivalAt ? formatTime(etaEstimatedArrivalAt) : t.common.emptyValue}</strong>
        <span>{t.aircraft.predictiveArrivalTime}</span>
      </div>

      <div className="predictive-eta-meta">
        <span>
          {etaUncertaintyMinutes === null
            ? t.aircraft.predictiveUncertaintyUnavailable
            : t.aircraft.predictiveUncertainty(etaUncertaintyMinutes)}
        </span>
        {etaHorizonMinutes !== null && <span>{t.aircraft.predictiveHorizon(etaHorizonMinutes)}</span>}
        {etaAgeSeconds !== null && <span>{t.aircraft.predictiveUpdated(formatAge(etaAgeSeconds))}</span>}
      </div>

      {etaPreview && <div className="predictive-eta-admin-meta">
        <span>{t.aircraft.predictiveMode}: {etaPreview.mode}</span>
        <span>{t.aircraft.predictiveReadiness}: {readinessLabel(etaPreview.readiness)}</span>
        <span>{t.aircraft.predictiveState}: {previewStateLabel(etaPreview.state)}</span>
        {etaPreview.readinessReasons.length > 0 && <span title={etaPreview.readinessReasons.join(", ")}>{t.aircraft.predictiveReasons}: {etaPreview.readinessReasons.length}</span>}
      </div>}

      <PredictionExplainability
        testId="explainable-prediction-eta"
        evidence={(etaAdvisory ?? etaPreview)?.evidence ?? []}
        modelVersion={(etaAdvisory ?? etaPreview)?.modelVersion ?? null}
        adminOnly={etaAdminOnly}
        readinessReasons={etaPreview?.readinessReasons}
      />
      <p className="predictive-eta-disclaimer">
        {etaAdminOnly ? t.aircraft.predictiveAdminDisclaimer : t.aircraft.predictiveDisclaimer}
      </p>
    </section>}

    {(runwayAdvisory || runwayPreview) && <section
      className={`predictive-eta-advisory predictive-runway-advisory${runwayAdminOnly ? " admin-preview" : ""}`}
      aria-labelledby="predictive-runway-title"
      data-testid="predictive-runway-advisory"
      data-mode={runwayAdminOnly ? "admin-preview" : "public"}
    >
      <div className="predictive-eta-heading">
        <div>
          <span className="ui-kicker">{runwayAdminOnly ? t.aircraft.predictiveAdminPreview : t.aircraft.predictiveLabel}</span>
          <h2 id="predictive-runway-title">{t.aircraft.predictiveRunwayTitle}</h2>
        </div>
        <span className={`predictive-eta-confidence ${runwayConfidence.toLowerCase()}`}>{confidenceLabel(runwayConfidence)}</span>
      </div>

      <div className="predictive-eta-primary">
        <strong>{runway ?? t.common.emptyValue}</strong>
        <span>{t.aircraft.predictiveRunwayLabel}</span>
      </div>

      <div className="predictive-eta-meta">
        {runwayAlternative && runwayAlternative !== runway && <span>{t.aircraft.predictiveRunwayAlternative(runwayAlternative)}</span>}
        {runwayAgeSeconds !== null && <span>{t.aircraft.predictiveUpdated(formatAge(runwayAgeSeconds))}</span>}
      </div>

      {runwayPreview && <div className="predictive-eta-admin-meta">
        <span>{t.aircraft.predictiveMode}: {runwayPreview.mode}</span>
        <span>{t.aircraft.predictiveReadiness}: {readinessLabel(runwayPreview.readiness)}</span>
        <span>{t.aircraft.predictiveState}: {previewStateLabel(runwayPreview.state)}</span>
        <span>{t.aircraft.predictiveRunwayAccuracy}: {percent(runwayPreview.exactEndAccuracy)}</span>
        <span>{t.aircraft.predictiveRunwayCoverage}: {percent(runwayPreview.coverage)}</span>
        {runwayPreview.readinessReasons.length > 0 && <span title={runwayPreview.readinessReasons.join(", ")}>{t.aircraft.predictiveReasons}: {runwayPreview.readinessReasons.length}</span>}
      </div>}

      <PredictionExplainability
        testId="explainable-prediction-runway"
        evidence={(runwayAdvisory ?? runwayPreview)?.evidence ?? []}
        modelVersion={(runwayAdvisory ?? runwayPreview)?.modelVersion ?? null}
        adminOnly={runwayAdminOnly}
        readinessReasons={runwayPreview?.readinessReasons}
      />
      <p className="predictive-eta-disclaimer">
        {runwayAdminOnly ? t.aircraft.predictiveRunwayAdminDisclaimer : t.aircraft.predictiveRunwayDisclaimer}
      </p>
    </section>}

    {(runwayChangeAdvisory || runwayChangePreview) && <section
      className={`predictive-eta-advisory predictive-runway-advisory predictive-runway-change-advisory${runwayChangeAdminOnly ? " admin-preview" : ""}`}
      aria-labelledby="predictive-runway-change-title"
      data-testid="predictive-runway-change-advisory"
      data-mode={runwayChangeAdminOnly ? "admin-preview" : "public"}
    >
      <div className="predictive-eta-heading">
        <div>
          <span className="ui-kicker">{runwayChangeAdminOnly ? t.aircraft.predictiveAdminPreview : t.aircraft.predictiveLabel}</span>
          <h2 id="predictive-runway-change-title">{t.aircraft.predictiveRunwayChangeTitle}</h2>
        </div>
        <span className={`predictive-eta-confidence ${runwayChangeConfidence.toLowerCase()}`}>{confidenceLabel(runwayChangeConfidence)}</span>
      </div>

      <div className="predictive-eta-primary">
        <strong>{changedFrom && changedRunway ? `${changedFrom} → ${changedRunway}` : t.common.emptyValue}</strong>
        <span>{t.aircraft.predictiveRunwayChangeLabel}</span>
      </div>

      <div className="predictive-eta-meta">
        {runwayChangeAgeSeconds !== null && <span>{t.aircraft.predictiveRunwayChangeAge(formatAge(runwayChangeAgeSeconds))}</span>}
        {runwayChangeSnapshotAgeSeconds !== null && <span>{t.aircraft.predictiveUpdated(formatAge(runwayChangeSnapshotAgeSeconds))}</span>}
      </div>

      {runwayChangePreview && <div className="predictive-eta-admin-meta">
        <span>{t.aircraft.predictiveMode}: {runwayChangePreview.mode}</span>
        <span>{t.aircraft.predictiveReadiness}: {readinessLabel(runwayChangePreview.readiness)}</span>
        <span>{t.aircraft.predictiveState}: {previewStateLabel(runwayChangePreview.state)}</span>
        <span>{t.aircraft.predictiveRunwayChangePrecision}: {percent(runwayChangePreview.outcomePrecision)}</span>
        <span>{t.aircraft.predictiveRunwayChangeFalsePositive}: {percent(runwayChangePreview.falsePositiveRate)}</span>
        <span>{t.aircraft.predictiveRunwayChangeTruth}: {runwayChangePreview.independentChangeTruthAvailable ? t.common.yes : t.common.no}</span>
        {runwayChangePreview.readinessReasons.length > 0 && <span title={runwayChangePreview.readinessReasons.join(", ")}>{t.aircraft.predictiveReasons}: {runwayChangePreview.readinessReasons.length}</span>}
      </div>}

      <PredictionExplainability
        testId="explainable-prediction-runway-change"
        evidence={(runwayChangeAdvisory ?? runwayChangePreview)?.evidence ?? []}
        modelVersion={(runwayChangeAdvisory ?? runwayChangePreview)?.modelVersion ?? null}
        adminOnly={runwayChangeAdminOnly}
        readinessReasons={runwayChangePreview?.readinessReasons}
      />
      <p className="predictive-eta-disclaimer">
        {runwayChangeAdminOnly ? t.aircraft.predictiveRunwayChangeAdminDisclaimer : t.aircraft.predictiveRunwayChangeDisclaimer}
      </p>
    </section>}

    {(trajectoryAdvisory || trajectoryPreview) && <section
      className={`predictive-eta-advisory predictive-trajectory-advisory${trajectoryAdminOnly ? " admin-preview" : ""}`}
      aria-labelledby="predictive-trajectory-title"
      data-testid="predictive-trajectory-advisory"
      data-mode={trajectoryAdminOnly ? "admin-preview" : "public"}
    >
      <div className="predictive-eta-heading">
        <div>
          <span className="ui-kicker">{trajectoryAdminOnly ? t.aircraft.predictiveAdminPreview : t.aircraft.predictiveLabel}</span>
          <h2 id="predictive-trajectory-title">{t.aircraft.predictiveTrajectoryTitle}</h2>
        </div>
        <span className={`predictive-eta-confidence ${trajectoryConfidence.toLowerCase()}`}>{confidenceLabel(trajectoryConfidence)}</span>
      </div>

      <div className="predictive-eta-primary">
        <strong>{trajectoryStateLabel(trajectoryState)}</strong>
        <span>{t.aircraft.predictiveTrajectoryLabel}</span>
      </div>

      <div className="predictive-eta-meta">
        {trajectoryAgeSeconds !== null && <span>{t.aircraft.predictiveUpdated(formatAge(trajectoryAgeSeconds))}</span>}
      </div>

      {trajectoryPreview && <div className="predictive-eta-admin-meta">
        <span>{t.aircraft.predictiveMode}: {trajectoryPreview.mode}</span>
        <span>{t.aircraft.predictiveReadiness}: {readinessLabel(trajectoryPreview.readiness)}</span>
        <span>{t.aircraft.predictiveState}: {previewStateLabel(trajectoryPreview.state)}</span>
        <span>{t.aircraft.predictiveTrajectoryCandidates}: {trajectoryPreview.candidateObservations ?? t.common.emptyValue}</span>
        <span>{t.aircraft.predictiveTrajectoryValidated}: {trajectoryPreview.validatedCandidates}</span>
        <span>{t.aircraft.predictiveTrajectoryPrecision}: {percent(trajectoryPreview.precision)}</span>
        <span>{t.aircraft.predictiveTrajectoryStateCapture}: {trajectoryPreview.stateCaptureAvailable ? t.common.yes : t.common.no}</span>
        <span>{t.aircraft.predictiveTrajectoryTruth}: {trajectoryPreview.independentOutcomeTruthAvailable ? t.common.yes : t.common.no}</span>
        {trajectoryPreview.readinessReasons.length > 0 && <span title={trajectoryPreview.readinessReasons.join(", ")}>{t.aircraft.predictiveReasons}: {trajectoryPreview.readinessReasons.length}</span>}
      </div>}

      <PredictionExplainability
        testId="explainable-prediction-trajectory"
        evidence={(trajectoryAdvisory ?? trajectoryPreview)?.evidence ?? []}
        modelVersion={(trajectoryAdvisory ?? trajectoryPreview)?.modelVersion ?? null}
        adminOnly={trajectoryAdminOnly}
        readinessReasons={trajectoryPreview?.readinessReasons}
      />
      <p className="predictive-eta-disclaimer">
        {trajectoryAdminOnly ? t.aircraft.predictiveTrajectoryAdminDisclaimer : t.aircraft.predictiveTrajectoryDisclaimer}
      </p>
    </section>}
  </>;
}
