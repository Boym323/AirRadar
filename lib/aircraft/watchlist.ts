import type { Aircraft, AircraftView } from "@/lib/aircraft/types";

export type AircraftRuleType =
  | "icaoHex"
  | "registration"
  | "callsign"
  | "callsignPattern"
  | "aircraftType"
  | "airline";

export interface AircraftMatchRule {
  type: AircraftRuleType;
  value: string;
  maxDistanceKm?: number;
}

type AircraftLike = Aircraft | AircraftView;

function normalized(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function airlineForAircraft(aircraft: AircraftLike): string | null {
  return aircraft.enrichment?.route?.airline ?? aircraft.enrichment?.metadata?.operator ?? null;
}

/** The browser and server both use `*` as the only wildcard character. */
export function isValidWildcardPattern(value: string): boolean {
  return value.trim().length > 0 && !(/[?\[\]{}()+|.^$\\]/.test(value));
}

export function wildcardPattern(value: string): RegExp | null {
  if (!isValidWildcardPattern(value)) return null;
  const escaped = value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("\\*", ".*");
  return new RegExp(`^${escaped}$`, "i");
}

export function normalizeAircraftRuleType(value: string): AircraftRuleType | null {
  const aliases: Record<string, AircraftRuleType> = {
    icao: "icaoHex",
    icaoHex: "icaoHex",
    registration: "registration",
    callsign: "callsign",
    pattern: "callsignPattern",
    callsignPattern: "callsignPattern",
    type: "aircraftType",
    aircraftType: "aircraftType",
    airline: "airline",
  };
  return aliases[value] ?? null;
}

export function matchesAircraftRule(aircraft: AircraftLike, rule: AircraftMatchRule): boolean {
  const value = normalized(rule.value);
  if (!value) return false;
  if (rule.maxDistanceKm !== undefined && (aircraft.distanceKm === null || aircraft.distanceKm > rule.maxDistanceKm)) return false;

  switch (rule.type) {
    case "icaoHex":
      return normalized(aircraft.icaoHex) === value;
    case "registration":
      return normalized(aircraft.registration ?? aircraft.enrichment?.metadata?.registration) === value;
    case "callsign":
      return normalized(aircraft.callsign) === value;
    case "callsignPattern":
      return Boolean(aircraft.callsign && wildcardPattern(value)?.test(aircraft.callsign));
    case "aircraftType":
      return normalized(aircraft.enrichment?.metadata?.icaoTypeCode ?? aircraft.aircraftType) === value;
    case "airline":
      return normalized(airlineForAircraft(aircraft)) === value;
  }
}
