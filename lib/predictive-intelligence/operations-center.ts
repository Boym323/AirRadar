import type {
  AdminEtaAdvisoryPreview,
  PublicEtaAdvisory,
} from "./eta-advisory";
import type {
  AdminRunwayAdvisoryPreview,
  PublicRunwayAdvisory,
} from "./runway-advisory";
import type { PredictiveReadinessDecision } from "./readiness";

export const PREDICTIVE_OPERATIONS_MAX_AIRCRAFT = 6;
export const PREDICTIVE_OPERATIONS_STALE_AFTER_MS = 45_000;

export interface PredictiveOperationsReadinessCapability {
  decision: PredictiveReadinessDecision;
  reasons: string[];
}

export interface PredictiveOperationsItem {
  icaoHex: string;
  label: string;
  callsign: string | null;
  registration: string | null;
  destination: string | null;
  etaAdvisory: PublicEtaAdvisory | null;
  runwayAdvisory: PublicRunwayAdvisory | null;
  etaAdminPreview?: AdminEtaAdvisoryPreview;
  runwayAdminPreview?: AdminRunwayAdvisoryPreview;
}

export interface PredictiveOperationsResponse {
  generatedAt: string;
  items: PredictiveOperationsItem[];
  adminReadiness?: {
    ETA: PredictiveOperationsReadinessCapability;
    RUNWAY: PredictiveOperationsReadinessCapability;
  };
}
