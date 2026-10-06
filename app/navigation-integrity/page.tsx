import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { NavigationIntegrityCenter } from "@/components/navigation-integrity-center";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Navigation Integrity — AirRadar",
};

export default function NavigationIntegrityPage() {
  return (
    <AirRadarPageShell>
      <NavigationIntegrityCenter />
    </AirRadarPageShell>
  );
}
