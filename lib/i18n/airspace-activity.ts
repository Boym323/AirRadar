export const airspaceActivityMapTranslations = {
  cs: {
    plannedNow: "PLÁNOVÁNO NYNÍ",
    upcoming: "PLÁNOVÁNO",
    plannedAllocation: "AUP/UUP plán",
    timeWindow: "Čas UTC",
    levels: "Plánovaný rozsah",
    source: "Zdroj plánu",
    responsibleUnit: "Zodpovědné stanoviště",
    activity: "Aktivita",
    stale: "STALE",
    staleNote: "Zobrazen je poslední dostupný plán.",
    disclaimer: "AUP/UUP je plán využití prostoru, nikoli potvrzení skutečné provozní aktivace.",
    legendCurrent: "Plánováno nyní",
    legendUpcoming: "Plánováno později",
  },
  en: {
    plannedNow: "PLANNED NOW",
    upcoming: "PLANNED",
    plannedAllocation: "AUP/UUP plan",
    timeWindow: "UTC window",
    levels: "Planned levels",
    source: "Plan source",
    responsibleUnit: "Responsible unit",
    activity: "Activity",
    stale: "STALE",
    staleNote: "Showing the last available plan.",
    disclaimer: "AUP/UUP is a planned airspace allocation, not confirmation of actual operational activation.",
    legendCurrent: "Planned now",
    legendUpcoming: "Planned later",
  },
} as const;

export const airspaceActivityMapT = airspaceActivityMapTranslations.cs;
