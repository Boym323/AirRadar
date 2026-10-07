import { AirRadarPageShell } from "@/components/airradar-shell";
import { HistoricalBaselines } from "@/components/historical-baselines";

export const dynamic = "force-dynamic";

export default function HistoricalBaselinesPage() {
  return <AirRadarPageShell><HistoricalBaselines /></AirRadarPageShell>;
}
