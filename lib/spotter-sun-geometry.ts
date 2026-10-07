import { normalizeBearing } from "@/lib/spotter-location";

export type SpotterLightPeriod = "DAY" | "GOLDEN_HOUR" | "TWILIGHT" | "NIGHT";
export type SpotterLighting = "FRONT" | "SIDE" | "BACK" | "UNAVAILABLE";

export interface SpotterSunGeometry {
  azimuthDeg: number;
  elevationDeg: number;
  period: SpotterLightPeriod;
}

export interface SpotterLightGeometry extends SpotterSunGeometry {
  aircraftBearingDeg: number;
  azimuthDifferenceDeg: number;
  lighting: SpotterLighting;
}

function toRadians(value: number): number {
  return value * Math.PI / 180;
}

function toDegrees(value: number): number {
  return value * 180 / Math.PI;
}

function signedAngleDeg(value: number): number {
  return ((value + 540) % 360) - 180;
}

export function solarPosition(
  at: Date,
  observer: { lat: number; lon: number },
): SpotterSunGeometry {
  const julianDay = at.getTime() / 86_400_000 + 2_440_587.5;
  const days = julianDay - 2_451_545;
  const meanLongitude = normalizeBearing(280.46 + 0.9856474 * days);
  const meanAnomaly = toRadians(normalizeBearing(357.528 + 0.9856003 * days));
  const eclipticLongitude = toRadians(normalizeBearing(
    meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly),
  ));
  const obliquity = toRadians(23.439 - 0.0000004 * days);

  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));

  const centuries = days / 36_525;
  const gmst = normalizeBearing(
    280.46061837
      + 360.98564736629 * days
      + 0.000387933 * centuries * centuries
      - centuries * centuries * centuries / 38_710_000,
  );
  const localSidereal = normalizeBearing(gmst + observer.lon);
  const hourAngle = toRadians(signedAngleDeg(localSidereal - toDegrees(rightAscension)));
  const latitude = toRadians(observer.lat);

  const elevation = Math.asin(
    Math.sin(latitude) * Math.sin(declination)
      + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
  );
  const azimuth = Math.atan2(
    -Math.sin(hourAngle),
    Math.tan(declination) * Math.cos(latitude) - Math.sin(latitude) * Math.cos(hourAngle),
  );

  const elevationDeg = toDegrees(elevation);
  const period: SpotterLightPeriod = elevationDeg <= -6
    ? "NIGHT"
    : elevationDeg <= 0
      ? "TWILIGHT"
      : elevationDeg <= 10
        ? "GOLDEN_HOUR"
        : "DAY";

  return {
    azimuthDeg: normalizeBearing(toDegrees(azimuth)),
    elevationDeg,
    period,
  };
}

export function lightGeometry(
  sun: SpotterSunGeometry,
  aircraftBearingDeg: number,
): SpotterLightGeometry {
  const difference = Math.abs(signedAngleDeg(sun.azimuthDeg - aircraftBearingDeg));
  const lighting: SpotterLighting = sun.elevationDeg <= 0
    ? "UNAVAILABLE"
    : difference <= 35
      ? "BACK"
      : difference >= 145
        ? "FRONT"
        : "SIDE";

  return {
    ...sun,
    aircraftBearingDeg: normalizeBearing(aircraftBearingDeg),
    azimuthDifferenceDeg: difference,
    lighting,
  };
}
