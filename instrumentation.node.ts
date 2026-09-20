import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { registerShutdownCoordinator } from "@/lib/server/shutdown";
import { defaultMapContextArchiveService } from "@/lib/server/map-context";

registerShutdownCoordinator();

// Aircraft collection is a server responsibility, not a client-triggered side
// effect. Start readsb/network polling, history persistence, statistics and
// enrichment as soon as the Node runtime is ready so the first radar client
// receives an already-warm snapshot. start() is idempotent, so existing
// request/subscription readiness paths remain safe.
getAircraftStateService().start();

void defaultMapContextArchiveService.start();
