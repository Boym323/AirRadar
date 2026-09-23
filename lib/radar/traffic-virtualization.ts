export const AIRCRAFT_TRAFFIC_ROW_HEIGHT = 62;
export const AIRCRAFT_TRAFFIC_OVERSCAN_ROWS = 6;
export const AIRCRAFT_TRAFFIC_VIRTUALIZATION_THRESHOLD = 40;

export interface AircraftTrafficVirtualRangeInput {
  count: number;
  rootTop: number;
  rootBottom: number;
  spaceTop: number;
}

export interface AircraftTrafficVirtualRange {
  start: number;
  end: number;
}

export function aircraftTrafficVirtualRange({
  count,
  rootTop,
  rootBottom,
  spaceTop,
}: AircraftTrafficVirtualRangeInput): AircraftTrafficVirtualRange {
  if (count <= 0) return { start: 0, end: 0 };
  if (count < AIRCRAFT_TRAFFIC_VIRTUALIZATION_THRESHOLD) return { start: 0, end: count };

  const totalHeight = count * AIRCRAFT_TRAFFIC_ROW_HEIGHT;
  const visibleTop = Math.max(0, Math.min(totalHeight, rootTop - spaceTop));
  const visibleBottom = Math.max(0, Math.min(totalHeight, rootBottom - spaceTop));
  if (visibleBottom <= visibleTop) return { start: 0, end: 0 };

  return {
    start: Math.max(0, Math.floor(visibleTop / AIRCRAFT_TRAFFIC_ROW_HEIGHT) - AIRCRAFT_TRAFFIC_OVERSCAN_ROWS),
    end: Math.min(count, Math.ceil(visibleBottom / AIRCRAFT_TRAFFIC_ROW_HEIGHT) + AIRCRAFT_TRAFFIC_OVERSCAN_ROWS),
  };
}
