export type AircraftWeatherProfileMode = "temperature" | "wind";

/** Meteorological direction is where the wind comes from. An arrow showing
 * airflow destination therefore needs the reciprocal direction. */
export function airflowDestinationDegrees(meteorologicalDirection: number): number {
  return ((meteorologicalDirection + 180) % 360 + 360) % 360;
}

export function circularDirectionDelta(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

export function confidenceRank(value: string): number {
  return value === "HIGH" ? 4 : value === "MEDIUM" ? 3 : value === "LOW" ? 2 : 1;
}

export function weatherSourceLabel(source: string): string {
  return source === "BDS_4_4" ? "Mode-S BDS 4,4 weather"
    : source === "READSB_JSON" ? "Aircraft / local readsb"
      : source === "DERIVED" ? "Derived aircraft telemetry" : "Aircraft weather";
}

export function formatFlightLevel(altitudeFt: number): string {
  return `FL${Math.max(0, Math.round(altitudeFt / 100)).toString().padStart(3, "0")}`;
}
