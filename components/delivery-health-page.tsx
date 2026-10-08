"use client";

import { useEffect, useState } from "react";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import type { DeliveryHealthSnapshot } from "@/lib/server/delivery-health";
import { t } from "@/lib/i18n";

function statusVariant(status: DeliveryHealthSnapshot["status"]) {
  return status === "HEALTHY" ? "success" : status === "DEGRADED" ? "warning" : "neutral";
}

export function DeliveryHealthPage() {
  const copy = t.locale.startsWith("cs") ? {
    kicker: "AIRRADAR / UPOZORNĚNÍ", title: "Stav doručování upozornění",
    description: "Provozní diagnostika doručování přes Pushover, starší propojení Pushover a Web Push.",
    unavailable: "Diagnostika doručování není dostupná.",
    healthy: "V pořádku", degraded: "Omezený provoz",
    queueDepth: "Ve frontě", retryPending: "Čeká na opakování", terminalFailures: "Trvalá selhání", deliveryAttempts: "Pokusy o doručení",
    workerKicker: "DORUČOVACÍ SLUŽBA", queueTitle: "Fronta Pushover", queueDescription: "Aktuální stav služby a uložené výsledky doručování.",
    worker: "Služba", lastRun: "Poslední běh", lastSuccess: "Poslední úspěch",
    lastFailure: "Poslední selhání", recoveredStale: "Obnovené zastaralé úlohy",
    retries: "Opakované pokusy", lastError: "Poslední chyba",
    running: "BĚŽÍ", stopped: "ZASTAVENO", disabled: "VYPNUTO", configured: "NASTAVENO",
    providersKicker: "POSKYTOVATELÉ", providersTitle: "Externí kanály", providersDescription: "Připravenost poskytovatelů a počty pokusů o doručení.",
    legacyPushover: "Starší propojení Pushover", webPush: "Web Push",
    sent: "odesláno", failed: "selhalo", attempts: "pokusů", subscriptions: "odběrů",
    removedSubscriptions: "odstraněných neplatných odběrů", noError: "Aktuálně bez chyby",
  } : {
    kicker: "AIRRADAR / ALERTS", title: "Delivery Health",
    description: "Operational diagnostics for durable Pushover, legacy Pushover and Web Push delivery.",
    unavailable: "Delivery diagnostics are unavailable.",
    healthy: "Healthy", degraded: "Degraded",
    queueDepth: "Queue depth", retryPending: "Retry pending", terminalFailures: "Terminal failures", deliveryAttempts: "Delivery attempts",
    workerKicker: "DURABLE WORKER", queueTitle: "Pushover queue", queueDescription: "Runtime state and persisted delivery outcomes.",
    worker: "Worker", lastRun: "Last run", lastSuccess: "Last success",
    lastFailure: "Last failure", recoveredStale: "Recovered stale",
    retries: "Retries", lastError: "Last error",
    running: "RUNNING", stopped: "STOPPED", disabled: "DISABLED", configured: "CONFIGURED",
    providersKicker: "PROVIDERS", providersTitle: "External channels", providersDescription: "Provider readiness and in-process delivery counters.",
    legacyPushover: "Legacy Pushover", webPush: "Web Push",
    sent: "sent", failed: "failed", attempts: "attempts", subscriptions: "subscriptions",
    removedSubscriptions: "stale subscriptions removed", noError: "No current error",
  };
  const [data, setData] = useState<DeliveryHealthSnapshot | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/alerts/delivery-health", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("delivery health unavailable");
        return await response.json() as DeliveryHealthSnapshot;
      })
      .then((next) => { if (!controller.signal.aborted) { setData(next); setError(false); } })
      .catch((failure) => { if ((failure as Error).name !== "AbortError") setError(true); });
    return () => controller.abort();
  }, []);

  return <main className="history-page" data-testid="delivery-health-v1">
    <PageHeader
      kicker={copy.kicker}
      title={copy.title}
      description={copy.description}
      actions={data ? <StatusBadge variant={statusVariant(data.status)}>{data.status === "HEALTHY" ? copy.healthy : data.status === "DEGRADED" ? copy.degraded : copy.disabled}</StatusBadge> : undefined}
    />
    {error ? <EmptyState title={copy.unavailable} /> : !data ? <p>{t.common.loading}</p> : <>
      <MetricStrip>
        <MetricCard value={data.durable.queueDepth} label={copy.queueDepth} />
        <MetricCard value={data.durable.retryPending} label={copy.retryPending} />
        <MetricCard value={data.durable.failed} label={copy.terminalFailures} />
        <MetricCard value={data.durable.totalAttempts} label={copy.deliveryAttempts} />
      </MetricStrip>

      <Panel>
        <SectionHeader kicker={copy.workerKicker} title={copy.queueTitle} description={copy.queueDescription} />
        <div className="statistics-grid">
          <div><strong>{copy.worker}</strong><p>{data.worker.running ? copy.running : data.worker.enabled ? copy.stopped : copy.disabled}</p></div>
          <div><strong>{copy.lastRun}</strong><p>{data.worker.lastRunAt ?? "—"}</p></div>
          <div><strong>{copy.lastSuccess}</strong><p>{data.worker.lastSuccessAt ?? data.durable.lastSuccessAt ?? "—"}</p></div>
          <div><strong>{copy.lastFailure}</strong><p>{data.worker.lastFailureAt ?? data.durable.lastFailureAt ?? "—"}</p></div>
          <div><strong>{copy.recoveredStale}</strong><p>{data.worker.recoveredStale}</p></div>
          <div><strong>{copy.retries}</strong><p>{data.worker.retried}</p></div>
        </div>
        {(data.worker.lastError || data.durable.lastError) ? <p role="status">{copy.lastError}: {data.worker.lastError ?? data.durable.lastError}</p> : null}
      </Panel>

      <Panel>
        <SectionHeader kicker={copy.providersKicker} title={copy.providersTitle} description={copy.providersDescription} />
        <div className="statistics-grid">
          <section>
            <h3>{copy.legacyPushover}</h3>
            <p>{data.pushover.configured ? copy.configured : copy.disabled}</p>
            <p>{data.pushover.sent} {copy.sent} · {data.pushover.failed} {copy.failed} · {data.pushover.attempts} {copy.attempts}</p>
            <small>{data.pushover.lastError ?? copy.noError}</small>
          </section>
          <section>
            <h3>{copy.webPush}</h3>
            <p>{data.webPush.configured ? copy.configured : copy.disabled} · {data.webPush.subscriptions} {copy.subscriptions}</p>
            <p>{data.webPush.sent} {copy.sent} · {data.webPush.failed} {copy.failed} · {data.webPush.attempts} {copy.attempts}</p>
            <small>{data.webPush.staleSubscriptionsRemoved} {copy.removedSubscriptions}</small>
          </section>
        </div>
      </Panel>
    </>}
  </main>;
}
