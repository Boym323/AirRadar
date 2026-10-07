import { AirRadarPageShell } from "@/components/airradar-shell";
import { FollowedJourneys } from "@/components/followed-journeys";

export const dynamic = "force-dynamic";

export default function JourneysPage() {
  return <AirRadarPageShell><FollowedJourneys /></AirRadarPageShell>;
}
