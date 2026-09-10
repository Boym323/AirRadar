import type { OgnTarget, OgnTargetView } from "@/lib/ogn/types";

/** Server-side privacy boundary for OGN data sent to the browser. */
export function toPublicOgnTarget(target: OgnTarget): OgnTargetView {
  const identified = target.identityVisible;
  return {
    id: identified ? target.id : target.publicId,
    publicId: target.publicId,
    address: identified ? target.address : null,
    addressType: target.addressType,
    senderCallsign: identified ? target.senderCallsign : null,
    trackingSource: target.trackingSource,
    latitude: target.latitude,
    longitude: target.longitude,
    altitudeFt: target.altitudeFt,
    groundSpeedKt: target.groundSpeedKt,
    trackDeg: target.trackDeg,
    verticalRateFpm: target.verticalRateFpm,
    turnRateDegPerSec: target.turnRateDegPerSec,
    flightLevel: target.flightLevel,
    observedAt: target.observedAt,
    receivedAt: target.receivedAt,
    aircraftType: target.aircraftType,
    registration: identified ? target.registration : null,
    competitionNumber: identified ? target.competitionNumber : null,
    model: identified ? target.model : null,
    identityVisible: identified,
    stealth: target.stealth,
    noTracking: false,
    lastReceiver: target.lastReceiver,
    distanceKm: target.distanceKm,
    bearing: target.bearing,
    stale: target.stale,
  };
}
