"use client";

import Link from "next/link";
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

  return <section className="airport-card airport-nearby-aircraft-card" aria-labelledby="airport-nearby-aircraft-title">
    <div className="airport-section-heading">
      <div>
        <h2 id="airport-nearby-aircraft-title">{t.airport.nearbyAircraft}</h2>
        <p>{t.airport.nearbyAircraftDescription}</p>
      </div>
      {connected && <span className="live-badge">{t.status.liveShort}</span>}
    </div>
    {observations.length === 0 ? <div className="airport-traffic-message">{connected ? t.airport.nearbyAircraftEmpty : t.airport.nearbyAircraftUnavailable}</div> : <ol className="airport-nearby-aircraft-list">
      {observations.map((observation) => {
        const aircraft = observation.aircraft;
        const label = aircraft.callsign || aircraft.registration || aircraft.icaoHex;
        return <li key={aircraft.icaoHex}>
          <Link href={`/aircraft/${encodeURIComponent(aircraft.icaoHex)}`} className="airport-nearby-aircraft-link">
            <strong>{label}</strong>
            <small>{aircraft.aircraftType || aircraft.aircraftDescription || aircraft.icaoHex}</small>
          </Link>
          <span className="airport-nearby-aircraft-meta"><span>{formatDistance(observation.distanceKm)}</span><span>{formatAltitude(aircraft.altitude)}</span><span>{movementLabel(observation)}</span></span>
        </li>;
      })}
    </ol>}
  </section>;
}
