import { classifyAircraftIcon, type AircraftPresentationKind } from "./icon-classification";
import type { AircraftView } from "./types";

type IconSizeInput = Pick<AircraftView, "aircraftType" | "aircraftDescription" | "enrichment" | "category" | "onGround">;

const ICON_VISUAL_SIZE_PX: Record<AircraftPresentationKind, number> = {
  ground: 14,
  drone: 16,
  helicopter: 18,
  glider: 21,
  "general-aviation": 18,
  turboprop: 19,
  "business-jet": 19,
  regional: 19,
  airplane: 20,
  a220: 20,
  a320: 20,
  a330: 22,
  a350: 22,
  a380: 24,
  b717: 19,
  b727: 20,
  b737: 20,
  b747: 22,
  b757: 20,
  b767: 22,
  b777: 22,
  b787: 22,
};

export function aircraftIconSizeForPresentation(kind: AircraftPresentationKind): number {
  return ICON_VISUAL_SIZE_PX[kind];
}

export function aircraftIconVisualSize(aircraft: IconSizeInput): number {
  return aircraftIconSizeForPresentation(classifyAircraftIcon(aircraft).presentationKind);
}
