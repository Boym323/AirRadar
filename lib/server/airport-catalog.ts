import type { Airport } from "@/lib/airports/types";

/** Small fallback catalog used by demo mode and when an external route lacks airport details. */
export const SAMPLE_AIRPORTS: Airport[] = [
  { icaoCode: "LKPR", iataCode: "PRG", name: "Václav Havel Airport Prague", city: "Prague", country: "Czechia", latitude: 50.1008, longitude: 14.26 },
  { icaoCode: "OMDB", iataCode: "DXB", name: "Dubai International Airport", city: "Dubai", country: "United Arab Emirates", latitude: 25.2532, longitude: 55.3657 },
  { icaoCode: "EDDF", iataCode: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "Germany", latitude: 50.0379, longitude: 8.5622 },
  { icaoCode: "LOWW", iataCode: "VIE", name: "Vienna International Airport", city: "Vienna", country: "Austria", latitude: 48.1103, longitude: 16.5697 },
  { icaoCode: "EPWA", iataCode: "WAW", name: "Warsaw Chopin Airport", city: "Warsaw", country: "Poland", latitude: 52.1657, longitude: 20.9671 },
  { icaoCode: "LSZH", iataCode: "ZRH", name: "Zurich Airport", city: "Zurich", country: "Switzerland", latitude: 47.4581, longitude: 8.5555 },
];

export function airportFromCode(code: string | null | undefined): Airport | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return SAMPLE_AIRPORTS.find((airport) => airport.icaoCode === normalized || airport.iataCode === normalized) ?? null;
}

