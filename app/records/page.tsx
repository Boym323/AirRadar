import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { ReceptionRecordsCenter } from "@/components/reception-records-center";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reception Records — AirRadar",
};

export default function ReceptionRecordsPage() {
  return (
    <AirRadarPageShell>
      <ReceptionRecordsCenter />
    </AirRadarPageShell>
  );
}
