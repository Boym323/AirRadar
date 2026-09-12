export interface MapDatasetSource<T> {
  setData(data: T): void;
}

/** Keeps the latest dataset until a MapLibre source exists, then replays it. */
export function createMapDatasetReplay<T>(getSource: () => MapDatasetSource<T> | null | undefined) {
  let ready = false;
  let latest: T | null = null;
  const replay = () => {
    if (!ready || latest === null) return false;
    const source = getSource();
    if (!source) return false;
    source.setData(latest);
    return true;
  };
  return {
    setData(data: T) {
      latest = data;
      return replay();
    },
    setReady(value: boolean) {
      ready = value;
      return replay();
    },
  };
}
