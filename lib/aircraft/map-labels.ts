import type { AircraftView } from "@/lib/aircraft/types";
import { formatNumber } from "@/lib/i18n";

export type AircraftMapLabelLevel = "hidden" | "callsign" | "callsignAltitude" | "callsignAltitudeType";

export interface AircraftMapLabelLines {
  primary: string;
  secondary: string | null;
}

export function aircraftMapLabelLevel(zoom: number): AircraftMapLabelLevel {
  if (zoom < 6.5) return "hidden";
  if (zoom < 8.5) return "callsign";
  if (zoom < 10.5) return "callsignAltitude";
  return "callsignAltitudeType";
}

function aircraftMapIdentity(
  aircraft: Pick<AircraftView, "callsign" | "registration" | "icaoHex" | "enrichment">,
): string {
  return aircraft.callsign || aircraft.registration || aircraft.enrichment?.metadata?.registration || aircraft.icaoHex;
}

function compactAltitude(aircraft: Pick<AircraftView, "altitude">): string | null {
  if (aircraft.altitude === null || !Number.isFinite(aircraft.altitude)) return null;
  return aircraft.altitude >= 10_000
    ? `FL${Math.round(aircraft.altitude / 100)}`
    : `${formatNumber(aircraft.altitude, 0)} ft`;
}

function compactSpeed(aircraft: Pick<AircraftView, "groundSpeed">): string | null {
  if (aircraft.groundSpeed === null || !Number.isFinite(aircraft.groundSpeed)) return null;
  return `${formatNumber(aircraft.groundSpeed, 0)}KT`;
}

/**
 * Shared two-line map label content. The high-zoom line deliberately stays
 * operationally compact: identity first, then altitude and speed. Aircraft
 * type remains available in the drawer and is not repeated on the map.
 */
export function aircraftMapLabelLines(
  aircraft: Pick<AircraftView, "callsign" | "registration" | "icaoHex" | "altitude" | "groundSpeed" | "enrichment">,
  zoom: number,
  options: { suppressTelemetry?: boolean } = {},
): AircraftMapLabelLines | null {
  const level = aircraftMapLabelLevel(zoom);
  if (level === "hidden") return null;
  const primary = aircraftMapIdentity(aircraft);
  if (level === "callsign" || options.suppressTelemetry) return { primary, secondary: null };
  const values = [compactAltitude(aircraft)];
  if (level === "callsignAltitudeType") values.push(compactSpeed(aircraft));
  return { primary, secondary: values.filter((value): value is string => Boolean(value)).join(" · ") || null };
}

export function aircraftMapLabelText(
  aircraft: Pick<AircraftView, "callsign" | "registration" | "icaoHex" | "altitude" | "groundSpeed" | "enrichment">,
  zoom: number,
  options: { suppressTelemetry?: boolean } = {},
): string | null {
  const lines = aircraftMapLabelLines(aircraft, zoom, options);
  return lines ? [lines.primary, lines.secondary].filter((value): value is string => Boolean(value)).join("\n") : null;
}

export function aircraftMapLabel(
  aircraft: Pick<AircraftView, "callsign" | "registration" | "icaoHex" | "altitude" | "aircraftType" | "enrichment">,
  zoom: number,
  altitude: string,
): string | null {
  const level = aircraftMapLabelLevel(zoom);
  if (level === "hidden") return null;
  const identity = aircraftMapIdentity(aircraft);
  if (level === "callsign") return identity;
  const values = [identity, altitude];
  if (level === "callsignAltitudeType") {
    values.push(aircraft.enrichment?.metadata?.icaoTypeCode || aircraft.aircraftType || "?");
  }
  return values.join(" · ");
}
