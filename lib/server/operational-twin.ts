import {
  buildPublicEtaAdvisory,
  buildPublicRunwayAdvisory,
  buildPublicTrajectoryAdvisory,
  getPredictiveGraduationPolicy,
  type PublicEtaAdvisory,
  type PublicRunwayAdvisory,
  type PublicTrajectoryAdvisory,
} from "@/lib/predictive-intelligence";
import {
  analyzeRouteIntelligenceV2,
  type RouteIntelligenceNetwork,
  type RouteIntelligenceV2Snapshot,
} from "@/lib/route-intelligence";
import type { AtcContextDataset, PreparedAtcContextDataset } from "@/lib/atc-context/types";
import {
  buildOperationalTwinCorridor,
  buildOperationalTwinEvents,
  buildOperationalTwinSituation,
  OPERATIONAL_TWIN_VERSION,
  type OperationalTwinAircraftState,
  type OperationalTwinApiResponse,
} from "@/lib/operational-twin";
import type { AirspacePlanSnapshot } from "@/lib/airspace-activity/types";
import type { SigmetSnapshot } from "@/lib/weather/types";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getAirspacePlan } from "@/lib/server/airspace-activity";
import { defaultAviationWeatherProvider } from "@/lib/server/aviation-weather-provider";
import { loadAtcContextDataset } from "@/lib/atc-context/engine";
import { loadProcedureRepository } from "@/lib/procedures";
import {
  enforcePredictiveReadiness,
  readPredictiveReadinessReport,
} from "@/lib/server/predictive-readiness";

const LIVE_POSITION_STALE_MS = 60_000;

interface PublicPredictiveContext {
  etaAdvisory: PublicEtaAdvisory | null;
  runwayAdvisory: PublicRunwayAdvisory | null;
  trajectoryAdvisory: PublicTrajectoryAdvisory | null;
}

function mergedNetwork(dataset: AtcContextDataset | null): RouteIntelligenceNetwork | null {
  if (!dataset?.routeDocuments.length) return null;
  const first = dataset.routeDocuments[0]!;
  return {
    source: dataset.routeDocuments.length === 1
      ? first.source
      : {
          ...first.source,
          name: dataset.routeDocuments.map((document) => document.source.name).join(" + "),
          reference: dataset.routeDocuments.map((document) => document.source.reference).join(" | "),
        },
    routes: dataset.routeDocuments.flatMap((document) => document.routes),
  };
}

function aircraftState(live: ReturnType<ReturnType<typeof getAircraftStateService>["getAircraft"]>): OperationalTwinAircraftState | null {
  if (!live || live.lat === null || live.lon === null) return null;
  return {
    icaoHex: live.icaoHex,
    callsign: live.callsign ?? null,
    registration: live.registration ?? null,
    observedAt: live.lastSeen,
    lat: live.lat,
    lon: live.lon,
    altitudeFt: live.baroAltitude ?? live.altitude ?? live.geomAltitude ?? null,
    groundSpeedKt: live.groundSpeed ?? null,
    trackDeg: live.track ?? null,
    verticalRateFpm: live.verticalRate ?? live.baroRate ?? live.geomRate ?? null,
    onGround: live.onGround,
  };
}

function proceduresForRoute(live: NonNullable<ReturnType<ReturnType<typeof getAircraftStateService>["getAircraft"]>>) {
  const repository = loadProcedureRepository();
  if (!repository) return [];
  const route = live.enrichment?.route;
  const airports = [route?.origin, route?.destination]
    .map((value) => value?.trim().toUpperCase() ?? "")
    .filter(Boolean);
  const result = new Map<string, ReturnType<typeof repository.byAirport>[number]>();
  for (const airport of airports) {
    for (const procedure of repository.byAirport(airport)) result.set(procedure.id, procedure);
  }
  return [...result.values()];
}

function routeSnapshot(
  live: NonNullable<ReturnType<ReturnType<typeof getAircraftStateService>["getAircraft"]>>,
  dataset: AtcContextDataset | null,
): RouteIntelligenceV2Snapshot | null {
  const network = mergedNetwork(dataset);
  if (!network || !live.enrichment) return null;
  const route = live.enrichment.route;
  const flightAware = live.enrichment.flightPlan?.flightAware;
  try {
    return analyzeRouteIntelligenceV2({
      aircraftRoute: live.enrichment,
      atsNetwork: network,
      procedures: proceduresForRoute(live),
      originAirportIcao: route?.origin ?? null,
      destinationAirportIcao: route?.destination ?? null,
      runway: {
        reportedRunway: flightAware?.operational?.arrivalRunway ?? null,
        source: flightAware?.operational?.arrivalRunway ? "FLIGHTAWARE" : "UNKNOWN",
      },
      aircraft: {
        lat: live.lat,
        lon: live.lon,
        track: live.track,
        altitude: live.baroAltitude ?? live.altitude ?? live.geomAltitude,
      },
    });
  } catch {
    return null;
  }
}

