export const airportTrafficExtra = {
  cs: {
    partialData: "Výsledek překročil bezpečný limit dotazu. Zobrazené počty a žebříčky jsou pouze spodní odhad pro zachycená data.",
  },
  en: {
    partialData: "The result exceeded the safe query limit. Displayed counts and rankings are lower-bound values for the captured data.",
  },
} as const;

export function airportTrafficPartialData(locale: string): string {
  return locale.startsWith("en") ? airportTrafficExtra.en.partialData : airportTrafficExtra.cs.partialData;
}
