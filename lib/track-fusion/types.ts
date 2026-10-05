import type { AircraftDataOrigin, AircraftSource } from "@/lib/aircraft/types";

export const TRACK_FUSION_SHADOW_VERSION = "track-fusion-shadow-v1" as const;

export type TrackFusionSourceClass = "LOCAL" | "NETWORK";
export type TrackFusionFieldName = "position" | "altitude" | "groundSpeed" | "track" | "verticalRate";
export type TrackFusionConfidence = "HIGH" | "MEDIUM" | "LOW";
export type TrackFusionTrackQuality = "GOOD" | "DEGRADED" | "ESTIMATED" | "NO_POSITION";

export interface TrackFusionIntegrity {
  nic: number | null;
  nacP: number | null;
  nacV: number | null;
  sil: number | null;
  sda: number | null;
  containmentRadiusM: number | null;
}

export interface TrackFusionFieldCandidate<T> {
  field: TrackFusionFieldName;
  value: T;
  observedAt: number;
  sourceClass: TrackFusionSourceClass;
  origin: AircraftDataOrigin;
  source: AircraftSource;
  protocol: string;
  score: number;
  confidence: TrackFusionConfidence;
  ageMs: number;
  integrity: TrackFusionIntegrity;
}

export interface TrackFusionFieldEstimate<T> {
  value: T;
  observedAt: string;
  sourceClass: TrackFusionSourceClass | "ESTIMATED";
  origin: AircraftDataOrigin | null;
  source: AircraftSource | "ESTIMATED";
  protocol: string;
  score: number;
  confidence: TrackFusionConfidence;
  ageMs: number;
  uncertainty: number | null;
  estimated: boolean;
}

export interface TrackFusionPositionValue {
  lat: number;
  lon: number;
}

export interface TrackFusionTrack {
  version: typeof TRACK_FUSION_SHADOW_VERSION;
  icaoHex: string;
  evaluatedAt: string;
  quality: TrackFusionTrackQuality;
  position: TrackFusionFieldEstimate<TrackFusionPositionValue> | null;
  altitude: TrackFusionFieldEstimate<number> | null;
  groundSpeed: TrackFusionFieldEstimate<number> | null;
  track: TrackFusionFieldEstimate<number> | null;
  verticalRate: TrackFusionFieldEstimate<number> | null;
  overlap: boolean;
  positionResidualNm: number | null;
  canonicalPositionResidualNm: number | null;
}

export interface TrackFusionRecentDisagreement {
  icaoHex: string;
  observedAt: string;
  residualNm: number;
  selectedSource: TrackFusionSourceClass | "ESTIMATED";
  localSource: AircraftSource | null;
  networkSource: AircraftSource | null;
}

export interface TrackFusionShadowDiagnostics {
  version: typeof TRACK_FUSION_SHADOW_VERSION;
  enabled: boolean;
  evaluatedTracks: number;
  activeTracks: number;
  overlapTracks: number;
  goodTracks: number;
  degradedTracks: number;
  estimatedTracks: number;
  noPositionTracks: number;
  capacityEvictions: number;
  evaluations: number;
  dedupedEvaluations: number;
  positionComparisons: number;
  positionDisagreements: number;
  estimatedGapFills: number;
  acceptedSourceTransitions: number;
  rejectedSourceTransitions: number;
  canonicalPositionComparisons: number;
  canonicalPositionDivergences: number;
  fieldSelections: Record<TrackFusionFieldName, { local: number; network: number; estimated: number }>;
  positionResidualNm: {
    average: number | null;
    maximum: number | null;
    p95UpperBound: number | null;
    histogram: Array<{ upperBoundNm: number | null; count: number }>;
  };
  canonicalResidualNm: {
    average: number | null;
    maximum: number | null;
  };
  lastEvaluatedAt: string | null;
  recentDisagreements: TrackFusionRecentDisagreement[];
}
