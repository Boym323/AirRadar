import type { ReactNode } from "react";
import StatisticsTrafficIntelligence from "@/components/statistics-traffic-intelligence";
import StatisticsCoverageIntelligence from "@/components/statistics-coverage-intelligence";

export default function StatisticsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <StatisticsTrafficIntelligence />
      <StatisticsCoverageIntelligence />
    </>
  );
}
