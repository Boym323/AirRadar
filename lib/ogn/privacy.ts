import type { OgnDdbEntry, OgnPosition, OgnTarget } from "@/lib/ogn/types";

export type OgnPrivacyDecision =
  | { action: "drop"; reason: "no-tracking" | "ddb-unavailable" | "ddb-tracked-disabled" }
  | { action: "anonymous"; entry: OgnDdbEntry | null; reason: "ddb-miss" | "not-identified" | "stealth" }
  | { action: "identified"; entry: OgnDdbEntry };

/**
 * Apply the complete public OGN privacy decision in one pure function.
 * Packet-level no-tracking always wins over DDB data. A DDB miss is treated
 * as anonymous, while an unavailable/stale DDB is fail-closed because its
 * tracking choice cannot be checked.
 */
export function applyOgnPrivacy(input: {
  position: OgnPosition;
  ddbAvailable: boolean;
  ddbEntry: OgnDdbEntry | null;
}): OgnPrivacyDecision {
  const { position, ddbAvailable, ddbEntry } = input;
  if (position.id.noTracking) return { action: "drop", reason: "no-tracking" };
  if (!ddbAvailable) return { action: "drop", reason: "ddb-unavailable" };
  if (ddbEntry?.tracked === "N") return { action: "drop", reason: "ddb-tracked-disabled" };
  if (!ddbEntry) return { action: "anonymous", entry: null, reason: "ddb-miss" };
  if (position.id.stealth) return { action: "anonymous", entry: ddbEntry, reason: "stealth" };
  if (ddbEntry.identified !== "Y") return { action: "anonymous", entry: ddbEntry, reason: "not-identified" };
  return { action: "identified", entry: ddbEntry };
}

export function targetWithPrivacy(
  position: OgnPosition,
  decision: OgnPrivacyDecision,
  existing: OgnTarget | undefined,
  targetId: string,
  publicId: string,
  distanceKm: number | null,
  bearing: number | null,
  stale: boolean,
): OgnTarget | null {
  if (decision.action === "drop") return null;
  const entry = decision.entry;
  const identityVisible = decision.action === "identified";
  const recentReceivers = existing?.recentReceivers ? existing.recentReceivers.slice() : [];
  if (position.lastReceiver && !recentReceivers.includes(position.lastReceiver)) recentReceivers.push(position.lastReceiver);
  return {
    id: targetId,
    publicId,
    address: position.id.address,
    addressType: position.id.addressType,
    senderCallsign: position.senderCallsign,
    trackingSource: position.trackingSource,
    latitude: position.latitude,
    longitude: position.longitude,
    altitudeFt: position.altitudeFt,
    groundSpeedKt: position.groundSpeedKt,
    trackDeg: position.trackDeg,
    verticalRateFpm: position.verticalRateFpm,
    turnRateDegPerSec: position.turnRateDegPerSec,
    flightLevel: position.flightLevel,
    observedAt: position.observedAt,
    receivedAt: position.receivedAt,
    aircraftType: position.id.aircraftType,
    registration: identityVisible ? entry?.registration ?? null : null,
    competitionNumber: identityVisible ? entry?.competitionNumber ?? null : null,
    model: identityVisible ? entry?.aircraftModel ?? null : null,
    identityVisible,
    stealth: position.id.stealth,
    noTracking: position.id.noTracking,
    lastReceiver: position.lastReceiver ?? existing?.lastReceiver ?? null,
    recentReceivers: recentReceivers.slice(-8),
    receiverCount: Math.max(existing?.receiverCount ?? 0, new Set(recentReceivers).size),
    receiverSignalDb: position.receiverSignalDb,
    distanceKm,
    bearing,
    stale,
  };
}

