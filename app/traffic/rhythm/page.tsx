import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { TrafficRhythmAnalytics } from "@/components/traffic-rhythm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Traffic Rhythm — AirRadar",
};

export default function TrafficRhythmPage() {
  return (
    <AirRadarPageShell>
      <TrafficRhythmAnalytics />
    </AirRadarPageShell>
  );
}
