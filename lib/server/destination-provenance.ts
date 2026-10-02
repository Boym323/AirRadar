import { appendDestinationObservation, type DestinationProvenance } from "@/lib/intelligence/destination-provenance";

const diagnostics = { destinationFirstObserved: 0, destinationChanged: 0, destinationRepeatedUnchanged: 0, destinationHistoryOverflow: 0, destinationWithTimestamp: 0 };

export function parseDestinationProvenance(value: unknown): DestinationProvenance | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as DestinationProvenance).history)) return null;
    return parsed as DestinationProvenance;
  } catch { return null; }
}

export function observeDestination(existingValue: string | null | undefined, destination: string | null | undefined, observedAt: string, source: string | null, providerRetrievedAt: string | null): { value: string | null; changed: boolean } {
  const normalized = destination?.trim().toUpperCase() || null;
  if (!normalized) return { value: existingValue ?? null, changed: false };
  const result = appendDestinationObservation(parseDestinationProvenance(existingValue), { destination: normalized, observedAt, source, providerRetrievedAt });
  if (result.repeated) diagnostics.destinationRepeatedUnchanged += 1;
  else {
    diagnostics.destinationChanged += result.provenance.history.length > 1 ? 1 : 0;
    diagnostics.destinationFirstObserved += result.provenance.history.length === 1 ? 1 : 0;
    diagnostics.destinationWithTimestamp += 1;
    if (result.overflowed) diagnostics.destinationHistoryOverflow += 1;
  }
  return { value: JSON.stringify(result.provenance), changed: result.changed };
}

export function getDestinationProvenanceDiagnostics() { return { ...diagnostics }; }
