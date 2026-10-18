import type { FeatureCollection } from "geojson";
import type { AtcSector } from "@/lib/atc/types";
import type { AirspaceActivityResponse } from "@/lib/airspace-activity/types";
import { buildAirspacePlanMapIndex, matchAirspacePlanForSector } from "@/lib/airspace-activity/map";
import { airspaceActivityMapT as activityT } from "@/lib/i18n/airspace-activity";
import { formatAtcFrequency, formatAtcLimit, formatAtcService, t } from "@/lib/i18n";
import type { SectorTrafficView } from "@/components/radar/use-radar-atc-map-context";

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

export function createAtcGeoJSON(sectors: AtcSector[], visible: boolean, airspaceActivity: AirspaceActivityResponse | null = null, traffic = new Map<string, SectorTrafficView>()) {
  // Hidden ATC has no features; avoid work proportional to planned airspace windows.
  if (!visible) return { type: "FeatureCollection" as const, features: [] };
  const planIndex = buildAirspacePlanMapIndex(airspaceActivity);
  return {
    type: "FeatureCollection" as const,
    features: sectors.flatMap((sector) => {
      const polygons = sector.polygons.filter((polygon) => polygon.length >= 3 && polygon.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90));
      if (!polygons.length) return [];
      // All polygons of one sector share these values. Avoid repeating lookups,
      // formatting and planned-activity matching for every polygon.
      const plan = matchAirspacePlanForSector(sector, planIndex);
      const planLabel = plan?.state === "planned-now" ? activityT.plannedNow : plan?.state === "upcoming" ? activityT.upcoming : null;
      const sectorTraffic = traffic.get(sector.id);
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
          label: planLabel ? `${sector.name} · ${planLabel}` : sector.name,
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
          trafficLevel: sectorTraffic?.trafficLevel ?? "NO_DATA",
          trafficAircraftCount: sectorTraffic?.traffic.aircraftCount ?? null,
          trafficAt: sectorTraffic?.at ?? null,
          airspacePlanState: plan?.state ?? "none",
          airspacePlanStale: plan?.stale ?? false,
          airspacePlanSource: plan?.source ?? "",
          airspacePlanSequence: plan?.sequence ?? 0,
          airspacePlanSourceReference: plan?.sourceReference ?? "",
          airspacePlanStartsAt: plan?.startsAt ?? "",
          airspacePlanEndsAt: plan?.endsAt ?? "",
          airspacePlanLowerLimit: plan?.lowerLimit ?? "",
          airspacePlanUpperLimit: plan?.upperLimit ?? "",
          airspacePlanResponsibleUnit: plan?.responsibleUnit ?? "",
          airspacePlanActivity: plan?.activity ?? "",
          airspacePlanDesignator: plan?.canonicalDesignator ?? "",
        },
        geometry: { type: "Polygon" as const, coordinates: [polygon] },
      }));
    }),
  };
}

