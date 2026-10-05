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
