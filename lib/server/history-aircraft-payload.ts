import type { Aircraft, AircraftEnrichment } from "@/lib/aircraft/types";

/**
 * Preserve current enrichment metadata on a sparse persistence snapshot.
 * No mutation: history may still use the original receiver observation.
 */
export function historyAircraftForSnapshot(snapshotItem: Aircraft, current: Aircraft | undefined): Aircraft {
  if (!current) return snapshotItem;

  const sameCallsign = current.callsign === snapshotItem.callsign;
  const metadata = snapshotItem.enrichment?.metadata ?? current.enrichment?.metadata;
  const route = snapshotItem.enrichment?.route ?? (sameCallsign ? current.enrichment?.route : undefined);
  const flightPlan = snapshotItem.enrichment?.flightPlan ?? (sameCallsign ? current.enrichment?.flightPlan : undefined);
  const registration = snapshotItem.registration ?? current.registration;
  const aircraftType = snapshotItem.aircraftType ?? current.aircraftType;
  const aircraftDescription = snapshotItem.aircraftDescription ?? current.aircraftDescription;

  // Most sampled observations are already hydrated or have no metadata.
  // Avoid allocating a wide Aircraft copy and an enrichment object if
  // the merged durable values are exactly the input values.
  if (registration === snapshotItem.registration
    && aircraftType === snapshotItem.aircraftType
    && aircraftDescription === snapshotItem.aircraftDescription
    && metadata === snapshotItem.enrichment?.metadata
    && route === snapshotItem.enrichment?.route
    && flightPlan === snapshotItem.enrichment?.flightPlan) {
    return snapshotItem;
  }

  const enrichment: AircraftEnrichment = {};
  if (metadata) enrichment.metadata = metadata;
  if (route) enrichment.route = route;
  if (flightPlan) enrichment.flightPlan = flightPlan;
  return {
    ...snapshotItem,
    registration,
    aircraftType,
    aircraftDescription,
    ...(Object.keys(enrichment).length ? { enrichment } : {}),
  };
}
