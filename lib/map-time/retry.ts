export const MAP_CONTEXT_RETRY_BASE_MS = 1_000;
export const MAP_CONTEXT_RETRY_MAX_MS = 30_000;

export function mapContextRetryDelayMs(attempt: number): number {
  const boundedAttempt = Math.min(10, Math.max(0, Math.floor(attempt)));
  return Math.min(MAP_CONTEXT_RETRY_MAX_MS, MAP_CONTEXT_RETRY_BASE_MS * (2 ** boundedAttempt));
}
