import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getRxwHubService } from "@/lib/server/rxw-hub-service";
import { getRouteEnrichmentTelemetry } from "@/lib/server/route-enrichment-telemetry";
import { getAdsbLolRoutesetRuntimeDiagnostics } from "@/lib/server/adsblol-route-provider";
import { getRouteDbReasonDiagnostics } from "@/lib/server/route-postgres-cache";
import { getNavigationIntegrityService } from "@/lib/server/navigation-integrity";

/** Read-only, process-local status; never calls upstream, starts receivers or queries DB. */
export function getIntegrationDiagnostics() {
  const route = getRouteEnrichmentTelemetry().getSnapshot();
  const navigation = getNavigationIntegrityService().getDiagnostics();
  return {
    rxw: getRxwHubService().getDiagnostics(),
    adsbhub: getAircraftStateService().getNetworkDiagnostics().adsbhubLane ?? null,
    routeProviders: {
      routeset: getAdsbLolRoutesetRuntimeDiagnostics(),
      postgres: getRouteDbReasonDiagnostics(),
    },
    route: {
      enabled: route.enabled,
      dbHit: route.totals.dbHit,
      dbMiss: route.totals.dbMiss,
      dbError: route.totals.dbError,
      dbBypassed: route.totals.dbBypassed,
      dbWrite: route.totals.dbWrite,
      validEntries: route.validEntries,
      telemetryFailures: route.telemetry.failures,
      lastSavedAt: route.telemetry.lastSavedAt,
    },
    navigation: {
      observationsCreated: navigation.observationsCreated,
      rejectedInvalidOrStale: navigation.rejectedInvalidOrStale,
      rejectionReasons: { ...navigation.rejectionReasons },
    },
  };
}
