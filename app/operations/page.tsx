import { AirRadarPageShell } from "@/components/airradar-shell";
import { OperationsDashboard } from "@/components/operations-dashboard";

export const dynamic = "force-dynamic";

export default function OperationsPage() {
  return (
    <AirRadarPageShell>
      <OperationsDashboard />
    </AirRadarPageShell>
  );
}
