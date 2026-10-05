import type { AircraftView } from "@/lib/aircraft/types";
import type { FeatureCollection, LineString, Point } from "geojson";

export const REGIONAL_ATTENTION_MAP_FOCUS_EVENT = "airradar:regional-attention-map-focus";
export const REGIONAL_ATTENTION_MAP_SOURCE_ID = "regional-attention-focus";
export const REGIONAL_ATTENTION_MAP_LINE_LAYER_ID = "regional-attention-focus-line";
export const REGIONAL_ATTENTION_MAP_AIRCRAFT_LAYER_ID = "regional-attention-focus-aircraft";

export type RegionalAttentionHorizonMinutes = 5 | 15 | 30;

export interface RegionalAttentionMapFocusDetail {
  graduated: true;
  itemId: string;
  aircraft: [string, string];
  horizonMinutes: RegionalAttentionHorizonMinutes;
  projectedDistanceNm: number | null;
}

export type RegionalAttentionMapFocusEventDetail = RegionalAttentionMapFocusDetail | null;

export function regionalAttentionHorizonForOffset(offsetMinutes: number | null): RegionalAttentionHorizonMinutes | null {
  if (offsetMinutes === null || !Number.isFinite(offsetMinutes) || offsetMinutes < 0 || offsetMinutes > 30) return null;
  if (offsetMinutes <= 5) return 5;
  if (offsetMinutes <= 15) return 15;
  return 30;
}

export type RegionalAttentionMapFocusGeoJSON = FeatureCollection<
  LineString | Point,
  {
    kind: "line" | "aircraft";
    itemId: string;
    icaoHex?: string;
    horizonMinutes: RegionalAttentionHorizonMinutes;
    projectedDistanceNm: number | null;
    contextOnly: true;
  }
>;

export function emptyRegionalAttentionMapFocusGeoJSON(): RegionalAttentionMapFocusGeoJSON {
  return { type: "FeatureCollection", features: [] };
}

export function createRegionalAttentionMapFocusGeoJSON(
  detail: RegionalAttentionMapFocusEventDetail,
  aircraft: readonly AircraftView[],
): RegionalAttentionMapFocusGeoJSON {
  if (!detail?.graduated) return emptyRegionalAttentionMapFocusGeoJSON();
  const byHex = new Map(aircraft.map((item) => [item.icaoHex.toUpperCase(), item]));
  const source = byHex.get(detail.aircraft[0].toUpperCase());
  const target = byHex.get(detail.aircraft[1].toUpperCase());
  if (
    !source
    || !target
    || source.lat === null
    || source.lon === null
    || target.lat === null
    || target.lon === null
    || !Number.isFinite(source.lat)
    || !Number.isFinite(source.lon)
    || !Number.isFinite(target.lat)
    || !Number.isFinite(target.lon)
  ) return emptyRegionalAttentionMapFocusGeoJSON();

  const base = {
    itemId: detail.itemId,
    horizonMinutes: detail.horizonMinutes,
    projectedDistanceNm: detail.projectedDistanceNm,
    contextOnly: true as const,
  };
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { ...base, kind: "line" },
        geometry: {
          type: "LineString",
          coordinates: [[source.lon, source.lat], [target.lon, target.lat]],
        },
      },
      {
        type: "Feature",
        properties: { ...base, kind: "aircraft", icaoHex: source.icaoHex },
        geometry: { type: "Point", coordinates: [source.lon, source.lat] },
      },
      {
        type: "Feature",
        properties: { ...base, kind: "aircraft", icaoHex: target.icaoHex },
        geometry: { type: "Point", coordinates: [target.lon, target.lat] },
      },
    ],
  };
}
