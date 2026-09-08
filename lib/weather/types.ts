export type WindDirection = number | "VRB";

export interface MetarObservation {
  rawText: string | null;
  observationTime: string | null;
  temperatureC: number | null;
  dewpointC: number | null;
  windDirectionDeg: number | null;
  windVariable: boolean;
  windSpeedKt: number | null;
  windGustKt: number | null;
  visibilityMeters: number | null;
  visibilityGreaterThan: boolean;
  altimeterHpa: number | null;
  flightCategory: string | null;
}

export interface TafForecast {
  rawText: string | null;
  issueTime: string | null;
  validFrom: string | null;
  validTo: string | null;
}

export interface AirportWeather {
  icaoCode: string;
  metar: MetarObservation | null;
  taf: TafForecast | null;
  fetchedAt: string;
  stale: boolean;
}
