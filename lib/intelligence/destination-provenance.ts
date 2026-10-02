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

export function appendDestinationObservation(existing: DestinationProvenance | null | undefined, next: DestinationObservation): { provenance: DestinationProvenance; changed: boolean; repeated: boolean; overflowed: boolean } {
  const history = existing?.history?.slice() ?? [];
  const previous = history.at(-1);
  if (previous?.destination === next.destination) return { provenance: { version: "destination-provenance-v1", history, ...(existing?.overflowCount ? { overflowCount: existing.overflowCount } : {}) }, changed: false, repeated: true, overflowed: false };
  let overflowed = false;
  if (history.length >= MAX_DESTINATION_REVISIONS) {
    history.splice(1, 1);
    overflowed = true;
  }
  history.push(next);
  return { provenance: { version: "destination-provenance-v1", history, ...(overflowed ? { overflowCount: (existing?.overflowCount ?? 0) + 1 } : existing?.overflowCount ? { overflowCount: existing.overflowCount } : {}) }, changed: true, repeated: false, overflowed };
}

export function getDestinationAsOf(provenance: DestinationProvenance | null | undefined, timestamp: string | number): DestinationObservation | null {
  const at = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  return (provenance?.history ?? []).filter((item) => Date.parse(item.observedAt) <= at).at(-1) ?? null;
}
