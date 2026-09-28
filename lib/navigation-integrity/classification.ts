import type { NavigationIntegrityClassification, NavigationIntegrityObservation } from "@/lib/navigation-integrity/types";

const thresholds: Record<"nic" | "nacP" | "nacV" | "sil" | "sda" | "gva", number> = { nic: 5, nacP: 6, nacV: 2, sil: 1, sda: 1, gva: 2 };

export function classifyNavigationIntegrity(observation: NavigationIntegrityObservation): NavigationIntegrityClassification {
  const indicators = (Object.keys(thresholds) as Array<keyof typeof thresholds>)
    .filter((field) => {
      const value = observation[field] as number | null;
      const threshold = thresholds[field];
      return value !== null && value <= threshold;
    })
    .map((field) => field as string);
  if (!indicators.length) return { state: "NORMAL", indicators: [], degradedFieldCount: 0, score: null };
  const severe = indicators.length >= 3 || (indicators.includes("nic") && (observation.nic ?? 99) <= 3 && (observation.sil ?? 99) <= 1);
  const state = severe ? "SEVERE" : indicators.length >= 2 ? "DEGRADED" : "REDUCED";
  return { state, indicators, degradedFieldCount: indicators.length, score: null };
}
