import type { AircraftView } from "@/lib/aircraft/types";

export type AircraftStatusFilter = "all" | "airborne" | "onGround";

export interface MapAircraftFilters {
  status: AircraftStatusFilter;
  minAltitude: string;
  maxAltitude: string;
  callsign: string;
  registration: string;
  icaoHex: string;
  aircraftType: string;
  operator: string;
  emergencyOnly: boolean;
}

export const DEFAULT_MAP_AIRCRAFT_FILTERS: MapAircraftFilters = {
  status: "all",
  minAltitude: "",
  maxAltitude: "",
  callsign: "",
  registration: "",
  icaoHex: "",
  aircraftType: "",
  operator: "",
  emergencyOnly: false,
};

function normalized(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function numericFilter(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function includesFilter(candidate: string | null | undefined, query: string): boolean {
  const normalizedQuery = normalized(query);
  return !normalizedQuery || normalized(candidate).includes(normalizedQuery);
}

function registrationForAircraft(aircraft: AircraftView): string | null {
  return aircraft.registration ?? aircraft.enrichment?.metadata?.registration ?? null;
}

function aircraftTypeForAircraft(aircraft: AircraftView): string | null {
  return aircraft.enrichment?.metadata?.icaoTypeCode
    ?? aircraft.aircraftType
    ?? aircraft.enrichment?.metadata?.aircraftType
    ?? null;
}

function operatorForAircraft(aircraft: AircraftView): string | null {
  return aircraft.enrichment?.metadata?.operator ?? null;
}

export function isMapAircraftFilterActive(filters: MapAircraftFilters): boolean {
  return filters.status !== "all"
    || filters.minAltitude.trim() !== ""
    || filters.maxAltitude.trim() !== ""
    || filters.callsign.trim() !== ""
    || filters.registration.trim() !== ""
    || filters.icaoHex.trim() !== ""
    || filters.aircraftType.trim() !== ""
    || filters.operator.trim() !== ""
    || filters.emergencyOnly;
}

export function matchesMapAircraftFilters(aircraft: AircraftView, filters: MapAircraftFilters): boolean {
  if (filters.status === "airborne" && aircraft.onGround) return false;
  if (filters.status === "onGround" && !aircraft.onGround) return false;

  const altitude = aircraft.altitude;
  const minimumAltitude = numericFilter(filters.minAltitude);
  const maximumAltitude = numericFilter(filters.maxAltitude);
  if (minimumAltitude !== null && (altitude === null || altitude < minimumAltitude)) return false;
  if (maximumAltitude !== null && (altitude === null || altitude > maximumAltitude)) return false;

  if (!includesFilter(aircraft.callsign, filters.callsign)) return false;
  if (!includesFilter(registrationForAircraft(aircraft), filters.registration)) return false;
  if (!includesFilter(aircraft.icaoHex, filters.icaoHex)) return false;
  if (!includesFilter(aircraftTypeForAircraft(aircraft), filters.aircraftType)) return false;
  if (!includesFilter(operatorForAircraft(aircraft), filters.operator)) return false;
  if (filters.emergencyOnly && !aircraft.emergency) return false;
  return true;
}

export function filterAircraftForMap(aircraft: readonly AircraftView[], filters: MapAircraftFilters): AircraftView[] {
  return aircraft.filter((item) => matchesMapAircraftFilters(item, filters));
}
