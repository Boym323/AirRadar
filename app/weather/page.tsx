import { AirRadarPageShell } from "@/components/airradar-shell";
import { WeatherOperationsCenter } from "@/components/weather-operations-center";

export const dynamic = "force-dynamic";

export default function WeatherPage() {
  return <AirRadarPageShell><WeatherOperationsCenter /></AirRadarPageShell>;
}
