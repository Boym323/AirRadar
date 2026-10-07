import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { OperatorExplorer } from "@/components/operator-explorer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Airlines & Operators — AirRadar",
};

export default function OperatorsPage() {
  return (
    <AirRadarPageShell>
      <OperatorExplorer />
    </AirRadarPageShell>
  );
}
