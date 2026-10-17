import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { registerShutdownCoordinator } from "@/lib/server/shutdown";
import { defaultMapContextArchiveService } from "@/lib/server/map-context";
import { startRuntimeTelemetry } from "@/lib/server/runtime-telemetry";
import { getAlertDeliveryWorker } from "@/lib/server/alert-delivery-worker";
import { startRuntimeHealthObservation } from "@/lib/server/runtime-health-observation";
import { startRuntimeStallEvidence } from "@/lib/server/runtime-stall-evidence";
import { startT58CpuProfile } from "@/lib/server/t58-cpu-profile";
import { getRxwHubService } from "@/lib/server/rxw-hub-service";

registerShutdownCoordinator();
startRuntimeHealthObservation();
void startT58CpuProfile(); // One-shot T58 canary; starts before live polling.
startRuntimeStallEvidence(); // Opt-in, bounded, and inactive by default.

// Aircraft collection is a server responsibility, not a client-triggered side
// effect. Start readsb/network polling, history persistence, statistics and
// enrichment as soon as the Node runtime is ready so the first radar client
// receives an already-warm snapshot. start() is idempotent, so existing
// request/subscription readiness paths remain safe.
getAircraftStateService().start();
startRuntimeTelemetry();
getAlertDeliveryWorker().start();
getRxwHubService().start(); // Opt-in; creates no external connection while disabled.

void defaultMapContextArchiveService.start();
