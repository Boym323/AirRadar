import type { Aircraft } from "@/lib/aircraft/types";

export interface AircraftDurableValues {
  registration: string | null;
  registrationCountry: string | null;
  registrationCountryCode: string | null;
  aircraftType: string | null;
  manufacturer: string | null;
  model: string | null;
  operator: string | null;
}

function durableText(value: string | null | undefined, uppercase = false): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  return uppercase ? normalized.toUpperCase() : normalized;
}

function preferredText(primary: string | null | undefined, fallback: string | null | undefined, uppercase = false): string | null {
  return durableText(primary, uppercase) ?? durableText(fallback, uppercase);
}

export function aircraftDurableValues(item: Aircraft): AircraftDurableValues {
  const metadata = item.enrichment?.metadata;
  return {
    registration: preferredText(item.registration, metadata?.registration, true),
    registrationCountry: durableText(metadata?.registrationCountry),
    registrationCountryCode: durableText(metadata?.registrationCountryCode, true),
    aircraftType: preferredText(item.aircraftType, metadata?.icaoTypeCode, true),
    manufacturer: durableText(metadata?.manufacturer),
    model: durableText(metadata?.aircraftDescription),
    operator: durableText(metadata?.operator),
  };
}

export function changedAircraftValues(current: AircraftDurableValues, next: AircraftDurableValues): Record<string, string | null> {
  const changes: Record<string, string | null> = {};
  for (const field of Object.keys(next) as Array<keyof AircraftDurableValues>) {
    if (next[field] !== current[field]) changes[field] = next[field];
  }
  return changes;
}
