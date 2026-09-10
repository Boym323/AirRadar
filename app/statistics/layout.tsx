import type { ReactNode } from "react";
import StatisticsTrafficIntelligence from "@/components/statistics-traffic-intelligence";

export default function StatisticsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <StatisticsTrafficIntelligence />
    </>
  );
}
