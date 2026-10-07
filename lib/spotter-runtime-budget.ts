export interface SpotterRuntimeBudget {
  discoveryRefreshMs: number;
  prgRefreshMs: number;
  metarRefreshMs: number;
  historyRefreshMs: number;
  enableHighAccuracyGeolocation: boolean;
}

export const DEFAULT_SPOTTER_RUNTIME_BUDGET: SpotterRuntimeBudget = {
  discoveryRefreshMs: 30_000,
  prgRefreshMs: 30_000,
  metarRefreshMs: 10 * 60_000,
  historyRefreshMs: 5 * 60_000,
  enableHighAccuracyGeolocation: true,
};

export const CONSERVATIVE_SPOTTER_RUNTIME_BUDGET: SpotterRuntimeBudget = {
  discoveryRefreshMs: 60_000,
  prgRefreshMs: 60_000,
  metarRefreshMs: 20 * 60_000,
  historyRefreshMs: 10 * 60_000,
  enableHighAccuracyGeolocation: false,
};

export function spotterRuntimeBudget(input: {
  saveData?: boolean;
  effectiveType?: string | null;
} = {}): SpotterRuntimeBudget {
  const effectiveType = input.effectiveType?.trim().toLowerCase() ?? "";
  const constrained = input.saveData === true || effectiveType === "slow-2g" || effectiveType === "2g";
  return constrained
    ? CONSERVATIVE_SPOTTER_RUNTIME_BUDGET
    : DEFAULT_SPOTTER_RUNTIME_BUDGET;
}

export function browserConnectionHints(): { saveData: boolean; effectiveType: string | null } {
  if (typeof navigator === "undefined") return { saveData: false, effectiveType: null };
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  return {
    saveData: connection?.saveData === true,
    effectiveType: typeof connection?.effectiveType === "string" ? connection.effectiveType : null,
  };
}
