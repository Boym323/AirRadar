export type AirspaceActivityStatus = "ok" | "stale" | "unavailable";
export type PlannedAirspaceWindowSource = "AUP" | "UUP";

export interface PlannedAirspaceWindow {
  sequence: number;
  designator: string;
  canonicalDesignator: string;
  lowerLimit: string;
  upperLimit: string;
  startsAt: string;
  endsAt: string;
  responsibleUnit: string | null;
  activity: string | null;
  plannedNow: boolean;
  source: PlannedAirspaceWindowSource;
  sourceReference: string;
}

export interface AirspacePlanSnapshot {
  status: AirspaceActivityStatus;
  validityStart: string | null;
  validityEnd: string | null;
  issuedAt: string | null;
  aupReference: string | null;
  latestUupReference: string | null;
  uupCount: number;
  fetchedAt: string;
  windows: PlannedAirspaceWindow[];
}

export interface ActualAirspaceActivation {
  designator: string;
  canonicalDesignator: string;
  name: string | null;
  startsAt: string;
  endsAt: string;
  lowerLimit: string;
  upperLimit: string;
}

export interface HistoricalAirspaceActivitySnapshot {
  status: AirspaceActivityStatus;
  delayed: true;
  periodStart: string | null;
  periodEnd: string | null;
  sourceReference: string | null;
  fetchedAt: string;
  records: ActualAirspaceActivation[];
}

export interface AirspaceActivityResponse {
  fetchedAt: string;
  planned: AirspacePlanSnapshot;
  historicalActual: HistoricalAirspaceActivitySnapshot;
  disclaimer: string;
}
