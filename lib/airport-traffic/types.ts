export type AirportTrafficRange = "7d" | "30d";

export interface AirportTrafficAirport {
  icaoCode: string;
  iataCode: string | null;
}

export interface AirportTrafficCount {
  count: number;
}

export interface AirportTrafficRouteCount extends AirportTrafficCount {
  airport: AirportTrafficAirport;
}

export interface AirportTrafficAircraftCount extends AirportTrafficCount {
  icaoHex: string;
  registration: string | null;
  aircraftType: string | null;
}

export interface AirportTrafficCallsignCount extends AirportTrafficCount {
  callsign: string;
}

export interface AirportTrafficHeatmapCell {
  dayOfWeek: number;
  hour: number;
  arrivals: number;
  departures: number;
}

export type AirportTrafficDirection = "arrival" | "departure";

export interface AirportTrafficRecentFlight {
  id: number;
  time: string;
  direction: AirportTrafficDirection;
  callsign: string | null;
  aircraft: {
    icaoHex: string;
    registration: string | null;
  };
  otherAirport: AirportTrafficAirport | null;
}

export interface AirportTrafficSummary {
  range: AirportTrafficRange;
  /** False when one of the bounded route queries exceeded its safe row cap. */
  complete: boolean;
  flights: number;
  departures: number;
  arrivals: number;
  uniqueAircraft: number;
  activeDays: number;
  firstCapturedAt: string | null;
  lastCapturedAt: string | null;
  topDestinations: AirportTrafficRouteCount[];
  topOrigins: AirportTrafficRouteCount[];
  topAircraft: AirportTrafficAircraftCount[];
  topCallsigns: AirportTrafficCallsignCount[];
  recentTraffic: AirportTrafficRecentFlight[];
  /** Route match plus bounded receiver-proximity evidence; never an official movement log. */
  observedArrivals: AirportTrafficRecentFlight[];
  observedDepartures: AirportTrafficRecentFlight[];
  heatmap: {
    cells: AirportTrafficHeatmapCell[];
    maxCount: number;
  };
}
