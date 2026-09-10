import { t } from "@/lib/i18n";

const cs = {
  title: "Provozní statistiky",
  description: "Přijaté lety a nejčastější provoz podle uložených pozorování přijímače.",
  rangeSelector: "Období provozních statistik",
  today: "Dnes",
  sevenDays: "7 dní",
  thirtyDays: "30 dní",
  observedFlights: "Pozorované lety",
  aircraftTypes: "Typy letadel",
  airlines: "Letecké společnosti",
  routes: "Trasy",
  origins: "Odletová letiště",
  destinations: "Příletová letiště",
  registrationCountries: "Země registrace",
  exportCsv: "Export provozu CSV",
  loading: "Načítám provozní statistiky…",
  unavailable: "Provozní statistiky jsou dočasně nedostupné. Živý radar tím není ovlivněn.",
  noData: "Pro zvolené období zatím nejsou uložená data.",
  metricNote: "Počty představují uložené Flight instance pozorované tímto přijímačem. Nejde o počet pozic ani o oficiální statistiku letového provozu.",
};

const en = {
  title: "Traffic intelligence",
  description: "Observed flights and the most common traffic in this receiver’s persisted history.",
  rangeSelector: "Traffic intelligence range",
  today: "Today",
  sevenDays: "7 days",
  thirtyDays: "30 days",
  observedFlights: "Observed flights",
  aircraftTypes: "Aircraft types",
  airlines: "Airlines",
  routes: "Routes",
  origins: "Origin airports",
  destinations: "Destination airports",
  registrationCountries: "Registration countries",
  exportCsv: "Export traffic CSV",
  loading: "Loading traffic intelligence…",
  unavailable: "Traffic intelligence is temporarily unavailable. Live radar is unaffected.",
  noData: "No persisted data is available for the selected period yet.",
  metricNote: "Counts are persisted Flight instances observed by this receiver. They are neither position counts nor official air-traffic totals.",
};

export const statisticsTrafficText = t.locale.startsWith("cs") ? cs : en;
