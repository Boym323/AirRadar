import type { Metadata } from "next";
import Link from "next/link";
import { AirRadarPageShell } from "@/components/airradar-shell";
import StatisticsHeatmap from "@/components/statistics-heatmap";
import { PageHeader } from "@/components/ui-primitives";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Historical Traffic Heatmap — AirRadar",
};

export default function HeatmapPage() {
  return (
    <AirRadarPageShell>
      <main className="history-page statistics-page">
        <PageHeader
          className="statistics-page-header"
          backLink={<Link className="back-link" href="/">Back to radar</Link>}
          kicker="AIRRADAR · HISTORICAL TRAFFIC"
          title="Traffic Heatmap"
          description="Sampled spatial density of persisted receiver observations for today, 7 days or 30 days."
        />
        <StatisticsHeatmap />
      </main>
    </AirRadarPageShell>
  );
}
