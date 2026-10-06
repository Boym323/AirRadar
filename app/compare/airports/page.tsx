import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { AirportCompare } from "@/components/airport-compare";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Airport Compare — AirRadar",
};

export default function AirportComparePage() {
  return (
    <AirRadarPageShell>
      <AirportCompare />
    </AirRadarPageShell>
  );
}
