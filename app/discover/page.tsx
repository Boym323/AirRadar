import { AirRadarPageShell } from "@/components/airradar-shell";
import { AircraftDiscovery } from "@/components/aircraft-discovery";

export const dynamic = "force-dynamic";

export default function DiscoverPage() {
  return <AirRadarPageShell><AircraftDiscovery /></AirRadarPageShell>;
}
