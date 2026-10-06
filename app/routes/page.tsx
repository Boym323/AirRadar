import { AirRadarPageShell } from "@/components/airradar-shell";
import { RouteNetworkExplorer } from "@/components/route-network-explorer";

export const dynamic = "force-dynamic";

export default function RoutesPage() {
  return <AirRadarPageShell><RouteNetworkExplorer /></AirRadarPageShell>;
}
