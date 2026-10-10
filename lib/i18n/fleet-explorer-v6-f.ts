export function fleetExplorerCopy(locale: string) {
  const cs = locale.startsWith("cs");
  return cs ? {
    title: "Procházení flotily", summary: "Souhrn flotily", total: "Celkem", live: "Právě zachyceno", offline: "Offline",
    observations30d: "Pozorování za 30 dní", search: "Hledat", searchPlaceholder: "ICAO, registrace, provozovatel…",
    filter: "Stav", all: "Všechna", sort: "Řazení", mostRecent: "Poslední zachycení", mostObserved: "Nejvíce pozorování",
    registration: "Registrace", displayed: (visible: number, total: number) => `Zobrazeno ${visible} z ${total}`,
    snapshotNote: "Momentka seznamu, nikoliv globální flotila", noMatches: "Filtru neodpovídá žádné letadlo.",
  } : {
    title: "Fleet explorer", summary: "Fleet summary", total: "Total", live: "Currently tracked", offline: "Offline",
    observations30d: "30-day observations", search: "Search", searchPlaceholder: "ICAO, registration, operator…",
    filter: "Status", all: "All", sort: "Sort", mostRecent: "Most recently observed", mostObserved: "Most observations",
    registration: "Registration", displayed: (visible: number, total: number) => `Showing ${visible} of ${total}`,
    snapshotNote: "A watchlist snapshot, not a worldwide fleet", noMatches: "No aircraft match your filters.",
  };
}
