import { getAlertDeliveryWorker } from "@/lib/server/alert-delivery-worker";
import { getAlertsFleetsRepository } from "@/lib/server/alerts-fleets-repository";
import { getLegacyPushoverDiagnostics } from "@/lib/server/alert-notifier";
import { getWebPushDiagnostics, isWebPushConfigured } from "@/lib/server/web-push";
import { listWebPushSubscriptions } from "@/lib/server/web-push-store";

export interface DeliveryHealthSnapshot {
  generatedAt: string;
  durable: Awaited<ReturnType<ReturnType<typeof getAlertsFleetsRepository>["deliveryHealthSnapshot"]>>;
  worker: ReturnType<ReturnType<typeof getAlertDeliveryWorker>["diagnostics"]>;
  pushover: ReturnType<typeof getLegacyPushoverDiagnostics>;
  webPush: ReturnType<typeof getWebPushDiagnostics> & { subscriptions: number };
  status: "HEALTHY" | "DEGRADED" | "DISABLED";
}

export async function getDeliveryHealthSnapshot(): Promise<DeliveryHealthSnapshot> {
  const [durable, subscriptions] = await Promise.all([
    getAlertsFleetsRepository().deliveryHealthSnapshot(),
    listWebPushSubscriptions(),
  ]);
  const worker = getAlertDeliveryWorker().diagnostics();
  const pushover = getLegacyPushoverDiagnostics();
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
  };
}
