import type { AircraftView } from "@/lib/aircraft/types";
import { formatNumber } from "@/lib/i18n";

export type AircraftMapLabelLevel = "hidden" | "callsign" | "callsignAltitude" | "callsignAltitudeType";

export interface AircraftMapLabelLines {
  primary: string;
  secondary: string | null;
}

export interface TrafficMapLabelInput {
  identity: string;
  altitudeFt: number | null;
  speedKt: number | null;
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

function compactAltitudeValue(altitudeFt: number | null): string | null {
  if (altitudeFt === null || !Number.isFinite(altitudeFt)) return null;
  return altitudeFt >= 10_000
    ? `FL${Math.round(altitudeFt / 100)}`
    : `${formatNumber(altitudeFt, 0)} ft`;
}

function compactSpeedValue(speedKt: number | null): string | null {
  if (speedKt === null || !Number.isFinite(speedKt)) return null;
  return `${formatNumber(speedKt, 0)}KT`;
}

export function trafficMapLabelLines(
  traffic: TrafficMapLabelInput,
  zoom: number,
  options: { suppressTelemetry?: boolean } = {},
): AircraftMapLabelLines | null {
  const level = aircraftMapLabelLevel(zoom);
  if (level === "hidden") return null;
  if (level === "callsign" || options.suppressTelemetry) return { primary: traffic.identity, secondary: null };
  const values = [compactAltitudeValue(traffic.altitudeFt)];
  if (level === "callsignAltitudeType") values.push(compactSpeedValue(traffic.speedKt));
  return { primary: traffic.identity, secondary: values.filter((value): value is string => Boolean(value)).join(" · ") || null };
}

export function trafficMapLabelText(
  traffic: TrafficMapLabelInput,
  zoom: number,
  options: { suppressTelemetry?: boolean } = {},
): string | null {
  const lines = trafficMapLabelLines(traffic, zoom, options);
  return lines ? [lines.primary, lines.secondary].filter((value): value is string => Boolean(value)).join("\n") : null;
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
  return trafficMapLabelLines({
    identity: aircraftMapIdentity(aircraft),
    altitudeFt: aircraft.altitude,
    speedKt: aircraft.groundSpeed,
  }, zoom, options);
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
