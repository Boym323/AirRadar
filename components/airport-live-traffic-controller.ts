"use client";

import { useEffect, useRef, useState } from "react";
import type { Airport } from "@/lib/airports/types";
import type { PublicStateSnapshot } from "@/lib/aircraft/types";
import {
  nearbyAirportAircraft,
  type AirportTrafficObservation,
} from "@/lib/airport-traffic/live";

export interface AirportLiveTrafficControllerState {
  observations: AirportTrafficObservation[];
  connected: boolean;
  receivedAt: string | null;
}

export function useAirportLiveTrafficController(
  airport: Pick<Airport, "latitude" | "longitude">,
): AirportLiveTrafficControllerState {
  const [observations, setObservations] = useState<AirportTrafficObservation[]>([]);
  const [connected, setConnected] = useState(false);
  const [receivedAt, setReceivedAt] = useState<string | null>(null);
  const previousDistances = useRef(new Map<string, number>());

  useEffect(() => {
    const source = new EventSource("/api/stream");
    setConnected(false);
    setObservations([]);
    setReceivedAt(null);
    previousDistances.current.clear();

    const handleSnapshot = (event: Event) => {
      try {
        const snapshot = JSON.parse((event as MessageEvent<string>).data) as PublicStateSnapshot;
        const next = nearbyAirportAircraft(
          snapshot.aircraft,
          airport,
          previousDistances.current,
        );
        setObservations(next);
        previousDistances.current = new Map(
          next.map((item) => [item.aircraft.icaoHex, item.distanceKm]),
        );
        setConnected(true);
        setReceivedAt(snapshot.fetchedAt);
      } catch {
        // Isolate malformed live events without replacing the last valid snapshot.
      }
    };

    source.addEventListener("snapshot", handleSnapshot);
    source.onerror = () => setConnected(false);

    return () => {
      source.removeEventListener("snapshot", handleSnapshot);
      source.close();
    };
  }, [airport.latitude, airport.longitude]);

  return { observations, connected, receivedAt };
}
