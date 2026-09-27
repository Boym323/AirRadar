import { classifyAircraftIcon, type AircraftPresentationKind } from "./icon-classification";
import type { AircraftView } from "./types";

type IconSizeInput = Pick<AircraftView, "aircraftType" | "aircraftDescription" | "enrichment" | "category" | "onGround">;

const ICON_VISUAL_SIZE_PX: Record<AircraftPresentationKind, number> = {
  ground: 13,
  drone: 15,
  helicopter: 17,
  glider: 19,
  "general-aviation": 17,
  turboprop: 18,
  "business-jet": 18,
  regional: 18,
  airplane: 18,
  a220: 18,
  a320: 18,
  a330: 20,
  a350: 20,
  a380: 22,
  b717: 18,
  b727: 18,
  b737: 18,
  b747: 20,
  b757: 18,
  b767: 20,
  b777: 20,
  b787: 20,
};

const COUNTRY_ZOOM_MAX = 6;
const FULL_SIZE_ZOOM = 9;
const COUNTRY_ZOOM_SCALE = 0.9;

export function aircraftIconSizeForPresentation(kind: AircraftPresentationKind): number {
  return ICON_VISUAL_SIZE_PX[kind];
}

/**
 * Keeps country-level views quieter without shrinking the hit target.
 * The scale returns to 100% by regional/detail zooms.
 */
export function aircraftIconZoomScale(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  if (zoom <= COUNTRY_ZOOM_MAX) return COUNTRY_ZOOM_SCALE;
  if (zoom >= FULL_SIZE_ZOOM) return 1;
  const progress = (zoom - COUNTRY_ZOOM_MAX) / (FULL_SIZE_ZOOM - COUNTRY_ZOOM_MAX);
  return COUNTRY_ZOOM_SCALE + progress * (1 - COUNTRY_ZOOM_SCALE);
}

export function aircraftIconSizeAtZoom(baseSize: number, zoom: number): number {
  return Math.round(baseSize * aircraftIconZoomScale(zoom) * 10) / 10;
}

export function aircraftIconVisualSize(aircraft: IconSizeInput): number {
  return aircraftIconSizeForPresentation(classifyAircraftIcon(aircraft).presentationKind);
}

export function aircraftIconDisplaySize(aircraft: IconSizeInput, zoom: number): number {
  return aircraftIconSizeAtZoom(aircraftIconVisualSize(aircraft), zoom);
}
