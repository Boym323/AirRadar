export function operatorTrafficShare(count: number, observedFlights: number | null): number | null {
  if (observedFlights === null || !Number.isFinite(observedFlights) || observedFlights <= 0) return null;
  if (!Number.isFinite(count) || count < 0) return null;
  return (count / observedFlights) * 100;
}