async function publicPredictiveContext(hex: string): Promise<PublicPredictiveContext> {
  const empty: PublicPredictiveContext = {
    etaAdvisory: null,
    runwayAdvisory: null,
    trajectoryAdvisory: null,
  };
  try {
    const service = getAircraftStateService();
    const state = service.getPredictiveState(hex);
    const configuredPolicy = getPredictiveGraduationPolicy();
    const readinessRequired = configuredPolicy.ETA === "PUBLIC"
      || configuredPolicy.RUNWAY === "PUBLIC"
      || configuredPolicy.TRAJECTORY === "PUBLIC";
    const readiness = readinessRequired ? await readPredictiveReadinessReport() : null;
    const effectivePolicy = readiness
      ? enforcePredictiveReadiness(configuredPolicy, {
          thresholdVersion: readiness.thresholds.version,
          capabilities: readiness.capabilities,
        })
      : configuredPolicy;
    return {
      etaAdvisory: buildPublicEtaAdvisory(state, effectivePolicy, readiness?.capabilities.ETA ?? null),
      runwayAdvisory: buildPublicRunwayAdvisory(state, effectivePolicy, readiness?.capabilities.RUNWAY ?? null),
      trajectoryAdvisory: buildPublicTrajectoryAdvisory(state, effectivePolicy, readiness?.capabilities.TRAJECTORY ?? null),
    };
  } catch {
    return empty;
  }
}

function unavailable(
  icaoHex: string,
  reason: Extract<OperationalTwinApiResponse, { status: "unavailable" | "stale" }>["reason"],
  status: "unavailable" | "stale" = "unavailable",
): OperationalTwinApiResponse {
  return {
    version: OPERATIONAL_TWIN_VERSION,
    status,
    generatedAt: new Date().toISOString(),
    icaoHex,
    reason,
  };
}

export async function getOperationalTwinForAircraft(
  icaoHex: string,
  signal?: AbortSignal,
  now = new Date(),
): Promise<OperationalTwinApiResponse> {
  const service = getAircraftStateService();
  const live = service.getAircraft(icaoHex);
  if (!live) return unavailable(icaoHex, "aircraft_not_live");

  const state = aircraftState(live);
  if (!state) return unavailable(icaoHex, "invalid_position");

  const observedAt = Date.parse(state.observedAt);
  if (
    !Number.isFinite(observedAt)
    || now.getTime() - observedAt > LIVE_POSITION_STALE_MS
    || (live.seenPosSeconds !== null && live.seenPosSeconds > 60)
  ) {
    return unavailable(icaoHex, "stale_position", "stale");
  }

  const [datasetResult, airspaceResult, sigmetResult, predictive] = await Promise.all([
    loadAtcContextDataset()
      .then((value) => ({ ok: true as const, value }))
      .catch(() => ({ ok: false as const, value: null })),
    getAirspacePlan(now)
      .then((value) => ({ ok: true as const, value }))
      .catch(() => ({ ok: false as const, value: null })),
    defaultAviationWeatherProvider.getSigmets(signal)
      .then((value) => ({ ok: true as const, value }))
      .catch(() => ({ ok: false as const, value: null })),
    publicPredictiveContext(icaoHex),
  ]);

  const preparedDataset: PreparedAtcContextDataset | null = datasetResult.value;
  const route = routeSnapshot(live, preparedDataset);
  const corridor = buildOperationalTwinCorridor(state, route, now);
  if (!corridor) return unavailable(icaoHex, "corridor_unavailable");

  const airspacePlan: AirspacePlanSnapshot | null = airspaceResult.value;
  const sigmets: SigmetSnapshot | null = sigmetResult.value;
  const destination = live.enrichment?.route?.destination?.trim().toUpperCase() ?? null;
  const events = buildOperationalTwinEvents({
    generatedAt: now,
    aircraft: state,
    corridor,
    atcDataset: preparedDataset,
    airspacePlan,
    sigmets,
    destination,
    etaAdvisory: predictive.etaAdvisory,
    runwayAdvisory: predictive.runwayAdvisory,
    trajectoryAdvisory: predictive.trajectoryAdvisory,
  });

  return buildOperationalTwinSituation({
    generatedAt: now,
    aircraft: state,
    corridor,
    events,
    atcAvailable: preparedDataset !== null,
    airspacePlanAvailable: Boolean(airspacePlan && airspacePlan.status !== "unavailable"),
    sigmetAvailable: Boolean(sigmets && sigmetResult.ok),
    publicPredictionAvailable: Boolean(
      predictive.etaAdvisory || predictive.runwayAdvisory || predictive.trajectoryAdvisory,
    ),
  });
}
