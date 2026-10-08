/** Browser-only localized document metadata. Server renders the Czech default. */
const titles: Record<string, { cs: string; en: string }> = {
  "/": { cs: "AirRadar — osobní radar leteckého provozu", en: "AirRadar — Personal aviation radar" },
  "/my-airradar": { cs: "Můj AirRadar — AirRadar", en: "My AirRadar — AirRadar" },
  "/history": { cs: "Historie letů — AirRadar", en: "Flight History — AirRadar" },
  "/statistics": { cs: "Statistiky — AirRadar", en: "Statistics — AirRadar" },
  "/heatmap": { cs: "Mapa hustoty provozu — AirRadar", en: "Traffic Heatmap — AirRadar" },
  "/watchlist": { cs: "Sledovaná letadla — AirRadar", en: "Watchlist — AirRadar" },
  "/fleet": { cs: "Flotily — AirRadar", en: "Fleets — AirRadar" },
  "/alerts": { cs: "Historie upozornění — AirRadar", en: "Alert History — AirRadar" },
  "/notifications": { cs: "Centrum oznámení — AirRadar", en: "Notification Center — AirRadar" },
  "/system": { cs: "Stav systému — AirRadar", en: "System Status — AirRadar" },
  "/receiver/coverage": { cs: "Analýza přijímače — AirRadar", en: "Receiver Coverage — AirRadar" },
  "/intelligence": { cs: "Analýza letů — AirRadar", en: "Flight Intelligence — AirRadar" },
  "/intelligence/analytics": { cs: "Analýza letových událostí — AirRadar", en: "Flight Intelligence Analytics — AirRadar" },
  "/discover": { cs: "Objevování letadel — AirRadar", en: "Aircraft Discovery — AirRadar" },
  "/aircraft-types": { cs: "Typy letadel — AirRadar", en: "Aircraft Types — AirRadar" },
  "/operators": { cs: "Letecké společnosti — AirRadar", en: "Airlines & Operators — AirRadar" },
  "/records": { cs: "Rekordy příjmu — AirRadar", en: "Reception Records — AirRadar" },
  "/routes": { cs: "Síť tras — AirRadar", en: "Route Network — AirRadar" },
  "/airports": { cs: "Letiště — AirRadar", en: "Airports — AirRadar" },
  "/flights": { cs: "Lety — AirRadar", en: "Flights — AirRadar" },
  "/airspace": { cs: "Vzdušný prostor — AirRadar", en: "Airspace — AirRadar" },
  "/weather": { cs: "Letecké počasí — AirRadar", en: "Aviation Weather — AirRadar" },
  "/navigation-integrity": { cs: "Integrita navigace — AirRadar", en: "Navigation Integrity — AirRadar" },
  "/navigation": { cs: "Navigační body — AirRadar", en: "Navigation Reference — AirRadar" },
  "/procedures": { cs: "Letové postupy — AirRadar", en: "Procedure Explorer — AirRadar" },
  "/operations": { cs: "Provozní přehled — AirRadar", en: "Operations — AirRadar" },
  "/events": { cs: "Letecké události — AirRadar", en: "Aviation Events — AirRadar" },
  "/spotter": { cs: "Pozorování letadel — AirRadar", en: "Spotter — AirRadar" },
  "/time-machine": { cs: "Historická časová osa — AirRadar", en: "Time Machine — AirRadar" },
  "/traffic/geography": { cs: "Geografie provozu — AirRadar", en: "Traffic Geography — AirRadar" },
  "/traffic/rhythm": { cs: "Rytmus provozu — AirRadar", en: "Traffic Rhythm — AirRadar" },
  "/compare/airports": { cs: "Porovnání letišť — AirRadar", en: "Airport Compare — AirRadar" },
  "/compare/flights": { cs: "Porovnání letů — AirRadar", en: "Flight Compare — AirRadar" },
  "/journeys": { cs: "Sledované cesty — AirRadar", en: "Followed Journeys — AirRadar" },
  "/workspaces": { cs: "Uložená pracoviště — AirRadar", en: "Saved Workspaces — AirRadar" },
  "/baselines": { cs: "Historické referenční hodnoty — AirRadar", en: "Historical Baselines — AirRadar" },
  "/recap/daily": { cs: "Denní souhrn — AirRadar", en: "Daily Recap — AirRadar" },
  "/recap/weekly": { cs: "Týdenní souhrn — AirRadar", en: "Weekly Recap — AirRadar" },
  "/admin/alerts": { cs: "Správa upozornění — AirRadar", en: "Alert Administration — AirRadar" },
  "/admin/alerts/analytics": { cs: "Účinnost upozornění — AirRadar", en: "Alert Effectiveness — AirRadar" },
  "/admin/alerts/delivery-health": { cs: "Doručování upozornění — AirRadar", en: "Alert Delivery Health — AirRadar" },
  "/admin/alerts/simulator": { cs: "Simulátor upozornění — AirRadar", en: "Alert Rule Simulator — AirRadar" },
  "/admin/operational-twin/calibration": { cs: "Kalibrace digitálního dvojčete — AirRadar", en: "Digital Twin Calibration — AirRadar" },
};

export function localizedPageMetadata(pathname: string, locale: "cs" | "en"): { title: string | null; description: string } {
  const description = locale === "cs"
    ? "Soukromý radar pro přehled leteckého provozu v okolí."
    : "Private radar for nearby aviation traffic and flight intelligence.";
  const path = pathname.replace(/\/$/, "") || "/";
  // Preserve accurate dynamic entity titles generated on the server.
  return { title: titles[path]?.[locale] ?? null, description };
}
