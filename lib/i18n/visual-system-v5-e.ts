/** Visible UI copy shared by Visual System V5-E map and airport workflows. */
export const visualSystemV5E = {
  cs: {
    focusMap: "Jen mapa",
    leaveFocusMap: "Zobrazit panely",
    focusMapCompact: "Mapa",
    leaveFocusMapCompact: "Panely",
    focusMapHint: "Dočasně zvětšit mapu bez skrytí dat nebo změny filtrů",
    airportNearbyAll: "Vše",
    airportNearbyArrivals: "Přibližující se",
    airportNearbyDepartures: "Odlétající",
    airportRadarLink: "Na radaru",
    airportRadarHint: "Otevřít živý radar s vybraným letadlem",
    routeEvidence: "Vrstvy trasy",
    routeEstimated: "Modelovaná nebo veřejná část trasy",
    routeObserved: "Skutečně zachycená stopa",
    routeCurrent: "Aktuální segment modelu",
    routeUncertainty: "Trasa je orientační; modelované úseky neprokazují skutečný průlet",
    flightProgress: "Odhad postupu po trase",
  },
  en: {
    focusMap: "Map focus",
    leaveFocusMap: "Show panels",
    focusMapCompact: "Map",
    leaveFocusMapCompact: "Panels",
    focusMapHint: "Expand the map temporarily without changing filters or data",
    airportNearbyAll: "All",
    airportNearbyArrivals: "Approaching",
    airportNearbyDepartures: "Departing",
    airportRadarLink: "On radar",
    airportRadarHint: "Open the live radar with this aircraft selected",
    routeEvidence: "Route evidence",
    routeEstimated: "Modeled or public route segment",
    routeObserved: "Receiver-observed track",
    routeCurrent: "Current modeled segment",
    routeUncertainty: "The route is indicative; modeled segments do not prove actual transit",
    flightProgress: "Estimated route progress",
  },
} as const;
export function visualSystemV5EText(locale: string) {
  return locale.startsWith("en") ? visualSystemV5E.en : visualSystemV5E.cs;
}
