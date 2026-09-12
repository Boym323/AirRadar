const EARTH_RADIUS_KM = 6371;

function validCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

export function haversineDistanceKm(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number {
  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLon = ((toLon - fromLon) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function initialBearing(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number {
  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;
  const dLon = ((toLon - fromLon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI < 0
    ? ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
    : (Math.atan2(y, x) * 180) / Math.PI;
}

/**
 * Returns the shortest distance from a point to the great-circle segment
 * between two coordinates. This is intentionally a geometric plausibility
 * check, not an attempt to reconstruct the aircraft's filed route.
 */
export function distanceToGreatCircleSegmentKm(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  pointLat: number,
  pointLon: number,
): number {
  if (![fromLat, fromLon, toLat, toLon, pointLat, pointLon].every(Number.isFinite)
    || !validCoordinate(fromLat, fromLon)
    || !validCoordinate(toLat, toLon)
    || !validCoordinate(pointLat, pointLon)) return Number.POSITIVE_INFINITY;

  const segmentDistance = haversineDistanceKm(fromLat, fromLon, toLat, toLon);
  if (segmentDistance === 0) return haversineDistanceKm(fromLat, fromLon, pointLat, pointLon);

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const angularPointDistance = haversineDistanceKm(fromLat, fromLon, pointLat, pointLon) / EARTH_RADIUS_KM;
  const startBearing = toRadians(initialBearing(fromLat, fromLon, toLat, toLon));
  const pointBearing = toRadians(initialBearing(fromLat, fromLon, pointLat, pointLon));
  const bearingDelta = pointBearing - startBearing;
  const alongTrackDistance = Math.atan2(
    Math.sin(angularPointDistance) * Math.cos(bearingDelta),
    Math.cos(angularPointDistance),
  ) * EARTH_RADIUS_KM;

  if (alongTrackDistance <= 0) return haversineDistanceKm(fromLat, fromLon, pointLat, pointLon);
  if (alongTrackDistance >= segmentDistance) return haversineDistanceKm(toLat, toLon, pointLat, pointLon);

  const crossTrackAngular = Math.asin(Math.max(-1, Math.min(1,
    Math.sin(angularPointDistance) * Math.sin(bearingDelta),
  )));
  return Math.abs(crossTrackAngular * EARTH_RADIUS_KM);
}

export function destinationPoint(lat: number, lon: number, distanceKm: number, bearingDegrees: number): [number, number] {
  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );
  return [((lon2 * 180) / Math.PI + 540) % 360 - 180, (lat2 * 180) / Math.PI];
}

export function circleCoordinates(lat: number, lon: number, radiusKm: number, points = 72): [number, number][] {
  const coordinates = Array.from({ length: points + 1 }, (_, index) => {
    return destinationPoint(lat, lon, radiusKm, (index / points) * 360);
  });
  return coordinates;
}
