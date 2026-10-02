export const MAX_DESTINATION_REVISIONS = 8;

export interface DestinationObservation {
  destination: string;
  observedAt: string;
  source: string | null;
  providerRetrievedAt: string | null;
}

export interface DestinationProvenance {
  version: "destination-provenance-v1";
  history: DestinationObservation[];
  overflowCount?: number;
}

export interface DestinationObservationResult {
  provenance: DestinationProvenance;
  changed: boolean;
  currentChanged: boolean;
  repeated: boolean;
  overflowed: boolean;
  outOfOrder: boolean;
  conflict: boolean;
  invalid: boolean;
}

function validObservation(value: DestinationObservation): boolean {
  return Boolean(value.destination.trim()) && Number.isFinite(Date.parse(value.observedAt));
}

export function appendDestinationObservation(existing: DestinationProvenance | null | undefined, next: DestinationObservation): DestinationObservationResult {
  const history = (existing?.history ?? []).filter(validObservation).slice().sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const beforeCurrent = history.at(-1)?.destination ?? null;
  const latestAt = history.length ? Date.parse(history.at(-1)!.observedAt) : Number.NEGATIVE_INFINITY;
  if (!validObservation(next)) return { provenance: { version: "destination-provenance-v1", history }, changed: false, currentChanged: false, repeated: false, overflowed: false, outOfOrder: false, conflict: false, invalid: true };
  const nextAt = Date.parse(next.observedAt);
  const sameTime = history.find((item) => Date.parse(item.observedAt) === nextAt);
  if (sameTime) {
    if (sameTime.destination === next.destination) return { provenance: { version: "destination-provenance-v1", history }, changed: false, currentChanged: false, repeated: true, overflowed: false, outOfOrder: nextAt < latestAt, conflict: false, invalid: false };
    return { provenance: { version: "destination-provenance-v1", history }, changed: false, currentChanged: false, repeated: false, overflowed: false, outOfOrder: nextAt < latestAt, conflict: true, invalid: false };
  }
  const insertionIndex = history.findIndex((item) => Date.parse(item.observedAt) > nextAt);
  const outOfOrder = insertionIndex >= 0;
  history.splice(insertionIndex < 0 ? history.length : insertionIndex, 0, { ...next, destination: next.destination.trim().toUpperCase() });
  const collapsed = history.filter((item, index) => index === 0 || item.destination !== history[index - 1]!.destination);
  history.splice(0, history.length, ...collapsed);
  const existingHistory = (existing?.history ?? []).filter(validObservation).slice().sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  if (JSON.stringify(history) === JSON.stringify(existingHistory)) {
    return { provenance: { version: "destination-provenance-v1", history }, changed: false, currentChanged: false, repeated: true, overflowed: false, outOfOrder, conflict: false, invalid: false };
  }
  const currentChanged = beforeCurrent !== history.at(-1)?.destination;
  let overflowed = false;
  if (history.length > MAX_DESTINATION_REVISIONS) {
    history.splice(1, 1);
    overflowed = true;
  }
  history.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  return { provenance: { version: "destination-provenance-v1", history, ...(overflowed ? { overflowCount: (existing?.overflowCount ?? 0) + 1 } : existing?.overflowCount ? { overflowCount: existing.overflowCount } : {}) }, changed: true, currentChanged, repeated: false, overflowed, outOfOrder, conflict: false, invalid: false };
}

export function getDestinationAsOf(provenance: DestinationProvenance | null | undefined, timestamp: string | number): DestinationObservation | null {
  const at = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  return (provenance?.history ?? []).filter((item) => Date.parse(item.observedAt) <= at).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0] ?? null;
}
