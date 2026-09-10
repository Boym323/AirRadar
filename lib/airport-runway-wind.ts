export interface RunwayWindComponent {
  headingDeg: number;
  windDirectionDeg: number;
  windSpeedKt: number;
  headwindKt: number;
  crosswindKt: number;
  tailwindKt: number;
}

/** Signed shortest angular difference from runway heading to wind direction. */
export function shortestAngularDifference(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

/**
 * Calculates the wind component for one runway direction. A positive headwind
 * means wind down the runway towards the aircraft; a negative component is a
 * tailwind. Crosswind is always returned as a positive magnitude.
 */
export function calculateRunwayWind(
  runwayHeadingDeg: number | null | undefined,
  windDirectionDeg: number | null | undefined,
  windSpeedKt: number | null | undefined,
): RunwayWindComponent | null {
  if (![runwayHeadingDeg, windDirectionDeg, windSpeedKt].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  if ((windSpeedKt as number) <= 0) return null;
  const heading = ((runwayHeadingDeg as number) % 360 + 360) % 360;
  const direction = ((windDirectionDeg as number) % 360 + 360) % 360;
  const angle = shortestAngularDifference(heading, direction) * Math.PI / 180;
  const headwind = (windSpeedKt as number) * Math.cos(angle);
  return {
    headingDeg: heading,
    windDirectionDeg: direction,
    windSpeedKt: windSpeedKt as number,
    headwindKt: Math.round(headwind * 10) / 10,
    crosswindKt: Math.round(Math.abs((windSpeedKt as number) * Math.sin(angle)) * 10) / 10,
    tailwindKt: Math.round(Math.max(0, -headwind) * 10) / 10,
  };
}

export interface WindFavoredRunway<T> {
  runway: T;
  headingDeg: number;
  crosswindKt: number;
  headwindKt: number;
}

/** Selects the direction with the strongest headwind, then lowest crosswind. */
export function selectWindFavoredRunway<T>(
  runways: readonly T[],
  getDirections: (runway: T) => Array<{ headingDeg: number | null | undefined }>,
  windDirectionDeg: number | null | undefined,
  windSpeedKt: number | null | undefined,
): WindFavoredRunway<T> | null {
  if (typeof windDirectionDeg !== "number" || typeof windSpeedKt !== "number" || windSpeedKt <= 0) return null;
  const candidates = runways.flatMap((runway) => getDirections(runway).flatMap((direction) => {
    const component = calculateRunwayWind(direction.headingDeg, windDirectionDeg, windSpeedKt);
    return component ? [{ runway, headingDeg: component.headingDeg, crosswindKt: component.crosswindKt, headwindKt: component.headwindKt }] : [];
  }));
  return candidates.sort((a, b) => b.headwindKt - a.headwindKt || a.crosswindKt - b.crosswindKt || a.headingDeg - b.headingDeg)[0] ?? null;
}
