import type { AircraftView } from "@/lib/aircraft/types";
import type { OgnTargetView } from "@/lib/ogn/types";
import { aircraftMapLabelText, trafficMapLabelText } from "@/lib/aircraft/map-labels";
import { aircraftLabelOpacity, aircraftPositionIsStale } from "@/lib/radar-ui";
import { classifyAircraftSource } from "@/lib/aircraft/source-awareness";
import { canonicalAircraftGlyphPath } from "@/lib/aircraft/glyph-paths";
import { ognIconKind, ognPrimaryLabel, toOgnTrafficPresentation } from "@/lib/radar/traffic-presentation";

/** Stable, standalone projections for the map label hot path. */
export function aircraftWebglLabelFeature(
  aircraft: AircraftView,
  zoom: number,
  renderedPosition?: { lon: number; lat: number } | null,
) {
  const stale = aircraftPositionIsStale(aircraft);
  return {
    type: "Feature" as const,
    id: aircraft.icaoHex,
    properties: {
      icaoHex: aircraft.icaoHex,
      label: aircraftMapLabelText(aircraft, zoom, {
        suppressTelemetry: stale,
      }) ?? "",
      source: classifyAircraftSource(aircraft),
      stale,
      labelOpacity: aircraftLabelOpacity(aircraft),
    },
    geometry: {
      type: "Point" as const,
      coordinates: [renderedPosition?.lon ?? aircraft.lon!, renderedPosition?.lat ?? aircraft.lat!] as [number, number],
    },
  };
}

export function ognMapLabelFeature(target: OgnTargetView, zoom: number, selected: boolean) {
  const presentation = toOgnTrafficPresentation(target);
  return {
    type: "Feature" as const,
    id: target.id,
    properties: {
      targetId: target.id,
      label: selected ? "" : trafficMapLabelText({
        identity: presentation.primaryLabel,
        altitudeFt: presentation.altitudeFt,
        speedKt: presentation.speedKt,
      }, zoom, { suppressTelemetry: target.stale }) ?? "",
      stale: target.stale,
    },
    geometry: {
      type: "Point" as const,
      coordinates: [target.longitude, target.latitude] as [number, number],
    },
  };
}


export function labelForAircraft(aircraft: AircraftView): string {
  return aircraft.callsign || aircraft.registration || aircraft.enrichment?.metadata?.registration || aircraft.icaoHex;
}

const aircraftSearchTextCache = new WeakMap<AircraftView, string>();

export function aircraftSearchText(aircraft: AircraftView): string {
  const cached = aircraftSearchTextCache.get(aircraft);
  if (cached !== undefined) return cached;
  const value = [aircraft.callsign, aircraft.registration, aircraft.enrichment?.metadata?.registration, aircraft.icaoHex]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  aircraftSearchTextCache.set(aircraft, value);
  return value;
}


export function ognTargetLabel(target: OgnTargetView): string {
  return ognPrimaryLabel(target);
}

export function ognGlyphMarkup(aircraftType: OgnTargetView["aircraftType"]): string {
  return `<svg class="aircraft-glyph aircraft-glyph-${ognIconKind(aircraftType)}" viewBox="0 0 32 32" aria-hidden="true"><path d="${canonicalAircraftGlyphPath(ognIconKind(aircraftType))}"></path></svg>`;
}

