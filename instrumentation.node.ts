import { registerShutdownCoordinator } from "@/lib/server/shutdown";
import { defaultMapContextArchiveService } from "@/lib/server/map-context";

registerShutdownCoordinator();
void defaultMapContextArchiveService.start();
