"use client";

import { useEffect, useState } from "react";
import type {
  AdminEtaAdvisoryPreview,
  AdminRunwayAdvisoryPreview,
  PublicEtaAdvisory,
  PublicRunwayAdvisory,
} from "@/lib/predictive-intelligence";
import { ETA_ADVISORY_STALE_AFTER_MS } from "@/lib/predictive-intelligence/eta-advisory";
import { RUNWAY_ADVISORY_STALE_AFTER_MS } from "@/lib/predictive-intelligence/runway-advisory";
import { formatAge, formatTime, t } from "@/lib/i18n";

interface PredictiveAdvisoryApiResponse {
  etaAdvisory: PublicEtaAdvisory | null;
  runwayAdvisory: PublicRunwayAdvisory | null;
  adminPreview?: AdminEtaAdvisoryPreview;
  runwayAdminPreview?: AdminRunwayAdvisoryPreview;
}

type AdvisoryConfidence =
  | PublicEtaAdvisory["confidence"]
  | AdminEtaAdvisoryPreview["confidence"]
  | PublicRunwayAdvisory["confidence"]
  | AdminRunwayAdvisoryPreview["confidence"];

function confidenceLabel(value: AdvisoryConfidence): string {
  if (value === "HIGH") return t.aircraft.predictiveConfidenceHigh;
  if (value === "MEDIUM") return t.aircraft.predictiveConfidenceMedium;
  if (value === "LOW") return t.aircraft.predictiveConfidenceLow;
  return t.aircraft.predictiveConfidenceUnknown;
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

  const etaPreview = response?.adminPreview;
  const runwayPreview = response?.runwayAdminPreview;
  if (!etaAdvisory && !etaPreview && !runwayAdvisory && !runwayPreview) return null;

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

      <p className="predictive-eta-disclaimer">
        {runwayAdminOnly ? t.aircraft.predictiveRunwayAdminDisclaimer : t.aircraft.predictiveRunwayDisclaimer}
      </p>
    </section>}
  </>;
}
