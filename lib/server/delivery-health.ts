import { buildNotificationDeliveryQuality, type NotificationDeliveryQuality } from "@/lib/server/notification-delivery-quality";
import { getAlertDeliveryWorker } from "@/lib/server/alert-delivery-worker";
import { getAlertsFleetsRepository } from "@/lib/server/alerts-fleets-repository";
import { getWebPushDiagnostics, isWebPushConfigured } from "@/lib/server/web-push";
import { listWebPushSubscriptions } from "@/lib/server/web-push-store";

/** Passive compatibility DTO. Actual Pushover attempts are tracked by the durable worker. */
function getPushoverTransportConfig() {
  const enabled = process.env.PUSHOVER_ENABLED?.trim().toLowerCase() === "true";
  const configured = Boolean(enabled && process.env.PUSHOVER_USER_KEY?.trim() && process.env.PUSHOVER_API_TOKEN?.trim());
  return {
    enabled, configured, attempts: 0, sent: 0, failed: 0,
    lastSuccessAt: null as string | null,
    lastFailureAt: null as string | null,
    lastError: null as string | null,
  };
}

export interface DeliveryHealthSnapshot {
  generatedAt: string;
  durable: Awaited<ReturnType<ReturnType<typeof getAlertsFleetsRepository>["deliveryHealthSnapshot"]>>;
  worker: ReturnType<ReturnType<typeof getAlertDeliveryWorker>["diagnostics"]>;
  pushover: ReturnType<typeof getPushoverTransportConfig>;
  webPush: ReturnType<typeof getWebPushDiagnostics> & { subscriptions: number };
  status: "HEALTHY" | "DEGRADED" | "DISABLED";
  quality: NotificationDeliveryQuality;
}

export async function getDeliveryHealthSnapshot(): Promise<DeliveryHealthSnapshot> {
  const [durable, subscriptions] = await Promise.all([
    getAlertsFleetsRepository().deliveryHealthSnapshot(),
    listWebPushSubscriptions(),
  ]);
  const worker = getAlertDeliveryWorker().diagnostics();
  const pushover = getPushoverTransportConfig();
  const webPush = { ...getWebPushDiagnostics(), configured: isWebPushConfigured(), subscriptions: subscriptions.length };

  const anyConfigured = worker.configured || pushover.configured || webPush.configured;
  const degraded = Boolean(
    durable.failed > 0
    || durable.processing > 0 && !worker.running
    || worker.lastError
    || pushover.lastError
    || webPush.lastError,
  );

  return {
    generatedAt: new Date().toISOString(),
    durable,
    worker,
    pushover,
    webPush,
    status: !anyConfigured ? "DISABLED" : degraded ? "DEGRADED" : "HEALTHY",
    quality: buildNotificationDeliveryQuality({
      configured: anyConfigured,
      workerRunning: worker.running,
      queueDepth: durable.queueDepth,
      processing: durable.processing,
      retryPending: durable.retryPending,
      sent: durable.sent,
      terminalFailures: durable.terminalFailures,
      recentTransportFailure: Boolean(worker.lastError || pushover.lastError || webPush.lastError),
    }),
  };
}
