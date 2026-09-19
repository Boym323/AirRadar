import { normalizeInstant, type MapTimeState } from "./types";

export type MapTimeListener = (state: MapTimeState) => void;

export class MapTimeController {
  private state: MapTimeState;
  private readonly listeners = new Set<MapTimeListener>();

  constructor(initial: MapTimeState = { mode: "LIVE", currentTime: new Date().toISOString() }) {
    this.state = { mode: initial.mode, currentTime: normalizeInstant(initial.currentTime) };
  }

  getState(): MapTimeState { return this.state; }

  setTime(value: string | Date): void {
    this.publish({ mode: "HISTORICAL", currentTime: normalizeInstant(value) });
  }

  seek(value: string | Date): void { this.setTime(value); }

  setLive(now = new Date()): void {
    this.publish({ mode: "LIVE", currentTime: normalizeInstant(now) });
  }

  subscribe(listener: MapTimeListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private publish(next: MapTimeState): void {
    if (next.mode === this.state.mode && next.currentTime === this.state.currentTime) return;
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}

export function contextResolutionBucket(at: string | number, granularityMs: number): number {
  const timestamp = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(timestamp) || !Number.isFinite(granularityMs) || granularityMs <= 0) throw new Error("Invalid context time bucket");
  return Math.floor(timestamp / granularityMs);
}
