import { AirRadarPageShell } from "@/components/airradar-shell";
import { AirportsPage } from "@/components/airports-flights-browser";

export const dynamic = "force-dynamic";

export default function AirportsRoute() {
  return <AirRadarPageShell><AirportsPage /></AirRadarPageShell>;
}
