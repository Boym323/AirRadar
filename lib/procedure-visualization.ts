import type { FeatureCollection } from "geojson";
import type { Procedure, ProcedureType, RouteCoordinate } from "@/lib/route-intelligence/contracts";

export function createProcedureGeoJSON(procedures: readonly Procedure[], type: ProcedureType): FeatureCollection {
  return { type: "FeatureCollection", features: procedures.flatMap((procedure) => {
    // A procedure is one ordered path.  Emitting one feature per leg made
    // shared endpoints look like disconnected zig-zags in MapLibre and also
    // duplicated the joins.  Keep discontinuities as real breaks, but merge
    // consecutive published geometry into the smallest possible line.
    const features: FeatureCollection["features"] = [];
    let path: RouteCoordinate[] = [];
    let firstSequence: number | null = null;
    const flush = () => {
      if (path.length < 2) { path = []; firstSequence = null; return; }
      features.push({
        type: "Feature",
        properties: { id: procedure.id, airport: procedure.airportIcao, designator: procedure.designator, transition: procedure.transition ?? "", type, sequence: firstSequence, source: procedure.source.reference },
        geometry: { type: "LineString", coordinates: path.map((point) => [point.lon, point.lat]) },
      });
      path = [];
      firstSequence = null;
    };
    for (const leg of [...procedure.legs].sort((left, right) => left.sequence - right.sequence)) {
      if (leg.type === "DISCONTINUITY") { flush(); continue; }
      const points = leg.geometry?.coordinates?.length
        ? leg.geometry.coordinates
        : [leg.from?.coordinates, leg.to?.coordinates].filter((point): point is NonNullable<typeof point> => point != null);
      if (points.length < 2) { flush(); continue; }
      if (firstSequence === null) firstSequence = leg.sequence;
      const start = path.at(-1);
      const coordinates = start && start.lat === points[0].lat && start.lon === points[0].lon ? points.slice(1) : points;
      path.push(...coordinates);
    }
    flush();
    return features;
  }) };
}
