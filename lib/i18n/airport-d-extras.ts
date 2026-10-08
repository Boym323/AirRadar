/** Small dedicated bilingual copy for read-only Airport Intelligence stages D2-D4. */
export const airportDExtras = {
  cs: {
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
