import { describe, expect, it, vi } from "vitest";
import { RADAR_REACT_SNAPSHOT_INTERVAL_MS, createLatestSnapshotScheduler } from "@/lib/radar/live-snapshot-scheduler";

describe("live radar React snapshot scheduler", () => {
  it("commits only the newest delta inside one UI interval", () => {
    vi.useFakeTimers();
    const commits: number[] = [];
    const scheduler = createLatestSnapshotScheduler<number>({ commit: (value) => commits.push(value) });

    scheduler.push(1);
    scheduler.push(2);
    scheduler.push(3);
    expect(commits).toEqual([]);

    vi.advanceTimersByTime(RADAR_REACT_SNAPSHOT_INTERVAL_MS);
    expect(commits).toEqual([3]);
    scheduler.dispose();
    vi.useRealTimers();
  });

  it("commits full snapshots immediately and cancels an older pending delta", () => {
    vi.useFakeTimers();
    const commits: number[] = [];
    const scheduler = createLatestSnapshotScheduler<number>({ commit: (value) => commits.push(value) });

    scheduler.push(1);
    scheduler.push(2, true);
    expect(commits).toEqual([2]);

    vi.advanceTimersByTime(RADAR_REACT_SNAPSHOT_INTERVAL_MS);
    expect(commits).toEqual([2]);
    scheduler.dispose();
    vi.useRealTimers();
  });

  it("does not commit after disposal", () => {
    vi.useFakeTimers();
    const commits: number[] = [];
    const scheduler = createLatestSnapshotScheduler<number>({ commit: (value) => commits.push(value) });
    scheduler.push(1);
    scheduler.dispose();

    vi.advanceTimersByTime(RADAR_REACT_SNAPSHOT_INTERVAL_MS);
    expect(commits).toEqual([]);
    vi.useRealTimers();
  });
});
