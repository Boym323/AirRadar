import { describe, expect, it, vi } from "vitest";
import { createMapDatasetReplay } from "@/lib/map-layer-reliability";

describe("MapLibre dataset lifecycle replay", () => {
  it("replays data regardless of whether the dataset or map becomes ready first", () => {
    const source = { setData: vi.fn() };
    let currentSource: typeof source | null = null;
    const replay = createMapDatasetReplay(() => currentSource);
    replay.setData({ features: ["airport"] });
    expect(source.setData).not.toHaveBeenCalled();
    currentSource = source;
    replay.setReady(true);
    expect(source.setData).toHaveBeenCalledWith({ features: ["airport"] });

    source.setData.mockClear();
    replay.setReady(false);
    replay.setData({ features: ["new-airport"] });
    expect(source.setData).not.toHaveBeenCalled();
    replay.setReady(true);
    expect(source.setData).toHaveBeenCalledWith({ features: ["new-airport"] });
  });

  it("keeps the payload across a source recreation", () => {
    const first = { setData: vi.fn() };
    const second = { setData: vi.fn() };
    let currentSource: typeof first | null = first;
    const replay = createMapDatasetReplay(() => currentSource);
    replay.setData({ features: ["sector"] });
    replay.setReady(true);
    currentSource = null;
    replay.setReady(false);
    currentSource = second;
    replay.setReady(true);
    expect(second.setData).toHaveBeenCalledWith({ features: ["sector"] });
  });
});
