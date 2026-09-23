export const RADAR_REACT_SNAPSHOT_INTERVAL_MS = 200;

export interface LatestSnapshotScheduler<T> {
  push(value: T, immediate?: boolean): void;
  dispose(): void;
}

interface LatestSnapshotSchedulerOptions<T> {
  commit: (value: T) => void;
  delayMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

/**
 * Coalesces high-frequency live snapshots for React consumers while imperative
 * map state can continue consuming every SSE delta independently.
 */
export function createLatestSnapshotScheduler<T>({
  commit,
  delayMs = RADAR_REACT_SNAPSHOT_INTERVAL_MS,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer),
}: LatestSnapshotSchedulerOptions<T>): LatestSnapshotScheduler<T> {
  let pending: T | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const flush = () => {
    timer = null;
    if (disposed || pending === null) return;
    const next = pending;
    pending = null;
    commit(next);
  };

  return {
    push(value, immediate = false) {
      if (disposed) return;
      pending = value;
      if (immediate) {
        if (timer !== null) clearTimer(timer);
        timer = null;
        flush();
        return;
      }
      if (timer === null) timer = setTimer(flush, delayMs);
    },
    dispose() {
      disposed = true;
      pending = null;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
