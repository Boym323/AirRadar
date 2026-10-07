import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { NavigationReferenceExplorer } from "@/components/navigation-reference-explorer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Navigation Reference — AirRadar",
};

export default function NavigationReferencePage() {
  return (
    <AirRadarPageShell>
      <NavigationReferenceExplorer />
    </AirRadarPageShell>
  );
}
