"use client";

import { useEffect, useState } from "react";
import type {
  AdminEtaAdvisoryPreview,
  PublicEtaAdvisory,
} from "@/lib/predictive-intelligence";
import { formatAge, formatTime, t } from "@/lib/i18n";

interface EtaAdvisoryApiResponse {
  etaAdvisory: PublicEtaAdvisory | null;
  adminPreview?: AdminEtaAdvisoryPreview;
}

function confidenceLabel(value: PublicEtaAdvisory["confidence"] | AdminEtaAdvisoryPreview["confidence"]): string {
  if (value === "HIGH") return t.aircraft.predictiveConfidenceHigh;
  if (value === "MEDIUM") return t.aircraft.predictiveConfidenceMedium;
  if (value === "LOW") return t.aircraft.predictiveConfidenceLow;
  return t.aircraft.predictiveConfidenceUnknown;
}

function readinessLabel(value: AdminEtaAdvisoryPreview["readiness"]): string {
  if (value === "PASS") return t.aircraft.predictiveReadinessPass;
  if (value === "FAIL") return t.aircraft.predictiveReadinessFail;
  return t.aircraft.predictiveReadinessWait;
}

function previewStateLabel(value: AdminEtaAdvisoryPreview["state"]): string {
  if (value === "stale") return t.aircraft.predictiveStateStale;
  if (value === "expired") return t.aircraft.predictiveStateExpired;
  if (value === "available") return t.aircraft.predictiveStateAvailable;
  return t.aircraft.predictiveStateUnavailable;
}

export function PredictiveEtaAdvisory({
  icaoHex,
  enabled,
}: {
  icaoHex: string;
  enabled: boolean;
}) {
  const [response, setResponse] = useState<EtaAdvisoryApiResponse | null>(null);

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
        return await result.json() as EtaAdvisoryApiResponse;
      })
      .then((value) => {
        if (!controller.signal.aborted) setResponse(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setResponse(null);
      });
    return () => controller.abort();
  }, [enabled, icaoHex]);

  const advisory = response?.etaAdvisory ?? null;
  const preview = response?.adminPreview;
  if (!advisory && !preview) return null;

  const estimatedArrivalAt = advisory?.estimatedArrivalAt ?? preview?.estimatedArrivalAt ?? null;
  const uncertaintyMinutes = advisory?.uncertaintyMinutes ?? preview?.uncertaintyMinutes ?? null;
  const horizonMinutes = advisory?.horizonMinutes ?? preview?.horizonMinutes ?? null;
  const ageSeconds = advisory?.ageSeconds ?? preview?.ageSeconds ?? null;
  const confidence = advisory?.confidence ?? preview?.confidence ?? "UNKNOWN";
  const adminOnly = !advisory && Boolean(preview);

  return <section
    className={`predictive-eta-advisory${adminOnly ? " admin-preview" : ""}`}
    aria-labelledby="predictive-eta-title"
    data-testid="predictive-eta-advisory"
    data-mode={adminOnly ? "admin-preview" : "public"}
  >
    <div className="predictive-eta-heading">
      <div>
        <span className="ui-kicker">{adminOnly ? t.aircraft.predictiveAdminPreview : t.aircraft.predictiveLabel}</span>
        <h2 id="predictive-eta-title">{t.aircraft.predictiveEtaTitle}</h2>
      </div>
      <span className={`predictive-eta-confidence ${confidence.toLowerCase()}`}>{confidenceLabel(confidence)}</span>
    </div>

    <div className="predictive-eta-primary">
      <strong>{estimatedArrivalAt ? formatTime(estimatedArrivalAt) : t.common.emptyValue}</strong>
      <span>{t.aircraft.predictiveArrivalTime}</span>
    </div>

    <div className="predictive-eta-meta">
      <span>
        {uncertaintyMinutes === null
          ? t.aircraft.predictiveUncertaintyUnavailable
          : t.aircraft.predictiveUncertainty(uncertaintyMinutes)}
      </span>
      {horizonMinutes !== null && <span>{t.aircraft.predictiveHorizon(horizonMinutes)}</span>}
      {ageSeconds !== null && <span>{t.aircraft.predictiveUpdated(formatAge(ageSeconds))}</span>}
    </div>

    {preview && <div className="predictive-eta-admin-meta">
      <span>{t.aircraft.predictiveMode}: {preview.mode}</span>
      <span>{t.aircraft.predictiveReadiness}: {readinessLabel(preview.readiness)}</span>
      <span>{t.aircraft.predictiveState}: {previewStateLabel(preview.state)}</span>
      {preview.readinessReasons.length > 0 && <span title={preview.readinessReasons.join(", ")}>{t.aircraft.predictiveReasons}: {preview.readinessReasons.length}</span>}
    </div>}

    <p className="predictive-eta-disclaimer">
      {adminOnly ? t.aircraft.predictiveAdminDisclaimer : t.aircraft.predictiveDisclaimer}
    </p>
  </section>;
}
