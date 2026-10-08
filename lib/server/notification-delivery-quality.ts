/** Advisory-only notification evidence. Never triggers or suppresses a delivery. */
export type NotificationQualityReason =
  | "WORKER_STOPPED" | "PROCESSING_STALLED" | "TERMINAL_FAILURES"
  | "RETRY_BACKLOG" | "RECENT_TRANSPORT_FAILURE";

export interface NotificationDeliveryQuality {
  version: "notification-delivery-quality-v2";
  status: "HEALTHY" | "ATTENTION" | "DISABLED" | "NO_EVIDENCE";
  reasons: NotificationQualityReason[];
  /** Null until at least one terminal outcome. Historical, not a rolling SLA. */
  terminalSuccessRate: number | null;
  outstandingDeliveries: number;
  retryPending: number;
  terminalOutcomes: number;
}

export function buildNotificationDeliveryQuality(input: {
  configured: boolean;
  workerRunning: boolean;
  queueDepth: number;
  processing: number;
  retryPending: number;
  sent: number;
  terminalFailures: number;
  recentTransportFailure: boolean;
}): NotificationDeliveryQuality {
  const count = (value: number): number => Number.isFinite(value) ? Math.min(1_000_000_000, Math.max(0, Math.trunc(value))) : 0;
  const queue = count(input.queueDepth);
  const processing = count(input.processing);
  const retryPending = count(input.retryPending);
  const sent = count(input.sent);
  const failures = count(input.terminalFailures);
  const outcomes = sent + failures;
  const reasons: NotificationQualityReason[] = [];
  if (input.configured) {
    if (!input.workerRunning && queue + processing > 0) reasons.push("WORKER_STOPPED");
    if (!input.workerRunning && processing > 0) reasons.push("PROCESSING_STALLED");
    if (failures > 0) reasons.push("TERMINAL_FAILURES");
    if (retryPending > 0) reasons.push("RETRY_BACKLOG");
    if (input.recentTransportFailure) reasons.push("RECENT_TRANSPORT_FAILURE");
  }
  return {
    version: "notification-delivery-quality-v2",
    status: !input.configured ? "DISABLED" : reasons.length ? "ATTENTION" : outcomes === 0 ? "NO_EVIDENCE" : "HEALTHY",
    reasons,
    terminalSuccessRate: outcomes === 0 ? null : Math.round(sent / outcomes * 10_000) / 100,
    outstandingDeliveries: Math.min(1_000_000_000, queue + processing),
    retryPending,
    terminalOutcomes: outcomes,
  };
}
