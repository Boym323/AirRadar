"use client";

import Link from "next/link";
import StatisticsHeatmap from "@/components/statistics-heatmap";
import { PageHeader } from "@/components/ui-primitives";
import { t } from "@/lib/i18n";
import { pageExtrasCopy } from "@/lib/i18n/page-extras";

export function HeatmapPageContent() {
  const copy = pageExtrasCopy(t.locale).heatmap;
  return (
    <main className="history-page statistics-page">
      <PageHeader
        className="statistics-page-header"
        backLink={<Link className="back-link" href="/">{copy.back}</Link>}
        kicker={copy.kicker}
        title={copy.title}
        description={copy.description}
      />
      <StatisticsHeatmap />
    </main>
  );
}
