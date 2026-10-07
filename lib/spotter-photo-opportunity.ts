import type { SpotterInterestScore } from "@/lib/spotter-interest";
import type { SpotterVisualAcquisition } from "@/lib/spotter-visual-acquisition";
import type { SpotterLightGeometry } from "@/lib/spotter-sun-geometry";

export type SpotterPhotoReasonCode =
  | "INTEREST"
  | "GOOD_VISIBILITY"
  | "POSSIBLE_VISIBILITY"
  | "POOR_VISIBILITY"
  | "HIGH_ELEVATION"
  | "LOW_ELEVATION"
  | "CLOSE_GEOMETRY"
  | "FRONT_LIGHT"
  | "SIDE_LIGHT"
  | "BACKLIGHT"
  | "GOLDEN_HOUR"
  | "TWILIGHT"
  | "NIGHT";

export interface SpotterPhotoReason {
  code: SpotterPhotoReasonCode;
  points: number;
}

export interface SpotterPhotoOpportunity {
  score: number;
  reasons: SpotterPhotoReason[];
}

export function scorePhotoOpportunity(
  interest: SpotterInterestScore,
  visual: SpotterVisualAcquisition,
  light: SpotterLightGeometry,
): SpotterPhotoOpportunity {
  const reasons: SpotterPhotoReason[] = [];
  const interestPoints = Math.round(Math.min(35, interest.score * 0.35));
  if (interestPoints > 0) reasons.push({ code: "INTEREST", points: interestPoints });

  if (visual.status === "GOOD") reasons.push({ code: "GOOD_VISIBILITY", points: 20 });
  else if (visual.status === "POSSIBLE") reasons.push({ code: "POSSIBLE_VISIBILITY", points: 8 });
  else if (visual.status === "POOR") reasons.push({ code: "POOR_VISIBILITY", points: -15 });

  if (visual.elevationDeg !== null) {
    if (visual.elevationDeg >= 45) reasons.push({ code: "HIGH_ELEVATION", points: 15 });
    else if (visual.elevationDeg < 8) reasons.push({ code: "LOW_ELEVATION", points: -10 });
  }

  if (visual.slantDistanceKm !== null) {
    if (visual.slantDistanceKm <= 3) reasons.push({ code: "CLOSE_GEOMETRY", points: 10 });
    else if (visual.slantDistanceKm <= 8) reasons.push({ code: "CLOSE_GEOMETRY", points: 5 });
  }

  if (light.lighting === "FRONT") reasons.push({ code: "FRONT_LIGHT", points: 15 });
  else if (light.lighting === "SIDE") reasons.push({ code: "SIDE_LIGHT", points: 12 });
  else if (light.lighting === "BACK") reasons.push({ code: "BACKLIGHT", points: -8 });

  if (light.period === "GOLDEN_HOUR") reasons.push({ code: "GOLDEN_HOUR", points: 10 });
  else if (light.period === "TWILIGHT") reasons.push({ code: "TWILIGHT", points: 3 });
  else if (light.period === "NIGHT") reasons.push({ code: "NIGHT", points: -10 });

  reasons.sort((a, b) => b.points - a.points || a.code.localeCompare(b.code));
  const score = Math.max(0, Math.min(100, reasons.reduce((sum, reason) => sum + reason.points, 0)));
  return { score, reasons };
}
