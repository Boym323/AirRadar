import { RecapPage } from "@/components/recap-page";
import { AirRadarPageShell } from "@/components/airradar-shell";

export const dynamic = "force-dynamic";

export default function DailyRecapPage() {
  return <AirRadarPageShell><RecapPage range="daily" /></AirRadarPageShell>;
}
