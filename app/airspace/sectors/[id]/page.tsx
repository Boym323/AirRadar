import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { AtcSectorDetail } from "@/components/atc-sector-detail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ATC Sector Detail — AirRadar",
};

export default async function AtcSectorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AirRadarPageShell>
      <AtcSectorDetail sectorId={id.trim().toUpperCase()} />
    </AirRadarPageShell>
  );
}
