import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { FlightCompare } from "@/components/flight-compare";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Flight Compare — AirRadar" };
}

export default function FlightComparePage() {
  return <AirRadarPageShell><FlightCompare /></AirRadarPageShell>;
}
