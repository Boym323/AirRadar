import type { FeatureCollection } from "geojson";
import type { Procedure, ProcedureType } from "@/lib/route-intelligence/contracts";

export function createProcedureGeoJSON(procedures: readonly Procedure[], type: ProcedureType): FeatureCollection {
  return { type: "FeatureCollection", features: procedures.flatMap((procedure) => procedure.legs.flatMap((leg) => {
    const points = leg.geometry?.coordinates ?? [leg.from?.coordinates, leg.to?.coordinates].filter((point): point is NonNullable<typeof point> => point != null);
    if (points.length < 2) return [];
    return [{ type: "Feature" as const, properties: { id: procedure.id, airport: procedure.airportIcao, designator: procedure.designator, transition: procedure.transition ?? "", type, sequence: leg.sequence, source: procedure.source.reference }, geometry: { type: "LineString" as const, coordinates: points.map((point) => [point.lon, point.lat]) } }];
  })) };
}
