"use client";

import { useEffect, useState } from "react";
import { ContextBadge, MetricCard, MetricStrip } from "@/components/ui-primitives";
import type { AirportWeatherResponse } from "@/components/airport-weather";
import type { AirportMovement } from "@/lib/server/airport-movements";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
import { formatSpeed, formatTime, formatTrack, t } from "@/lib/i18n";

function movementLabel(movement: AirportMovement["movement"]): string {
  return {
    APPROACH: t.airport.movementApproach,
    LANDING: t.airport.movementLanding,
    TAKEOFF: t.airport.movementTakeoff,
    DEPARTURE: t.airport.movementDeparture,
    GO_AROUND: t.airport.movementGoAround,
    HOLDING: t.airport.movementHolding,
    OVERFLIGHT: t.airport.movementOverflight,
  }[movement];
}

function activityLabel(activity: AirportOperationsResponse["activity"]): string {
  return {
    QUIET: t.airport.operationalQuiet,
    LIGHT: t.airport.operationalLight,
    MODERATE: t.airport.operationalModerate,
    BUSY: t.airport.operationalBusy,
  }[activity];
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <MetricCard label={label} value={value} detail={detail} className="airport-operation-metric" />;
}

export function AirportOperationalSummary({ airport }: { airport: { icaoCode: string } }) {
  const [operations, setOperations] = useState<AirportOperationsResponse | null>(null);
  const [weather, setWeather] = useState<AirportWeatherResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(`/api/airports/${encodeURIComponent(airport.icaoCode)}/operations?period=24h`, { cache: "no-store", signal: controller.signal })
        .then((response) => response.ok ? response.json() as Promise<AirportOperationsResponse> : null),
      fetch(`/api/weather/airport/${encodeURIComponent(airport.icaoCode)}`, { cache: "no-store", signal: controller.signal })
        .then((response) => response.ok ? response.json() as Promise<AirportWeatherResponse> : null),
    ]).then(([nextOperations, nextWeather]) => {
      if (!controller.signal.aborted) {
        setOperations(nextOperations);
        setWeather(nextWeather);
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setOperations(null);
        setWeather(null);
      }
    });
    return () => controller.abort();
  }, [airport.icaoCode]);

  const metar = weather?.metar ?? null;
  const wind = metar && !metar.windVariable && !metar.windCalm && metar.windDirectionDeg !== null && metar.windSpeedKt !== null
    ? `${formatTrack(metar.windDirectionDeg)} / ${formatSpeed(metar.windSpeedKt)}`
    : null;
  const latest = operations?.recentMovements[0] ?? null;
  const latestValue = latest ? movementLabel(latest.movement) : t.airport.operationalAwaiting;

  return <section className="airport-operations-summary" aria-labelledby="airport-operations-summary-title">
    <div className="airport-operations-heading">
      <div>
        <div className="ui-kicker">{t.airport.operationsSummary}</div>
        <h2 id="airport-operations-summary-title">{airport.icaoCode}</h2>
      </div>
      <ContextBadge variant="inferred">{t.airport.operationalInferred}</ContextBadge>
    </div>
    <MetricStrip className="airport-operations-metrics">
      <SummaryMetric label={t.airport.operationalActivity} value={operations ? activityLabel(operations.activity) : "—"} detail={operations?.window ?? t.airport.operationalAwaiting} />
      <SummaryMetric label={t.airport.operationalArrivals} value={operations ? String(operations.arrivals.length) : "—"} />
      <SummaryMetric label={t.airport.operationalDepartures} value={operations ? String(operations.departures.length) : "—"} />
      <SummaryMetric label={t.airport.operationalApproach} value={operations ? String(operations.approaches.length) : "—"} />
      <SummaryMetric label={t.airport.operationalRunway} value={operations?.likelyRunway ? `RWY ${operations.likelyRunway.designator}` : "—"} detail={operations?.likelyRunway ? `${operations.likelyRunway.confidence} · n=${operations.likelyRunway.sampleCount}` : t.airport.operationalNoRunway} />
      <SummaryMetric label={t.airport.operationalWind} value={wind ?? "—"} detail={metar?.flightCategory ?? t.airport.operationalNoWind} />
      <SummaryMetric label={t.airport.operationalLatest} value={latest ? latestValue : "—"} detail={latest ? `${latest.callsign ?? latest.icaoHex} · ${formatTime(latest.observedAt)}` : t.airport.operationalAwaiting} />
    </MetricStrip>
  </section>;
}
