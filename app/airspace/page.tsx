import { AirRadarPageShell } from "@/components/airradar-shell";
import { AtcAirspaceExplorer } from "@/components/atc-airspace-explorer";

export const dynamic = "force-dynamic";

export default function AirspacePage() {
  return <AirRadarPageShell><AtcAirspaceExplorer /></AirRadarPageShell>;
}
