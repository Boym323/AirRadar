import type { FeatureCollection } from "geojson";
import type { AtcSector } from "@/lib/atc/types";
import { formatAtcFrequency, formatAtcLimit, formatAtcService, t } from "@/lib/i18n";

/** Canonical 2D ATC and Navigation Integrity MapLibre source builders. */
export function createNavigationIntegrityGeoJSON(cells: Array<{ latCell: number; lonCell: number; state: string; affectedAircraftCount: number }>): FeatureCollection {
  const size = 0.2;
  return {
    type: "FeatureCollection",
    features: cells.filter((cell) => cell.state !== "NORMAL").map((cell) => {
      const lat = cell.latCell * size;
      const lon = cell.lonCell * size;
      return { type: "Feature", properties: { state: cell.state, affectedAircraftCount: cell.affectedAircraftCount }, geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]] } };
    }),
  };
}

export function createAtcGeoJSON(sectors: AtcSector[], visible: boolean) {
  // Hidden ATC has no features; skip projection.
  if (!visible) return { type: "FeatureCollection" as const, features: [] };
  return {
    type: "FeatureCollection" as const,
    features: sectors.flatMap((sector) => {
      const polygons = sector.polygons.filter((polygon) => polygon.length >= 3 && polygon.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90));
      if (!polygons.length) return [];
      // All polygons of one sector share these values. Avoid repeating lookups,
      // formatting and planned-activity matching for every polygon.
      const frequencies = sector.frequencies;
      const service = formatAtcService(sector.service ?? sector.atcCallsign);
      const lowerAltitude = formatAtcLimit(sector.lowerAltitudeFt, sector.lowerAltitudeReference, t.common.unlimited);
      const upperAltitude = formatAtcLimit(sector.upperAltitudeFt, sector.upperAltitudeReference, t.common.unlimited);
      const primaryFrequency = formatAtcFrequency((frequencies.find((frequency) => frequency.isPrimary) ?? frequencies[0])?.frequencyMhz);
      const alternateFrequencies = frequencies.filter((frequency) => !frequency.isPrimary).map((frequency) => formatAtcFrequency(frequency.frequencyMhz)).join(", ");
      return polygons.map((polygon) => ({
        type: "Feature" as const,
        properties: {
          id: sector.id,
          countryCode: sector.country,
          name: sector.name,
          label: sector.name,
          service,
          airspaceType: sector.airspaceType ?? null,
          airspaceClass: sector.airspaceClass ?? null,
          lowerAltitudeFt: sector.lowerAltitudeFt,
          upperAltitudeFt: sector.upperAltitudeFt,
          lowerAltitude,
          upperAltitude,
          primaryFrequency,
          alternateFrequencies,
          source: sector.source,
          sourceReference: sector.sourceReference,
          validFrom: sector.validFrom,
          validTo: sector.validTo,
          lastVerifiedAt: sector.lastVerifiedAt,
          activationStatus: sector.activationStatus ?? "UNKNOWN",
        },
        geometry: { type: "Polygon" as const, coordinates: [polygon] },
      }));
    }),
  };
}

