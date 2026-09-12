import type { AircraftView, PublicStateSnapshot } from "@/lib/aircraft/types";

export const SSE_V2_PROTOCOL = "airradar-sse-v2" as const;

export type SseV2SnapshotPayload = Omit<PublicStateSnapshot, "aircraft"> & {
  protocol: typeof SSE_V2_PROTOCOL;
  sequence: string;
  aircraft: AircraftView[];
};

export type SseV2DeltaPayload = Omit<PublicStateSnapshot, "aircraft"> & {
  protocol: typeof SSE_V2_PROTOCOL;
  sequence: string;
  changed: AircraftView[];
  removed: string[];
};

export type SseV2Payload = SseV2SnapshotPayload | SseV2DeltaPayload;

export type SseV2ApplyResult =
  | { status: "applied"; snapshot: PublicStateSnapshot; sequence: string }
  | { status: "duplicate"; snapshot: PublicStateSnapshot; sequence: string }
  | { status: "invalid" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSequence(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value);
}

function isAircraft(value: unknown): value is AircraftView {
  return isRecord(value) && typeof value.icaoHex === "string" && value.icaoHex.length > 0;
}

function isAircraftList(value: unknown): value is AircraftView[] {
  return Array.isArray(value) && value.every(isAircraft);
}

function isRemovedList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function compareSequences(left: string, right: string): number {
  const leftNormalized = left.replace(/^0+(?=\d)/, "");
  const rightNormalized = right.replace(/^0+(?=\d)/, "");
  if (leftNormalized.length !== rightNormalized.length) return leftNormalized.length - rightNormalized.length;
  return leftNormalized < rightNormalized ? -1 : leftNormalized > rightNormalized ? 1 : 0;
}

function incrementSequence(value: string): string {
  const digits = value.split("");
  let carry = 1;
  for (let index = digits.length - 1; index >= 0 && carry; index -= 1) {
    const next = digits[index].charCodeAt(0) - 48 + carry;
    digits[index] = String(next % 10);
    carry = next >= 10 ? 1 : 0;
  }
  return carry ? `1${digits.join("")}` : digits.join("");
}

function sortAircraft(aircraft: AircraftView[]): AircraftView[] {
  return aircraft.sort((left, right) => {
    const leftDistance = left.distanceKm ?? Number.POSITIVE_INFINITY;
    const rightDistance = right.distanceKm ?? Number.POSITIVE_INFINITY;
    return leftDistance - rightDistance || left.icaoHex.localeCompare(right.icaoHex);
  });
}

function isBasePayload(value: unknown): value is { protocol: typeof SSE_V2_PROTOCOL; sequence: string } & Record<string, unknown> {
  return isRecord(value) && value.protocol === SSE_V2_PROTOCOL && isSequence(value.sequence);
}

export function applySseV2Event(
  current: { snapshot: PublicStateSnapshot; sequence: string } | null,
  eventName: "snapshot" | "delta",
  value: unknown,
): SseV2ApplyResult {
  if (!isBasePayload(value)) return { status: "invalid" };

  if (eventName === "snapshot") {
    if (!isAircraftList(value.aircraft)) return { status: "invalid" };
    const sequence = value.sequence;
    const snapshot: Record<string, unknown> = { ...value };
    delete snapshot.protocol;
    delete snapshot.sequence;
    delete snapshot.aircraft;
    return {
      status: "applied",
      sequence,
      snapshot: { ...snapshot, aircraft: value.aircraft } as unknown as PublicStateSnapshot,
    };
  }

  if (!current || !isAircraftList(value.changed) || !isRemovedList(value.removed)) return { status: "invalid" };
  const sequence = value.sequence;
  const sequenceComparison = compareSequences(sequence, current.sequence);
  if (sequenceComparison <= 0) return { status: "duplicate", snapshot: current.snapshot, sequence: current.sequence };
  if (sequence !== incrementSequence(current.sequence)) return { status: "invalid" };

  const changedHexes = new Set(value.changed.map((aircraft) => aircraft.icaoHex));
  if (changedHexes.size !== value.changed.length || value.removed.some((hex) => changedHexes.has(hex))) {
    return { status: "invalid" };
  }

  const aircraft = new Map(current.snapshot.aircraft.map((item) => [item.icaoHex, item]));
  for (const hex of value.removed) aircraft.delete(hex);
  for (const item of value.changed) aircraft.set(item.icaoHex, item);
  const snapshot: Record<string, unknown> = { ...value };
  delete snapshot.protocol;
  delete snapshot.sequence;
  delete snapshot.changed;
  delete snapshot.removed;
  return {
    status: "applied",
    sequence,
    snapshot: { ...snapshot, aircraft: sortAircraft([...aircraft.values()]) } as unknown as PublicStateSnapshot,
  };
}

export function compareSseV2Sequences(left: string, right: string): number {
  if (!isSequence(left) || !isSequence(right)) return Number.NaN;
  return compareSequences(left, right);
}
