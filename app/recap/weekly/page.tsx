import { RecapPage } from "@/components/recap-page";
import { AirRadarPageShell } from "@/components/airradar-shell";

export const dynamic = "force-dynamic";

export default function WeeklyRecapPage() {
  return <AirRadarPageShell><RecapPage range="weekly" /></AirRadarPageShell>;
}
