import { FleetPage } from "@/components/fleet-page";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getFleetSnapshot } from "@/lib/server/fleet";

export const dynamic = "force-dynamic";

export default async function FleetRoute() {
  const service = getAircraftStateService();
  await service.waitForReady();
  const data = await getFleetSnapshot(service.getSnapshot().aircraft);
  return <FleetPage data={data} />;
}
