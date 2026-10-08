import { AirRadarPageShell } from "@/components/airradar-shell";
import { IntelligencePageContent } from "@/components/intelligence-page-content";
import { getFlightIntelligenceService } from "@/lib/server/flight-intelligence";

export const dynamic = "force-dynamic";

export default async function IntelligencePage() {
  const events = await getFlightIntelligenceService().query({ limit: 50 });
  return <AirRadarPageShell><IntelligencePageContent events={events} /></AirRadarPageShell>;
}
