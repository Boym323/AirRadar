const EARTH_RADIUS_KM = 6371;

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
