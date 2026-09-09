import type { AircraftView } from "@/lib/aircraft/types";

export type AircraftMapLabelLevel = "hidden" | "callsign" | "callsignAltitude" | "callsignAltitudeType";

export function aircraftMapLabelLevel(zoom: number): AircraftMapLabelLevel {
  if (zoom < 6.5) return "hidden";
  if (zoom < 8.5) return "callsign";
  if (zoom < 10.5) return "callsignAltitude";
  return "callsignAltitudeType";
}

export function aircraftMapLabel(
  aircraft: Pick<AircraftView, "callsign" | "registration" | "icaoHex" | "altitude" | "aircraftType" | "enrichment">,
  zoom: number,
  altitude: string,
): string | null {
  const level = aircraftMapLabelLevel(zoom);
  if (level === "hidden") return null;
  const identity = aircraft.callsign || aircraft.registration || aircraft.enrichment?.metadata?.registration || aircraft.icaoHex;
  if (level === "callsign") return identity;
  const values = [identity, altitude];
  if (level === "callsignAltitudeType") {
    values.push(aircraft.enrichment?.metadata?.icaoTypeCode || aircraft.aircraftType || "?");
  }
  return values.join(" · ");
}
