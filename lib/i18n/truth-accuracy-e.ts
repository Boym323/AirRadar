/** E-stage operator-only wording. No extra dictionary expansion in the hot path. */
export const truthAccuracyCopy = {
  cs: {
    heading: "Ověřená přesnost · etapa E",
    subtitle: "Jedna nejstarší predikce na let a schopnost; bez nezávislého výsledku nevzniká chybové skóre.",
    airportHeading: "Výsledky podle letiště",
    phaseHeading: "Výsledky podle fáze letu",
    confidenceHeading: "Empirická úspěšnost podle důvěryhodnosti",
    flights: "Lety",
    confirmed: "Nezávisle vyhodnoceno",
    coverage: "Pokrytí",
    accuracy: "Přesnost dráhy",
    eta: "Průměrná chyba ETA",
    noTruth: "Zatím nedostatek potvrzených výsledků",
    insufficient: "Málo důkazů",
    incomplete: "Neúplný sběr",
    measured: "Vyhodnoceno",
    confidenceRule: "ETA v toleranci 5 min / přesný konec dráhy",
    decision: "Doporučení kvality",
    decisions: {
      SOURCE_UNAVAILABLE: "Zdroj nepřístupný",
      COLLECTION_INCOMPLETE: "Neúplná data",
      INSUFFICIENT_TRUTH: "Potřebujeme více potvrzených letů",
      REVIEW_QUALITY: "Prověřit přesnost",
      MONITOR: "Pokračovat ve sledování",
    },
    disclaimer: "Výsledky jsou retrospektivní audit, ne certifikace. Nedokazují úplné zachycení go-around, příkazy ATC ani připravenost k automatickému PUBLIC zveřejnění.",
  },
  en: {
    heading: "Verified accuracy · stage E",
    subtitle: "Earliest prediction per flight and capability; missing independent outcomes never become prediction errors.",
    airportHeading: "Airport outcomes",
    phaseHeading: "Results by flight phase",
    confidenceHeading: "Empirical confidence success rates",
    flights: "Flights",
    confirmed: "Independently scored",
    coverage: "Coverage",
    accuracy: "Runway accuracy",
    eta: "ETA mean absolute error",
    noTruth: "Insufficient confirmed outcomes",
    insufficient: "Insufficient evidence",
    incomplete: "Incomplete collection",
    measured: "Measured",
    confidenceRule: "ETA within 5 min / exact runway end",
    decision: "Quality recommendation",
    decisions: {
      SOURCE_UNAVAILABLE: "Source unavailable",
      COLLECTION_INCOMPLETE: "Incomplete collection",
      INSUFFICIENT_TRUTH: "More independently confirmed flights required",
      REVIEW_QUALITY: "Investigate accuracy",
      MONITOR: "Continue monitoring",
    },
    disclaimer: "Retrospective audit, not certification. Does not establish complete go-around recall, ATC clearances, or automatic PUBLIC eligibility.",
  },
} as const;

export function truthAccuracyText(locale: string) {
  return locale.startsWith("en") ? truthAccuracyCopy.en : truthAccuracyCopy.cs;
}
