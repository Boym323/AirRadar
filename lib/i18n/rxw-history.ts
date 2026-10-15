/** Standalone localized copy for the optional historical ACARS route panel. */
export function rxwHistoryCopy(locale: string) {
  return locale.startsWith("cs") ? {
    title: "Archiv tras ACARS / VDL2",
    subtitle: "Historicky zachycené, neověřené údaje z RXW Hubu",
    typeFpn: "FMS letový plán (H1/FPN)",
    typePair: "Hlášená letiště (bez bodové trasy)",
    captured: "Zachyceno",
    points: "waypointů",
    located: "se souřadnicemi",
    source: "Zdroj",
    note: "Plán hlášený letadlem; nejde o skutečně proletěnou trasu. Čáry spojují jen sousední body s výslovnými souřadnicemi. Historie ADS-B je zobrazena odděleně.",
    noCoordinates: "Zpráva obsahovala pouze odletové a cílové letiště nebo waypointy bez souřadnic; přesnou trasu nelze vykreslit.",
  } : {
    title: "ACARS / VDL2 route archive",
    subtitle: "Historical, unverified RXW Hub route evidence",
    typeFpn: "FMS flight plan (H1/FPN)",
    typePair: "Reported airport pair (no waypoint trail)",
    captured: "Received",
    points: "waypoints",
    located: "with coordinates",
    source: "Source",
    note: "Aircraft-reported plan, not a flown track. Lines join only adjacent fixes with explicit coordinates. Observed ADS-B history is shown separately.",
    noCoordinates: "Only airport pairs or non-georeferenced fixes were reported; a precise route cannot be drawn.",
  };
}
