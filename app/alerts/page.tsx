import { AlertHistoryPage } from "@/components/alert-history-page";
import { AirRadarPageShell } from "@/components/airradar-shell";

export const dynamic = "force-dynamic";

export default function AlertsPage() {
  return <AirRadarPageShell><AlertHistoryPage /></AirRadarPageShell>;
}
