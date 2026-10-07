import { AirRadarPageShell } from "@/components/airradar-shell";
import { AviationEventFeed } from "@/components/aviation-event-feed";

export const dynamic = "force-dynamic";

export default function AviationEventFeedPage() {
  return <AirRadarPageShell><AviationEventFeed /></AirRadarPageShell>;
}
