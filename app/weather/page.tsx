import { AirRadarPageShell } from "@/components/airradar-shell";
import { WeatherOperationsCenter } from "@/components/weather-operations-center";
import { AladinWindComparison } from "@/components/aladin-wind-comparison";

export const dynamic = "force-dynamic";

export default function WeatherPage() {
  return <AirRadarPageShell><WeatherOperationsCenter /><AladinWindComparison /></AirRadarPageShell>;
}
