import type { ReceiverQuality } from "@/lib/server/receiver-quality";

export type ReceiverMonitoringState = "HEALTHY" | "DEGRADED" | "OFFLINE" | "INSUFFICIENT_DATA";
export type ReceiverMonitoringCause =
  | "SOURCE_UNAVAILABLE"
  | "SNAPSHOT_STALE"
  | "LOW_MESSAGE_RATE"
  | "POSITION_STALE"
  | "NO_AIRCRAFT"
  | "DEMO_SOURCE";

export interface ReceiverMonitoringCauseDetail {
  code: ReceiverMonitoringCause;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface ReceiverMonitoring {
  version: "receiver-monitoring-v1";
  state: ReceiverMonitoringState;
  causes: ReceiverMonitoringCauseDetail[];
  recommendedAction: "CHECK_READSB" | "CHECK_NETWORK_OR_FEED" | "CHECK_ANTENNA_OR_RF" | "OBSERVE" | "NONE";
  evaluatedAt: string;
}

export function buildReceiverMonitoring(input: {
  quality: ReceiverQuality;
  online: boolean;
  sourceStatus: "live" | "demo" | "offline";
  now?: Date;
}): ReceiverMonitoring {
  const now = input.now ?? new Date();
  const causes: ReceiverMonitoringCauseDetail[] = [];
  const quality = input.quality;

  if (input.sourceStatus === "demo") {
    causes.push({ code: "DEMO_SOURCE", confidence: "HIGH" });
  } else if (!input.online || input.sourceStatus === "offline") {
    causes.push({ code: "SOURCE_UNAVAILABLE", confidence: "HIGH" });
  } else if (quality.latestMessageAgeSeconds === null || quality.latestMessageAgeSeconds > 180) {
    causes.push({ code: "SNAPSHOT_STALE", confidence: "HIGH" });
  }

  if (input.sourceStatus !== "demo" && quality.aircraftCount === 0 && input.online) {
    causes.push({ code: "NO_AIRCRAFT", confidence: "MEDIUM" });
  }
  if (input.sourceStatus !== "demo" && quality.messagesPerSecond !== null && quality.messagesPerSecond < 1 && input.online) {
    causes.push({ code: "LOW_MESSAGE_RATE", confidence: "MEDIUM" });
  }
  if (input.sourceStatus !== "demo" && quality.latestPositionAgeSeconds !== null && quality.latestPositionAgeSeconds > 60 && input.online) {
    causes.push({ code: "POSITION_STALE", confidence: "MEDIUM" });
  }

  const state: ReceiverMonitoringState = input.sourceStatus === "demo"
    ? "INSUFFICIENT_DATA"
    : !input.online || quality.state === "OFFLINE"
      ? "OFFLINE"
      : causes.length > 0 || quality.state === "DEGRADED"
        ? "DEGRADED"
        : "HEALTHY";

  const recommendedAction = state === "OFFLINE"
    ? "CHECK_READSB"
    : causes.some((cause) => cause.code === "LOW_MESSAGE_RATE" || cause.code === "NO_AIRCRAFT")
      ? "CHECK_ANTENNA_OR_RF"
      : causes.some((cause) => cause.code === "SNAPSHOT_STALE")
        ? "CHECK_NETWORK_OR_FEED"
        : causes.some((cause) => cause.code === "POSITION_STALE")
          ? "OBSERVE"
          : "NONE";

  return {
    version: "receiver-monitoring-v1",
    state,
    causes,
    recommendedAction,
    evaluatedAt: now.toISOString(),
  };
}
