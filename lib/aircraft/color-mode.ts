import type { AircraftView } from "@/lib/aircraft/types";

export type AircraftColorMode = "default" | "altitude" | "speed" | "verticalRate";

export const AIRCRAFT_COLOR_MODES: readonly AircraftColorMode[] = ["default", "altitude", "speed", "verticalRate"];
export const AIRCRAFT_COLOR_FALLBACK = "#90a4b8";

function finite(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function interpolate(start: readonly number[], end: readonly number[], ratio: number): string {
  const value = start.map((channel, index) => Math.round(channel + (end[index] - channel) * ratio));
  return `rgb(${value[0]}, ${value[1]}, ${value[2]})`;
}

function normalized(value: number, minimum: number, maximum: number): number {
  return Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)));
}

function altitudeColor(value: number | null): string {
  const altitude = finite(value);
  if (altitude === null) return AIRCRAFT_COLOR_FALLBACK;
  return interpolate([55, 214, 192], [243, 185, 95], normalized(altitude, 0, 40_000));
}

function speedColor(value: number | null): string {
  const speed = finite(value);
  if (speed === null) return AIRCRAFT_COLOR_FALLBACK;
  return interpolate([155, 140, 255], [55, 214, 192], normalized(speed, 0, 600));
}

function verticalRateColor(value: number | null): string {
  const verticalRate = finite(value);
  if (verticalRate === null) return AIRCRAFT_COLOR_FALLBACK;
  if (verticalRate < 0) return interpolate([120, 174, 255], [144, 164, 184], normalized(verticalRate, -3_000, 0));
  return interpolate([144, 164, 184], [243, 185, 95], normalized(verticalRate, 0, 3_000));
}

export function aircraftColor(aircraft: Pick<AircraftView, "altitude" | "groundSpeed" | "verticalRate">, mode: AircraftColorMode): string | null {
  switch (mode) {
    case "altitude": return altitudeColor(aircraft.altitude);
    case "speed": return speedColor(aircraft.groundSpeed);
    case "verticalRate": return verticalRateColor(aircraft.verticalRate);
    default: return null;
  }
}
