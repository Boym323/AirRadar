import { t } from "@/lib/i18n";

const cs = {
  title: "Heatmapa zachyceného provozu",
  description: "Prostorová hustota uložených ADS-B pozic v čase.",
  rangeSelector: "Období heatmapy",
  today: "Dnes",
  sevenDays: "7 dní",
  thirtyDays: "30 dní",
  loading: "Načítám heatmapu…",
  unavailable: "Heatmapa je dočasně nedostupná. Živý radar tím není ovlivněn.",
  noData: "Pro zvolené období nejsou uložená pozorování.",
  sampled: "pozic ve vzorku",
  maxCell: "maximum v buňce",
  exportCsv: "Export heatmapy CSV",
  disclaimer: "Heatmapa zobrazuje hustotu uložených pozic přijímače, nikoli skutečnou hustotu provozu ani přesné hranice pokrytí.",
};

const en = {
  title: "Observed traffic heatmap",
  description: "Spatial density of persisted ADS-B positions over time.",
  rangeSelector: "Heatmap range",
  today: "Today",
  sevenDays: "7 days",
  thirtyDays: "30 days",
  loading: "Loading heatmap…",
  unavailable: "The heatmap is temporarily unavailable. Live radar is unaffected.",
  noData: "No persisted observations are available for the selected period.",
  sampled: "sampled positions",
  maxCell: "maximum in a cell",
  exportCsv: "Export heatmap CSV",
  disclaimer: "The heatmap shows persisted receiver positions, not actual traffic density or exact coverage boundaries.",
};

export const statisticsHeatmapText = t.locale.startsWith("cs") ? cs : en;
