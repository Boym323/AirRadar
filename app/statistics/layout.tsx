import type { ReactNode } from "react";
import StatisticsTrafficIntelligence from "@/components/statistics-traffic-intelligence";
import StatisticsCoverageIntelligence from "@/components/statistics-coverage-intelligence";
import { AirRadarPageShell } from "@/components/airradar-shell";

export default function StatisticsLayout({ children }: { children: ReactNode }) {
  return (
    <AirRadarPageShell>
      {children}
      <StatisticsTrafficIntelligence />
      <StatisticsCoverageIntelligence />
    </AirRadarPageShell>
  );
}
