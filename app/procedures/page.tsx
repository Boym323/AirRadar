import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { ProcedureExplorer } from "@/components/procedure-explorer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Procedure Explorer — AirRadar",
};

export default function ProceduresPage() {
  return (
    <AirRadarPageShell>
      <ProcedureExplorer />
    </AirRadarPageShell>
  );
}
