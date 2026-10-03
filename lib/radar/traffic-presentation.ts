import type { AircraftView } from "@/lib/aircraft/types";
import { classifyAircraftIcon, type CanonicalAircraftIconKind } from "@/lib/aircraft/icon-classification";
import { aircraftPositionSourceLabel, classifyAircraftSource } from "@/lib/aircraft/source-awareness";
import { aircraftPositionIsStale } from "@/lib/radar-ui";
import type { OgnAircraftType, OgnTargetView } from "@/lib/ogn/types";

export type RadarTrafficFamily = "adsb" | "ogn";

export interface RadarTrafficPresentation {
  key: string;
  lat: number;
  lon: number;
  heading: number | null;
  altitudeFt: number | null;
  speedKt: number | null;
  verticalRateFpm: number | null;
  iconKind: CanonicalAircraftIconKind;
  iconAsset: string | null;
  primaryLabel: string;
  secondaryLabel: string | null;
  sourceFamily: RadarTrafficFamily;
  sourceLabel: string;
  stale: boolean;
  anonymous: boolean;
}

const OGN_SOURCE_LABELS: Record<OgnTargetView["trackingSource"], string> = {
  flarm: "OGN · FLARM",
  ogn: "OGN · OGN TRACKER",
  safesky: "OGN · SAFESKY",
  fanet: "OGN · FANET",
  pilotaware: "OGN · PILOTAWARE",
  ads_l: "OGN · ADS-L",
};

export function trafficSourcePresentation(input: AircraftView | OgnTargetView): { family: RadarTrafficFamily; shortLabel: string; detailLabel: string } {
  if ("aircraftType" in input && "trackingSource" in input) {
    return { family: "ogn", shortLabel: "OGN", detailLabel: OGN_SOURCE_LABELS[input.trackingSource] };
  }
  const aircraft = input as AircraftView;
  const classification = classifyAircraftSource(aircraft);
  const detailLabel = aircraftPositionSourceLabel(aircraft).replace("LOCAL ADS-B", "LOCAL · ADS-B");
  return {
    family: "adsb",
    shortLabel: classification === "NETWORK_ONLY" ? "NETWORK" : "LOCAL",
    detailLabel,
  };
}

export function ognIconKind(type: OgnAircraftType): CanonicalAircraftIconKind {
  if (type === "glider" || type === "paraglider" || type === "hang_glider") return "glider";
  if (type === "helicopter") return "helicopter";
  if (type === "uav") return "drone";
  return "airplane";
}

export function ognPrimaryLabel(target: OgnTargetView): string {
  if (target.identityVisible) return target.registration || target.competitionNumber || target.model || target.senderCallsign || target.aircraftType.toUpperCase();
  return target.aircraftType === "glider" || target.aircraftType === "paraglider" || target.aircraftType === "hang_glider" ? "GLIDER" : target.aircraftType.toUpperCase();
}

export function toAircraftTrafficPresentation(aircraft: AircraftView): RadarTrafficPresentation {
  const icon = classifyAircraftIcon(aircraft);
  const source = trafficSourcePresentation(aircraft);
  return {
    key: aircraft.icaoHex,
    lat: aircraft.lat ?? 0,
    lon: aircraft.lon ?? 0,
    heading: aircraft.track,
    altitudeFt: aircraft.altitude,
    speedKt: aircraft.groundSpeed,
    verticalRateFpm: aircraft.verticalRate,
    iconKind: icon.kind,
    iconAsset: icon.asset,
    primaryLabel: aircraft.callsign || aircraft.registration || aircraft.enrichment?.metadata?.registration || aircraft.icaoHex,
    secondaryLabel: source.detailLabel,
    sourceFamily: source.family,
    sourceLabel: source.detailLabel,
    stale: aircraftPositionIsStale(aircraft),
    anonymous: false,
  };
}

export function toOgnTrafficPresentation(target: OgnTargetView): RadarTrafficPresentation {
  const source = trafficSourcePresentation(target);
  return {
    key: target.id,
    lat: target.latitude,
    lon: target.longitude,
    heading: target.trackDeg,
    altitudeFt: target.altitudeFt,
    speedKt: target.groundSpeedKt,
    verticalRateFpm: target.verticalRateFpm,
    iconKind: ognIconKind(target.aircraftType),
    iconAsset: null,
    primaryLabel: ognPrimaryLabel(target),
    secondaryLabel: source.detailLabel,
    sourceFamily: source.family,
    sourceLabel: source.detailLabel,
    stale: target.stale,
    anonymous: !target.identityVisible,
  };
}

export function radarTrafficAriaLabel(presentation: RadarTrafficPresentation): string {
  const kind = presentation.iconKind === "airplane" ? "aircraft" : presentation.iconKind;
  const altitude = presentation.altitudeFt === null ? "unknown altitude" : `${Math.round(presentation.altitudeFt)} feet`;
  return `${presentation.anonymous ? "Anonymous " : ""}${presentation.sourceFamily.toUpperCase()} ${kind}, altitude ${altitude}`;
}
