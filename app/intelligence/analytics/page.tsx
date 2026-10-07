import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { FlightIntelligenceAnalytics } from "@/components/flight-intelligence-analytics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Flight Intelligence Analytics — AirRadar",
};

export default function FlightIntelligenceAnalyticsPage() {
  return (
    <AirRadarPageShell>
      <FlightIntelligenceAnalytics />
    </AirRadarPageShell>
  );
}
