/** Minimal, time-bounded altitude summary for the compact radar quick detail.
 * The full aircraft page keeps its historical altitude chart unchanged. */
export interface RadarAltitudeSample {
  recordedAt: string;
  altitude: number | null;
}

export interface StableAltitudeProfile {
  altitudeFt: number;
  samples: number;
}

/** Show a compact level-flight state only with enough time-separated evidence. */
export function stableAltitudeProfile(
  points: readonly RadarAltitudeSample[],
  livePoint?: RadarAltitudeSample | null,
): StableAltitudeProfile | null {
  const samplesByTime = new Map<number, number>();
  for (const point of livePoint ? [...points, livePoint] : points) {
    if (point.altitude === null || !Number.isFinite(point.altitude)) continue;
    const timestamp = Date.parse(point.recordedAt);
    if (!Number.isFinite(timestamp)) continue;
    samplesByTime.set(timestamp, point.altitude);
  }

  const sorted = [...samplesByTime].sort(([a], [b]) => a - b);
  const latestTime = sorted.at(-1)?.[0];
  if (latestTime === undefined) return null;
  const recent = sorted.filter(([timestamp]) => timestamp >= latestTime - 30 * 60_000);
  if (recent.length < 3 || recent.at(-1)![0] - recent[0][0] < 120_000) return null;

  let minAltitude = Infinity;
  let maxAltitude = -Infinity;
  for (const [, altitude] of recent) {
    minAltitude = Math.min(minAltitude, altitude);
    maxAltitude = Math.max(maxAltitude, altitude);
  }

  // Small barometric fluctuations should not consume a full chart-sized panel.
  // Keep the chart for actual climbs/descents or materially changing altitude.
  if (maxAltitude - minAltitude > 150) return null;
  return { altitudeFt: recent.at(-1)![1], samples: recent.length };
}
