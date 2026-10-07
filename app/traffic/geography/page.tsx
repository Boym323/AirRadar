import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { TrafficGeography } from "@/components/traffic-geography";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Traffic Geography — AirRadar",
};

export default function TrafficGeographyPage() {
  return (
    <AirRadarPageShell>
      <TrafficGeography />
    </AirRadarPageShell>
  );
}
