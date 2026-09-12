"use client";

import { useEffect, useState } from "react";
import { formatTime, t } from "@/lib/i18n";
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

export function AirportMovements({ airport }: { airport: { icaoCode: string } }) {
  const [data, setData] = useState<AirportMovementsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setFailed(false);
    void fetch(`/api/airports/${encodeURIComponent(airport.icaoCode)}/movements?period=24h`, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("movement request failed");
        return response.json() as Promise<AirportMovementsResponse>;
      })
      .then((next) => setData(next))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true); });
    return () => controller.abort();
  }, [airport.icaoCode]);

  return <section className="airport-card airport-movements-card" aria-labelledby="airport-movements-title">
    <div className="airport-section-heading">
      <h2 id="airport-movements-title">{t.airport.movementIntelligenceTitle}</h2>
      <p>{t.airport.movementIntelligenceDescription}</p>
    </div>
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
            {data.movements.slice(0, 10).map((movement) => <li key={`${movement.flightId}-${movement.observedAt}`}>
              <time dateTime={movement.observedAt}>{formatTime(movement.observedAt)}</time>
              <span>{movement.callsign || movement.icaoHex}</span>
              <strong>{movementLabel(movement.movement)}</strong>
              <small>{movement.runway?.designator ? `RWY ${movement.runway.designator}` : t.airport.unknownRunway} · {movement.confidence}</small>
            </li>)}
          </ol>
        </div>
        <div>
          <h3>{t.airport.probableRunwayUsage}</h3>
          <ul className="airport-runway-usage-list">
            {data.summary.probableRunways.map((runway) => <li key={runway.designator}><strong>RWY {runway.designator}</strong><span>{runway.count}</span></li>)}
            <li><strong>{t.airport.unknownRunway}</strong><span>{Math.max(0, data.movements.length - data.summary.probableRunways.reduce((sum, runway) => sum + runway.count, 0))}</span></li>
          </ul>
        </div>
      </div>
      {!data.complete && <p className="airport-movement-truncated">{t.airport.movementIncomplete}</p>}
    </>}
    <p className="airport-movement-disclaimer">{t.airport.movementDisclaimer}</p>
  </section>;
}
