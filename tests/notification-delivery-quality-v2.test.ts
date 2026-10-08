import { describe, expect, it } from "vitest";
import { buildNotificationDeliveryQuality } from "@/lib/server/notification-delivery-quality";

const baseline = { configured: true, workerRunning: true, queueDepth: 0, processing: 0, retryPending: 0, sent: 0, terminalFailures: 0, recentTransportFailure: false };

describe("Notification Reliability C3", () => {
  it("never treats missing delivery outcomes as proven success", () => {
    const result = buildNotificationDeliveryQuality(baseline);
    expect(result).toMatchObject({ status: "NO_EVIDENCE", terminalSuccessRate: null, terminalOutcomes: 0 });
  });

  it("reports evidence-based terminal success rate separately from backlog", () => {
    const result = buildNotificationDeliveryQuality({ ...baseline, sent: 9, terminalFailures: 1, queueDepth: 3, retryPending: 2 });
    expect(result).toMatchObject({ status: "ATTENTION", terminalSuccessRate: 90, terminalOutcomes: 10, outstandingDeliveries: 3, retryPending: 2 });
    expect(result.reasons).toEqual(["TERMINAL_FAILURES", "RETRY_BACKLOG"]);
  });

  it("distinguishes disabled transports and stopped delivery worker", () => {
    expect(buildNotificationDeliveryQuality({ ...baseline, configured: false, terminalFailures: 99 }).status).toBe("DISABLED");
    const result = buildNotificationDeliveryQuality({ ...baseline, workerRunning: false, queueDepth: 2, processing: 1 });
    expect(result.reasons).toEqual(["WORKER_STOPPED", "PROCESSING_STALLED"]);
  });

  it("avoids invalid and unbounded counters", () => {
    const result = buildNotificationDeliveryQuality({ ...baseline, queueDepth: Infinity, processing: -3, sent: Number.NaN });
    expect(result).toMatchObject({ outstandingDeliveries: 0, terminalOutcomes: 0, terminalSuccessRate: null });
  });
});
