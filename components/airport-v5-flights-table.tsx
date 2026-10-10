"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AirportOperationsView } from "@/lib/airport-v5-views";
import type { AirportMovement, AirportMovementKind } from "@/lib/server/airport-movements";
import { aircraftFlightHref } from "@/lib/aircraft/detail-links";
import { formatDateTime, t } from "@/lib/i18n";

type FlightBoardView = Extract<AirportOperationsView, "arrivals" | "departures">;

const MOVEMENT_LABELS: Record<AirportMovementKind, keyof typeof t.airport> = {
  APPROACH: "movementApproach",
  LANDING: "movementLanding",
  TAKEOFF: "movementTakeoff",
  DEPARTURE: "movementDeparture",
  GO_AROUND: "movementGoAround",
  HOLDING: "movementHolding",
  OVERFLIGHT: "movementOverflight",
};

interface AirportFlightsTableProps {
  view: FlightBoardView;
  movements: AirportMovement[];
  loading: boolean;
  unavailable: boolean;
  incomplete: boolean;
  lastUpdated: string | null;
}

/** Observed movements only. These times are not scheduled/estimated arrivals. */
export function AirportFlightsTable({ view, movements, loading, unavailable, incomplete, lastUpdated }: AirportFlightsTableProps) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<AirportMovementKind | "all">("all");
  const types = useMemo(() => Array.from(new Set(movements.map((item) => item.movement))).sort(), [movements]);
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return movements
      .filter((item) => (kind === "all" || item.movement === kind)
        && (!term || [item.callsign, item.registration, item.icaoHex].some((value) => value?.toLocaleLowerCase().includes(term))))
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
      .slice(0, 50);
  }, [kind, movements, search]);

  return <section className="airport-v5-flights" data-testid="airport-v5-flights-table" data-view={view}>
    <div className="airport-v5-flights-heading">
      <div>
        <span className="ui-kicker">{t.airportV5.observedBoard}</span>
        <h2>{t.airportV5.tabs[view]}</h2>
        <p>{t.airportV5.incompleteData}</p>
      </div>
      <span className="airport-v5-flights-count">{movements.length} / 24 h</span>
    </div>
    <div className="airport-v5-filters">
      <label>
        <span>{t.airportV5.searchFlights}</span>
        <input type="search" value={search} placeholder={t.airportV5.searchPlaceholder} onChange={(event) => setSearch(event.target.value)} data-testid="airport-v5-flight-search" />
      </label>
      <label>
        <span>{t.airportV5.movementFilter}</span>
        <select value={kind} onChange={(event) => setKind(event.target.value as AirportMovementKind | "all")} data-testid="airport-v5-movement-filter">
          <option value="all">{t.airportV5.allMovements}</option>
          {types.map((type) => <option value={type} key={type}>{t.airport[MOVEMENT_LABELS[type]]}</option>)}
        </select>
      </label>
    </div>
    {lastUpdated && <p className="airport-v5-updated">{t.airport.liveBoardUpdated}: {formatDateTime(lastUpdated)}</p>}
    {loading ? <p role="status" className="airport-v3-empty">{t.common.loading}</p>
      : unavailable ? <p role="status" className="airport-v3-empty">{t.airport.movementUnavailable}</p>
        : rows.length === 0 ? <p role="status" className="airport-v3-empty">{t.airportV5.noFlights}</p>
          : <div className="airport-v5-table-scroll"><table>
            <thead><tr>
              <th scope="col">{t.airportV5.timeObserved}</th>
              <th scope="col">{t.airportV5.flight}</th>
              <th scope="col">{t.airportV5.movement}</th>
              <th scope="col">{t.airportV5.runway}</th>
              <th scope="col">{t.airportV5.evidence}</th>
            </tr></thead>
            <tbody>{rows.map((movement) => <tr key={`${movement.flightId}:${movement.movement}:${movement.observedAt}`}>
              <td><time dateTime={movement.observedAt}>{formatDateTime(movement.observedAt)}</time></td>
              <td><Link href={aircraftFlightHref(movement.flightId)}><strong>{movement.callsign || movement.registration || movement.icaoHex}</strong><small>{movement.registration || movement.icaoHex}</small></Link></td>
              <td><span className="airport-v5-movement-pill" data-movement={movement.movement}>{t.airport[MOVEMENT_LABELS[movement.movement]]}</span></td>
              <td>{movement.runway?.designator ? `RWY ${movement.runway.designator}` : t.common.emptyValue}{movement.runway?.status === "probable" && <small>{t.airport.v3ReceiverInferred}</small>}</td>
              <td><span className={`airport-v3-confidence ${movement.confidence}`}>{movement.confidence === "high" ? t.airport.v3ConfidenceHigh : movement.confidence === "medium" ? t.airport.v3ConfidenceMedium : t.airport.v3ConfidenceLow}</span></td>
            </tr>)}</tbody>
          </table></div>}
    {incomplete && <p className="airport-v3-disclaimer" role="status">{t.airport.v3Incomplete} · {t.airportV5.incompleteData}</p>}
  </section>;
}
