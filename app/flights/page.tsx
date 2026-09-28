import { AirRadarPageShell } from "@/components/airradar-shell";
import { FlightsPage } from "@/components/airports-flights-browser";

export const dynamic = "force-dynamic";

export default function FlightsRoute() {
  return <AirRadarPageShell><FlightsPage /></AirRadarPageShell>;
}
