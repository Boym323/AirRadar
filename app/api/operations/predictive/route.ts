import {
  buildAdminEtaAdvisoryPreview,
  buildAdminRunwayAdvisoryPreview,
  buildPublicEtaAdvisory,
  buildPublicRunwayAdvisory,
  getPredictiveGraduationPolicy,
  PREDICTIVE_OPERATIONS_MAX_AIRCRAFT,
  type PredictiveOperationsItem,
  type PredictiveOperationsResponse,
} from "@/lib/predictive-intelligence";
import {
  enforcePredictiveReadiness,
  readPredictiveReadinessReport,
} from "@/lib/server/predictive-readiness";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";
import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";

export const dynamic = "force-dynamic";

function requestedHexes(request: Request): string[] {
  const url = new URL(request.url);
  const raw = url.searchParams.get("hexes") ?? "";
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of raw.split(",")) {
    const hex = normalizeIcaoHex(value.trim());
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    result.push(hex);
    if (result.length >= PREDICTIVE_OPERATIONS_MAX_AIRCRAFT) break;
  }
  return result;
}

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const hexes = requestedHexes(request);
  if (hexes.length === 0) {
    const empty: PredictiveOperationsResponse = {
      generatedAt: new Date().toISOString(),
      items: [],
    };
    return Response.json(empty, { headers: { "Cache-Control": "no-store" } });
  }

  const service = getAircraftStateService();
  const configuredPolicy = getPredictiveGraduationPolicy();
  const admin = isWatchlistSessionValid(request);
  const readinessRequired = admin
    || configuredPolicy.ETA === "PUBLIC"
    || configuredPolicy.RUNWAY === "PUBLIC";
  const readiness = readinessRequired ? await readPredictiveReadinessReport() : null;
  const effectivePolicy = readiness
    ? enforcePredictiveReadiness(configuredPolicy, {
      thresholdVersion: readiness.thresholds.version,
      capabilities: readiness.capabilities,
    })
    : configuredPolicy;

  const etaReadiness = readiness?.capabilities.ETA ?? null;
  const runwayReadiness = readiness?.capabilities.RUNWAY ?? null;
  const items: PredictiveOperationsItem[] = [];

  for (const hex of hexes) {
    const state = service.getPredictiveState(hex);
    const aircraft = service.getAircraft(hex);
    const etaAdvisory = buildPublicEtaAdvisory(state, effectivePolicy, etaReadiness);
    const runwayAdvisory = buildPublicRunwayAdvisory(state, effectivePolicy, runwayReadiness);
    const etaAdminPreview = admin && state && etaReadiness
      ? buildAdminEtaAdvisoryPreview(state, configuredPolicy, etaReadiness)
      : undefined;
    const runwayAdminPreview = admin && state && runwayReadiness
      ? buildAdminRunwayAdvisoryPreview(state, configuredPolicy, runwayReadiness)
      : undefined;

    if (!etaAdvisory && !runwayAdvisory && !etaAdminPreview && !runwayAdminPreview) continue;

    items.push({
      icaoHex: hex,
      label: aircraft?.callsign ?? aircraft?.registration ?? hex,
      callsign: aircraft?.callsign ?? null,
      registration: aircraft?.registration ?? null,
      destination: aircraft?.enrichment?.route?.destination ?? null,
      etaAdvisory,
      runwayAdvisory,
      ...(etaAdminPreview ? { etaAdminPreview } : {}),
      ...(runwayAdminPreview ? { runwayAdminPreview } : {}),
    });
  }

  const response: PredictiveOperationsResponse = {
    generatedAt: new Date().toISOString(),
    items,
    ...(admin && readiness
      ? {
        adminReadiness: {
          ETA: {
            decision: readiness.capabilities.ETA.decision,
            reasons: [...readiness.capabilities.ETA.reasons],
          },
          RUNWAY: {
            decision: readiness.capabilities.RUNWAY.decision,
            reasons: [...readiness.capabilities.RUNWAY.reasons],
          },
        },
      }
      : {}),
  };

  return Response.json(response, { headers: { "Cache-Control": "no-store" } });
}
