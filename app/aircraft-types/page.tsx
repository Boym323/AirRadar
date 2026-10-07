import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { AircraftTypeExplorer } from "@/components/aircraft-type-explorer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aircraft Types — AirRadar",
};

export default function AircraftTypesPage() {
  return (
    <AirRadarPageShell>
      <AircraftTypeExplorer />
    </AirRadarPageShell>
  );
}
