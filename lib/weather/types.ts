export type WindDirection = number | "VRB";

export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR";

export interface MetarCloudLayer {
  cover: string;
  baseFtAgl: number | null;
  topFtAgl?: number | null;
}

export interface TafCloudLayer {
  cover: string;
  baseFtAgl: number | null;
  topFtAgl?: number | null;
}

export interface MetarObservation {
  stationId?: string;
  rawText: string | null;
  observationTime: string | null;
  observedAt?: string | null;
  temperatureC: number | null;
  dewpointC: number | null;
  windDirectionDeg: number | null;
  windVariable: boolean;
  windSpeedKt: number | null;
  windGustKt: number | null;
  visibilityMeters: number | null;
  visibilityGreaterThan: boolean;
  visibilityLessThan?: boolean;
  altimeterHpa: number | null;
  flightCategory: FlightCategory | null;
  clouds?: MetarCloudLayer[];
  weather?: string[];
  latitude?: number | null;
  longitude?: number | null;
  fetchedAt?: string;
  stale?: boolean;
}

export interface TafForecast {
  rawText: string | null;
  issueTime: string | null;
  issuedAt?: string | null;
  validFrom: string | null;
  validTo: string | null;
  stationId?: string;
  periods?: TafPeriod[];
  fetchedAt?: string;
  stale?: boolean;
}

export interface TafPeriod {
  from: string | null;
  to: string | null;
  changeIndicator: string | null;
  probability: number | null;
  windDirectionDeg: number | null;
  windVariable: boolean;
  windSpeedKt: number | null;
  windGustKt: number | null;
  visibilityMeters: number | null;
  visibilityGreaterThan: boolean;
  visibilityLessThan?: boolean;
  clouds: TafCloudLayer[];
  weather: string[];
  flightCategory: FlightCategory | null;
}

export interface AirportWeather {
  icaoCode: string;
  metar: MetarObservation | null;
  taf: TafForecast | null;
  fetchedAt: string;
  stale: boolean;
  enabled?: boolean;
  source?: "Aviation Weather Center";
}

export type SigmetGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface AviationSigmet {
  id: string;
  issuingOffice: string | null;
  firId: string | null;
  firName: string | null;
  phenomenon: string | null;
  hazard: string | null;
  qualifier: string | null;
  validFrom: string | null;
  validTo: string | null;
  lowerFt: number | null;
  upperFt: number | null;
  seriesId: string | null;
  rawText: string | null;
  geometry: SigmetGeometry;
  source: "isigmet" | "airsigmet";
  fetchedAt: string;
}

export interface SigmetSnapshot {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    properties: Omit<AviationSigmet, "geometry">;
    geometry: SigmetGeometry;
  }>;
  fetchedAt: string;
  stale: boolean;
}
