import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { HeatmapPageContent } from "@/components/heatmap-page-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mapa hustoty provozu — AirRadar" };

export default function HeatmapPage() {
  return <AirRadarPageShell><HeatmapPageContent /></AirRadarPageShell>;
}
