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
  buildAircraftOperationalFocus,
  buildNavigationIntegrityCorridorIntelligence,
  buildOperationalTwinCorridor,
  buildOperationalTwinEvents,
  buildOperationalTwinSituation,
  buildOperationalTwinTrajectoryQualityV2,
  buildOperationalTwinTrajectoryQualityV3,
  buildOperationalTwinWindTimingShadow,
  applyOperationalTwinTrajectoryQualityPromotion,
  applyOperationalTwinWindTimingPromotion,
  OPERATIONAL_TWIN_VERSION,
  type OperationalTwinAircraftState,
  type OperationalTwinApiResponse,
} from "@/lib/operational-twin";
import type { AirspacePlanSnapshot } from "@/lib/airspace-activity/types";
import type { SigmetSnapshot } from "@/lib/weather/types";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getNavigationIntegrityService } from "@/lib/server/navigation-integrity";
import { getAirspacePlan } from "@/lib/server/airspace-activity";
import { defaultAviationWeatherProvider } from "@/lib/server/aviation-weather-provider";
import { defaultPirepProvider } from "@/lib/server/pirep-provider";
import { defaultWindAloftProvider, type WindLevelHpa } from "@/lib/server/wind-aloft";
import {
  getOperationalTwinTrajectoryQualityPolicy,
  getOperationalTwinWindTimingPolicy,
  isAviationWeatherEnabled,
  isTrackFusionDigitalTwinEnabled,
} from "@/lib/server/config";
import { windLevelForAltitude } from "@/lib/weather/aircraft-wind-context";
import { buildWeatherCorridorIntelligence } from "@/lib/weather/corridor-intelligence";
import { loadAtcContextDataset } from "@/lib/atc-context/engine";
import { loadProcedureRepository } from "@/lib/procedures";
import {
  enforcePredictiveReadiness,
  readPredictiveReadinessReport,
} from "@/lib/server/predictive-readiness";
import type { TrackFusionReadinessReport, TrackFusionTrack } from "@/lib/track-fusion";

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

type EligibleFusionTrack = TrackFusionTrack & {
  position: NonNullable<TrackFusionTrack["position"]>;
};

function fusionTrackEligible(
  fused: TrackFusionTrack | null,
  readiness: TrackFusionReadinessReport,
): fused is EligibleFusionTrack {
  return readiness.rollout.digitalTwinEffective
    && fused?.quality === "GOOD"
    && fused.position !== null
    && !fused.position.estimated
    && fused.position.confidence !== "LOW";
}

function observedFusionNumber(
  estimate: TrackFusionTrack["altitude"] | TrackFusionTrack["groundSpeed"] | TrackFusionTrack["track"] | TrackFusionTrack["verticalRate"],
  fallback: number | null,
): number | null {
  return estimate && !estimate.estimated && estimate.confidence !== "LOW" ? estimate.value : fallback;
}

