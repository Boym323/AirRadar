export function aircraftAirportHref(code: string): `/airports/${string}` {
  return `/airports/${encodeURIComponent(code)}` as `/airports/${string}`;
}

export function aircraftHistoryHref(id: number): `/history?flightId=${string}` {
  return `/history?flightId=${encodeURIComponent(String(id))}` as `/history?flightId=${string}`;
}
