import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { MobileSpotterMode } from "@/components/mobile-spotter-mode";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Spotter — AirRadar",
};

export default function SpotterPage() {
  return <AirRadarPageShell><MobileSpotterMode /></AirRadarPageShell>;
}
