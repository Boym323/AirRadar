import { SystemStatusPage } from "@/components/system-status-page";
import { AirRadarPageShell } from "@/components/airradar-shell";

export const dynamic = "force-dynamic";

export default function SystemPage() {
  return <AirRadarPageShell><SystemStatusPage /></AirRadarPageShell>;
}
