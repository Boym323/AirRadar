import type { TimeMachineEvent } from "@/lib/server/time-machine";

export interface TimeMachineEventCluster {
  timestamp: string;
  events: TimeMachineEvent[];
}

export function orderTimeMachineEvents(events: readonly TimeMachineEvent[]): TimeMachineEvent[] {
  return [...events].sort((left, right) =>
    Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    || left.id.localeCompare(right.id));
}

/** Keeps the timeline bounded while preserving every event in the detail list. */
export function clusterTimeMachineEvents(events: readonly TimeMachineEvent[], windowMs = 30_000, maxClusters = 80): TimeMachineEventCluster[] {
  const clusters: TimeMachineEventCluster[] = [];
  for (const event of orderTimeMachineEvents(events)) {
    const timestamp = Date.parse(event.occurredAt);
    if (!Number.isFinite(timestamp)) continue;
    const previous = clusters.at(-1);
    if (previous && timestamp - Date.parse(previous.timestamp) <= windowMs) previous.events.push(event);
    else clusters.push({ timestamp: event.occurredAt, events: [event] });
  }
  if (clusters.length <= maxClusters) return clusters;
  const stride = Math.ceil(clusters.length / maxClusters);
  return clusters.filter((_cluster, index) => index % stride === 0);
}
