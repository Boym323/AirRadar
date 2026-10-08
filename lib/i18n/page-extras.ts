/** Copy for route-level labels whose presentation is rendered on the client. */
const cs = {
  heatmap: {
    back: "Zpět na radar",
    kicker: "AIRRADAR · HISTORICKÝ PROVOZ",
    title: "Mapa hustoty provozu",
    description: "Prostorová hustota uložených pozorování přijímače pro dnešek, sedm nebo třicet dní.",
  },
  intelligence: { kicker: "ŽIVÁ ANALÝZA", analytics: "Analýza" },
};
const en: typeof cs = {
  heatmap: {
    back: "Back to radar",
    kicker: "AIRRADAR · HISTORICAL TRAFFIC",
    title: "Traffic Heatmap",
    description: "Sampled spatial density of persisted receiver observations for today, 7 days or 30 days.",
  },
  intelligence: { kicker: "LIVE INTELLIGENCE", analytics: "Analytics" },
};
export function pageExtrasCopy(locale: string): typeof cs {
  return locale.startsWith("cs") ? cs : en;
}
