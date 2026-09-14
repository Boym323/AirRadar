"use client";

import { useEffect, useState } from "react";
import { formatTime, t, type LocaleDictionary } from "@/lib/i18n";
import type { AirportMovement, AirportMovementsResponse } from "@/lib/server/airport-movements";

function movementLabel(movement: AirportMovement["movement"]): string {
  return {
    APPROACH: t.airport.movementApproach,
    LANDING: t.airport.movementLanding,
    TAKEOFF: t.airport.movementTakeoff,
    DEPARTURE: t.airport.movementDeparture,
    OVERFLIGHT: t.airport.movementOverflight,
  }[movement];
}

export function movementRunwayLabel(
  movement: Pick<AirportMovement, "movement" | "runway">,
  dictionary: LocaleDictionary = t,
): string {
  if (movement.movement === "OVERFLIGHT") return "—";
  return movement.runway?.designator ? `RWY ${movement.runway.designator}` : dictionary.airport.unknownRunway;
}

export const AIRPORT_MOVEMENT_PERIODS = ["today", "24h", "7d"] as const;
export type AirportMovementPeriodOption = (typeof AIRPORT_MOVEMENT_PERIODS)[number];

function periodLabel(period: AirportMovementPeriodOption): string {
  return { today: t.airport.movementPeriodToday, "24h": t.airport.movementPeriod24h, "7d": t.airport.movementPeriodSevenDays }[period];
}

export function AirportMovements({ airport }: { airport: { icaoCode: string } }) {
  const [period, setPeriod] = useState<AirportMovementPeriodOption>("24h");
  const [data, setData] = useState<AirportMovementsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setFailed(false);
    setExpanded(false);
    void fetch(`/api/airports/${encodeURIComponent(airport.icaoCode)}/movements?period=${period}`, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("movement request failed");
        return response.json() as Promise<AirportMovementsResponse>;
      })
      .then((next) => setData(next))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true); });
    return () => controller.abort();
  }, [airport.icaoCode, period]);

  const visibleMovements = data?.movements.slice(0, expanded ? undefined : 10) ?? [];
  const selectedPeriod = periodLabel(period);

  return <section className="airport-card airport-movements-card" aria-labelledby="airport-movements-title">
    <div className="airport-section-heading">
      <div className="airport-movement-title-row"><h2 id="airport-movements-title">{t.airport.movementIntelligenceTitle}</h2><strong>{selectedPeriod}</strong></div>
      <p>{t.airport.movementIntelligenceDescription}</p>
      <div className="airport-movement-periods" role="group" aria-label={t.airport.movementPeriodSelector}>
        {AIRPORT_MOVEMENT_PERIODS.map((option) => <button key={option} type="button" aria-pressed={period === option} onClick={() => setPeriod(option)}>{periodLabel(option)}</button>)}
      </div>
    </div>
    {data && (data.complete === false || data.truncated === true) && <p className="airport-movement-truncated">{t.airport.movementIncomplete}</p>}
    {failed ? <div className="airport-infrastructure-empty">{t.airport.movementUnavailable}</div> : !data ? <div className="airport-infrastructure-empty">{t.airport.movementLoading}</div> : data.movements.length === 0 ? <div className="airport-infrastructure-empty">{t.airport.movementNoData}</div> : <>
      <div className="airport-movement-summary">
        <div><strong>{data.summary.landings}</strong><span>{t.airport.movementLandings}</span></div>
        <div><strong>{data.summary.takeoffs}</strong><span>{t.airport.movementTakeoffs}</span></div>
        <div><strong>{data.summary.departures}</strong><span>{t.airport.movementDepartures}</span></div>
        <div><strong>{data.summary.overflights}</strong><span>{t.airport.movementOverflights}</span></div>
      </div>
      <div className="airport-movement-grid">
        <div>
          <h3>{t.airport.recentMovements}</h3>
          <ol className="airport-movement-list">
            {visibleMovements.map((movement) => <li key={`${movement.flightId}-${movement.observedAt}`}>
              <time dateTime={movement.observedAt}>{formatTime(movement.observedAt)}</time>
              <span>{movement.callsign || movement.icaoHex}</span>
              <strong>{movementLabel(movement.movement)}</strong>
              <small>{movementRunwayLabel(movement)} · {movement.confidence}</small>
            </li>)}
          </ol>
          {data.movements.length > 10 && <button className="airport-movement-show-more" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? t.airport.showLess : t.airport.showMore}</button>}
        </div>
        <div>
          <h3>{t.airport.probableRunwayUsage}</h3>
          <ul className="airport-runway-usage-list">
            {data.summary.probableRunways.map((runway) => <li key={runway.designator}><strong>RWY {runway.designator}</strong><span>{runway.count}</span></li>)}
            <li><strong>{t.airport.unknownRunway}</strong><span>{data.summary.unknownRunwayMovements}</span></li>
          </ul>
        </div>
      </div>
    </>}
    <p className="airport-movement-disclaimer">{t.airport.movementDisclaimer}</p>
  </section>;
}
