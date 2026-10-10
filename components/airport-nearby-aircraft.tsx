"use client";

import Link from "next/link";
import { useState } from "react";
import { visualSystemV5EText } from "@/lib/i18n/visual-system-v5-e";
import { formatAltitude, formatDistance, t } from "@/lib/i18n";
import type { AirportTrafficObservation } from "@/lib/airport-traffic/live";
import type { AirportLiveTrafficControllerState } from "@/components/airport-live-traffic-controller";

function movementLabel(observation: AirportTrafficObservation): string {
  if (observation.classification === "approaching") return t.airport.approaching;
  if (observation.classification === "departing") return t.airport.departing;
  if (observation.classification === "overflying") return t.airport.overflying;
  return t.airport.unknownMovement;
}

export function AirportNearbyAircraft({ liveTraffic }: { liveTraffic: AirportLiveTrafficControllerState }) {
  const { observations, connected } = liveTraffic;
  const copy = visualSystemV5EText(t.locale);
  const [movement, setMovement] = useState<"all" | "approaching" | "departing">("all");
  const displayed = movement === "all" ? observations : observations.filter((item) => item.classification === movement);
  const filters = [
    { key: "all", label: copy.airportNearbyAll, count: observations.length },
    { key: "approaching", label: copy.airportNearbyArrivals, count: observations.filter((item) => item.classification === "approaching").length },
    { key: "departing", label: copy.airportNearbyDepartures, count: observations.filter((item) => item.classification === "departing").length },
  ] as const;

  return <section className="airport-card airport-nearby-aircraft-card" aria-labelledby="airport-nearby-aircraft-title">
    <div className="airport-section-heading">
      <div>
        <h2 id="airport-nearby-aircraft-title">{t.airport.nearbyAircraft}</h2>
        <p>{t.airport.nearbyAircraftDescription}</p>
      </div>
      {connected && <span className="live-badge">{t.status.liveShort}</span>}
    </div>
    {observations.length > 0 && <div className="airport-v5-nearby-filters" role="group" aria-label={t.airport.nearbyAircraft} data-testid="airport-v5-nearby-filters">
      {filters.map((option) => <button key={option.key} type="button" aria-pressed={movement === option.key} onClick={() => setMovement(option.key)}>{option.label} <span>{option.count}</span></button>)}
    </div>}
    {displayed.length === 0 ? <div className="airport-traffic-message">{observations.length === 0 && !connected ? t.airport.nearbyAircraftUnavailable : t.airport.nearbyAircraftEmpty}</div> : <ol className="airport-nearby-aircraft-list">
      {displayed.map((observation) => {
        const aircraft = observation.aircraft;
        const label = aircraft.callsign || aircraft.registration || aircraft.icaoHex;
        return <li key={aircraft.icaoHex}>
          <Link href={`/aircraft/${encodeURIComponent(aircraft.icaoHex)}`} className="airport-nearby-aircraft-link">
            <strong>{label}</strong>
            <small>{aircraft.aircraftType || aircraft.aircraftDescription || aircraft.icaoHex}</small>
          </Link>
          <span className="airport-nearby-aircraft-meta"><span>{formatDistance(observation.distanceKm)}</span><span>{formatAltitude(aircraft.altitude)}</span><span>{movementLabel(observation)}</span></span>
          <Link href={`/?aircraft=${encodeURIComponent(aircraft.icaoHex)}`} className="airport-v5-radar-link" title={copy.airportRadarHint} aria-label={`${copy.airportRadarLink}: ${label}`}>{copy.airportRadarLink} ↗</Link>
        </li>;
      })}
    </ol>}
  </section>;
}
