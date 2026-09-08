export function aircraftAirportHref(code: string): `/airports/${string}` {
  return `/airports/${encodeURIComponent(code)}` as `/airports/${string}`;
}

export function aircraftHistoryHref(id: number): `/history?flightId=${string}` {
  return `/history?flightId=${encodeURIComponent(String(id))}` as `/history?flightId=${string}`;
}

export function aircraftWatchlistHref(icaoHex: string, registration?: string | null): `/watchlist?${string}` {
  const params = new URLSearchParams({ icaoHex });
  if (registration) params.set("registration", registration);
  return `/watchlist?${params.toString()}` as `/watchlist?${string}`;
}
