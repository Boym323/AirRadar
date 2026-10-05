"use client";

import { useEffect, useMemo, useState } from "react";
import { formatAge, formatNumber, t } from "@/lib/i18n";
import type {
  WeatherFusionEvidence,
  WeatherFusionEvidenceCode,
  WeatherFusionResult,
  WeatherFusionRiskKind,
  WeatherFusionSeverity,
  WeatherFusionSource,
} from "@/lib/weather/fusion";

interface FusionApiResponse {
  status: "available" | "unavailable" | "stale";
  fusion?: WeatherFusionResult;
  reason?: string;
}

function riskLabel(kind: WeatherFusionRiskKind): string {
  return t.weather.weatherFusionRisk[kind];
}

function severityLabel(severity: WeatherFusionSeverity): string {
  return t.weather.weatherFusionSeverity[severity];
}

function sourceLabel(source: WeatherFusionSource): string {
  return t.weather.weatherFusionSource[source];
}

function evidenceLabel(code: WeatherFusionEvidenceCode): string {
  return t.weather.weatherFusionEvidence[code];
}

function evidenceContext(evidence: WeatherFusionEvidence): string {
  const values: string[] = [];
  if (evidence.distanceNm !== null) values.push(t.weather.weatherFusionDistance(formatNumber(evidence.distanceNm, 0)));
  if (evidence.altitudeDeltaFt !== null) values.push(t.weather.weatherFusionAltitudeDelta(formatNumber(evidence.altitudeDeltaFt, 0)));
  if (evidence.observedAt) values.push(formatAge(Math.max(0, (Date.now() - Date.parse(evidence.observedAt)) / 1000)));
  return values.join(" · ");
}

export function AircraftWeatherFusion({ aircraftHex, enabled }: { aircraftHex: string; enabled: boolean }) {
  const [fusion, setFusion] = useState<WeatherFusionResult | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "available" | "unavailable">("idle");

  useEffect(() => {
    if (!enabled) {
      setFusion(null);
      setState("idle");
      return;
    }
    let active = true;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      setState((current) => current === "available" ? current : "loading");
      try {
        const response = await fetch(`/api/aircraft/${encodeURIComponent(aircraftHex)}/weather-fusion`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as FusionApiResponse;
        if (!active || controller.signal.aborted) return;
        if (!response.ok || payload.status !== "available" || !payload.fusion) {
          setFusion(null);
          setState("unavailable");
          return;
        }
        setFusion(payload.fusion);
        setState("available");
      } catch {
        if (active && controller && !controller.signal.aborted) {
          setFusion(null);
          setState("unavailable");
        }
      } finally {
        if (active) timer = setTimeout(() => void load(), 5 * 60_000);
      }
    };

    void load();
    return () => {
      active = false;
      controller?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [aircraftHex, enabled]);

  const significantEvidence = useMemo(
    () => fusion?.evidence.filter((item) => item.severity !== "NONE").slice(0, 6) ?? [],
    [fusion],
  );

  if (!enabled) return null;

  return <section className="aircraft-card aircraft-weather-fusion" aria-labelledby="aircraft-weather-fusion-title">
    <h2 id="aircraft-weather-fusion-title">{t.weather.weatherFusionTitle}</h2>
    <p className="detail-disclaimer">{t.weather.weatherFusionSubtitle}</p>

    {state === "loading" && <p className="aircraft-quick-empty" role="status">{t.weather.weatherFusionLoading}</p>}
    {state === "unavailable" && <p className="aircraft-quick-empty">{t.weather.weatherFusionUnavailable}</p>}

    {fusion && <>
      <div className="aircraft-weather-fusion-overall" data-testid="weather-fusion-overall" data-severity={fusion.overall.severity}>
        <span>{t.weather.weatherFusionOverall}</span>
        <strong>{severityLabel(fusion.overall.severity)}</strong>
        <small>{t.weather.weatherFusionConfidenceLabel}: {t.weather.weatherFusionConfidence[fusion.overall.confidence]}</small>
      </div>

      {fusion.status !== "AVAILABLE" && <p className="detail-disclaimer">{t.weather.weatherFusionPartial}</p>}

      <div className="aircraft-weather-fusion-risks">
        {fusion.risks.map((risk) => <div key={risk.kind} className="aircraft-weather-fusion-risk" data-risk={risk.kind} data-severity={risk.severity}>
          <span>{riskLabel(risk.kind)}</span>
          <strong>{severityLabel(risk.severity)}</strong>
          <small>{t.weather.weatherFusionConfidence[risk.confidence]} · {risk.evidenceCount}</small>
        </div>)}
      </div>

      <div className="aircraft-weather-fusion-wind" data-status={fusion.wind.status}>
        <span>{t.weather.weatherFusionWindTitle}</span>
        <strong>{t.weather.weatherFusionWindStatus[fusion.wind.status]}</strong>
        {fusion.wind.speedDeltaKt !== null && fusion.wind.directionDeltaDeg !== null && <small>
          {t.weather.weatherFusionWindDelta(formatNumber(fusion.wind.speedDeltaKt, 0), formatNumber(fusion.wind.directionDeltaDeg, 0))}
        </small>}
      </div>

      {significantEvidence.length > 0 && <div className="aircraft-weather-fusion-evidence">
        <h3>{t.weather.weatherFusionEvidenceTitle}</h3>
        {significantEvidence.map((item) => <div key={item.id} className="aircraft-weather-fusion-evidence-row">
          <span><strong>{evidenceLabel(item.code)}</strong><small>{sourceLabel(item.source)}</small></span>
          <span><strong>{severityLabel(item.severity)}</strong><small>{evidenceContext(item)}</small></span>
        </div>)}
      </div>}

      <div className="aircraft-weather-fusion-sources">
        <h3>{t.weather.weatherFusionSourcesTitle}</h3>
        <div>
          {fusion.sources.map((source) => <span key={source.source} data-state={source.state}>
            {sourceLabel(source.source)} · {t.weather.weatherFusionSourceState[source.state]}
          </span>)}
        </div>
      </div>

      <p className="detail-disclaimer">{t.weather.weatherFusionDisclaimer}</p>
    </>}
  </section>;
}