function aircraftState(
  live: ReturnType<ReturnType<typeof getAircraftStateService>["getAircraft"]>,
  fused: TrackFusionTrack | null,
  readiness: TrackFusionReadinessReport,
): OperationalTwinAircraftState | null {
  if (!live) return null;
  const fusionEligible = fusionTrackEligible(fused, readiness);

  const lat = fusionEligible ? fused.position.value.lat : live.lat;
  const lon = fusionEligible ? fused.position.value.lon : live.lon;
  if (lat === null || lon === null) return null;

  return {
    icaoHex: live.icaoHex,
    callsign: live.callsign ?? null,
    registration: live.registration ?? null,
    observedAt: fusionEligible ? fused.position.observedAt : live.lastSeen,
    lat,
    lon,
    altitudeFt: fusionEligible
      ? observedFusionNumber(fused.altitude, live.baroAltitude ?? live.altitude ?? live.geomAltitude ?? null)
      : live.baroAltitude ?? live.altitude ?? live.geomAltitude ?? null,
    groundSpeedKt: fusionEligible
      ? observedFusionNumber(fused.groundSpeed, live.groundSpeed ?? null)
      : live.groundSpeed ?? null,
    trackDeg: fusionEligible
      ? observedFusionNumber(fused.track, live.track ?? null)
      : live.track ?? null,
    verticalRateFpm: fusionEligible
      ? observedFusionNumber(fused.verticalRate, live.verticalRate ?? live.baroRate ?? live.geomRate ?? null)
      : live.verticalRate ?? live.baroRate ?? live.geomRate ?? null,
    onGround: live.onGround,
    aircraftType: live.enrichment?.metadata?.icaoTypeCode ?? live.aircraftType ?? null,
    aircraftDescription: live.enrichment?.metadata?.aircraftDescription ?? live.aircraftDescription ?? null,
    category: live.category ?? null,
    selectedAltitudeFt: live.targetState?.selectedAltitudeFt ?? null,
    selectedAltitudeSource: live.targetState?.selectedAltitudeSource ?? null,
    stateSource: fusionEligible ? "TRACK_FUSION" : "CANONICAL",
    trackFusionReadiness: readiness.decision,
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
  state: OperationalTwinAircraftState,
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
        lat: state.lat,
        lon: state.lon,
        track: state.trackDeg,
        altitude: state.altitudeFt,
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
  const readiness = service.getTrackFusionReadinessReport(now);
  const fusionConfigured = isTrackFusionDigitalTwinEnabled();
  const fused = fusionConfigured && readiness.decision === "PASS"
    ? service.getTrackFusionShadowTrack(icaoHex)
    : null;
  const fusionEligible = fusionTrackEligible(fused, readiness);
  const live = service.getAircraft(icaoHex, fusionEligible ? "extended" : "local");
  if (!live) return unavailable(icaoHex, "aircraft_not_live");

  const state = aircraftState(live, fused, readiness);
  if (!state) return unavailable(icaoHex, "invalid_position");

  const observedAt = Date.parse(state.observedAt);
  if (
    !Number.isFinite(observedAt)
    || now.getTime() - observedAt > LIVE_POSITION_STALE_MS
    || (state.stateSource !== "TRACK_FUSION" && live.seenPosSeconds !== null && live.seenPosSeconds > 60)
  ) {
    return unavailable(icaoHex, "stale_position", "stale");
  }

  const aviationWeatherEnabled = isAviationWeatherEnabled();
  const [datasetResult, airspaceResult, sigmetResult, pirepResult, predictive] = await Promise.all([
    loadAtcContextDataset()
      .then((value) => ({ ok: true as const, value }))
      .catch(() => ({ ok: false as const, value: null })),
    getAirspacePlan(now)
      .then((value) => ({ ok: true as const, value }))
      .catch(() => ({ ok: false as const, value: null })),
    defaultAviationWeatherProvider.getSigmets(signal)
      .then((value) => ({ ok: true as const, value }))
      .catch(() => ({ ok: false as const, value: null })),
    aviationWeatherEnabled
      ? defaultPirepProvider.getPireps({
          latitude: state.lat,
          longitude: state.lon,
          radiusNm: 300,
          hours: 6,
          altitudeFt: null,
        }, signal)
          .then((value) => ({ ok: true as const, value }))
          .catch(() => ({ ok: false as const, value: null }))
      : Promise.resolve({ ok: false as const, value: null }),
    publicPredictiveContext(icaoHex),
  ]);

  const preparedDataset: PreparedAtcContextDataset | null = datasetResult.value;
  const route = routeSnapshot(live, preparedDataset, state);
  const corridor = buildOperationalTwinCorridor(state, route, now);
  if (!corridor) return unavailable(icaoHex, "corridor_unavailable");

  const trajectoryQualityV2 = buildOperationalTwinTrajectoryQualityV2({
    aircraft: state,
    corridor,
  });
  const trajectoryQualityV3 = buildOperationalTwinTrajectoryQualityV3({
    aircraft: state,
    corridor,
    trajectoryQualityV2,
  });

  const airspacePlan: AirspacePlanSnapshot | null = airspaceResult.value;
  const sigmets: SigmetSnapshot | null = sigmetResult.value;

  const windLevels = [...new Set(
    corridor.points
      .map((point) => windLevelForAltitude(point.altitudeFt))
      .filter((level): level is WindLevelHpa => level !== null),
  )];
  const windResults = await Promise.allSettled(
    windLevels.map((level) => defaultWindAloftProvider.getWind(level)),
  );
  const windSnapshots = windResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);

  const weatherCorridor = buildWeatherCorridorIntelligence({
    corridor,
    pireps: pirepResult.value,
    sigmets,
    windSnapshots,
    now,
  });

  const windTimingShadow = buildOperationalTwinWindTimingShadow({
    corridor,
    weatherCorridor,
    observedGroundSpeedKt: state.groundSpeedKt,
  });

  const navigationIntegrityCurrent = getNavigationIntegrityService().getCurrent("15m", now);
  const navigationIntegrityCorridor = buildNavigationIntegrityCorridorIntelligence({
    corridor,
    current: navigationIntegrityCurrent,
    generatedAt: now,
  });

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

  const situation = buildOperationalTwinSituation({
    generatedAt: now,
    aircraft: state,
    corridor,
    events,
    weatherCorridor,
    windTimingShadow,
    atcAvailable: preparedDataset !== null,
    airspacePlanAvailable: Boolean(airspacePlan && airspacePlan.status !== "unavailable"),
    sigmetAvailable: Boolean(sigmets && sigmetResult.ok),
    publicPredictionAvailable: Boolean(
      predictive.etaAdvisory || predictive.runwayAdvisory || predictive.trajectoryAdvisory,
    ),
  });
  situation.navigationIntegrityCorridor = navigationIntegrityCorridor;
  situation.trajectoryQualityV2 = trajectoryQualityV2;
  situation.trajectoryQualityV3 = trajectoryQualityV3;

  // Truth-first V2 observes the current independent route/SIGMET truth before
  // capturing this request's future predictions, preventing self-validation.
  service.observeOperationalTwinTruthContext({
    icaoHex: state.icaoHex,
    route,
    observed: {
      lat: state.lat,
      lon: state.lon,
      altitudeFt: state.altitudeFt,
    },
    sigmets,
  }, now.getTime());

  // Calibration always consumes the untouched canonical corridor and event
  // timing. Promotion is a presentation policy only and must never rewrite
  // its own evidence or downstream weather/event/ATC semantics.
  service.captureOperationalTwinOutcome(situation);
  service.captureOperationalTwinTrajectoryQualityOutcome(situation);
  service.captureOperationalTwinTrajectoryQualityOutcomeV2(situation);
  service.captureOperationalTwinEventOutcome(situation, { atcDataset: preparedDataset, sigmets, destination });

  const trajectoryPromotion = applyOperationalTwinTrajectoryQualityPromotion({
    corridor: situation.corridor,
    trajectoryQualityV2,
    graduation: service.getOperationalTwinTrajectoryQualityGraduationReport(now),
    configuredPolicy: getOperationalTwinTrajectoryQualityPolicy(),
  });
  const windPromotion = applyOperationalTwinWindTimingPromotion({
    events: situation.events,
    windTimingShadow,
    graduation: service.getOperationalTwinEventOutcomeReport(now).windTimingGraduation,
    configuredPolicy: getOperationalTwinWindTimingPolicy(),
    generatedAt: now,
  });
  const operationalFocus = buildAircraftOperationalFocus({
    generatedAt: now,
    events: windPromotion.events,
    weatherCorridor,
    navigationIntegrityCorridor,
  });
  const finalSituation = {
    ...situation,
    corridor: trajectoryPromotion.corridor,
    trajectoryQualityPromotion: trajectoryPromotion.status,
    events: windPromotion.events,
    windTimingPromotion: windPromotion.status,
    operationalFocus,
  };
  service.captureOperationalFocusOutcome(finalSituation, sigmets);
  return finalSituation;
}
