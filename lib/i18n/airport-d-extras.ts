/** Small dedicated bilingual copy for read-only Airport Intelligence stages D2-D4. */
export const airportDExtras = {
  cs: {
    approachHeading: "Evidence průběhu přiblížení",
    reapproach: "Opakované přiblížení po go-around",
    goAround: "Pozorovaný go-around",
    holding: "Pozorovaný holding",
    finalApproach: "Final s ověřeným přiblížením",
    approach: "Pozorované přiblížení",
    liveOnly: "Pouze živá fáze — bez historického potvrzení",
    noApproach: "Žádné současné přílety s dostatečnými podklady.",
    approachDisclaimer: "Pohyb musí souhlasit s ICAO identitou a časem. Neúplné záznamy neprokazují přistání ani přechod fáze.",
    runwayHeading: "Evidence změny dráhy",
    observedTransition: "Pozorovaná změna provozu",
    predictedDivergence: "Predikce se liší od pozorování",
    observedStable: "Pozorovaný provoz stabilní",
    unknown: "Nedostatek průkazných dat",
    runwayDetail: (previous: string | null, current: string | null, samples: number) =>
      `${previous ?? "?"} → ${current ?? "?"} · nyní ${samples} letů`,
    runwayDisclaimer: "Jde o porovnání pozorovaných pohybů a pouze veřejných predikcí, nikoliv potvrzenou volbu dráhy nebo pokyn ATC.",
  },
  en: {
    approachHeading: "Approach evolution evidence",
    reapproach: "Re-approach after observed go-around",
    goAround: "Observed go-around",
    holding: "Observed holding",
    finalApproach: "Final with correlated approach evidence",
    approach: "Observed approach",
    liveOnly: "Live stage only — no historical confirmation",
    noApproach: "No active arrivals with sufficient evidence.",
    approachDisclaimer: "Movements must match ICAO identity and time. Incomplete tracks do not prove landing or stage transitions.",
    runwayHeading: "Runway change evidence",
    observedTransition: "Observed traffic transition",
    predictedDivergence: "Prediction differs from observations",
    observedStable: "Observed traffic stable",
    unknown: "Insufficient reliable evidence",
    runwayDetail: (previous: string | null, current: string | null, samples: number) =>
      `${previous ?? "?"} → ${current ?? "?"} · current ${samples} flights`,
    runwayDisclaimer: "This compares observed movements and PUBLIC advisories; it is not a confirmed runway assignment or ATC instruction.",
  },
} as const;
export function airportDText(locale: string) {
  return locale.startsWith("en") ? airportDExtras.en : airportDExtras.cs;
}
