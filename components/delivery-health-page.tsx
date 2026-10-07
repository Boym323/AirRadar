"use client";

import { useEffect, useState } from "react";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import type { DeliveryHealthSnapshot } from "@/lib/server/delivery-health";

function statusVariant(status: DeliveryHealthSnapshot["status"]) {
  return status === "HEALTHY" ? "success" : status === "DEGRADED" ? "warning" : "neutral";
}

export function DeliveryHealthPage() {
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
      kicker="AIRRADAR / ALERTS"
      title="Delivery Health"
      description="Operational diagnostics for durable Pushover, legacy Pushover and Web Push delivery."
      actions={data ? <StatusBadge variant={statusVariant(data.status)}>{data.status}</StatusBadge> : undefined}
    />
    {error ? <EmptyState title="Delivery diagnostics are unavailable." /> : !data ? <p>Loading…</p> : <>
      <MetricStrip>
        <MetricCard value={data.durable.queueDepth} label="Queue depth" />
        <MetricCard value={data.durable.retryPending} label="Retry pending" />
        <MetricCard value={data.durable.failed} label="Terminal failures" />
        <MetricCard value={data.durable.totalAttempts} label="Delivery attempts" />
      </MetricStrip>

      <Panel>
        <SectionHeader kicker="DURABLE WORKER" title="Pushover queue" description="Runtime state and persisted delivery outcomes." />
        <div className="statistics-grid">
          <div><strong>Worker</strong><p>{data.worker.running ? "RUNNING" : data.worker.enabled ? "STOPPED" : "DISABLED"}</p></div>
          <div><strong>Last run</strong><p>{data.worker.lastRunAt ?? "—"}</p></div>
          <div><strong>Last success</strong><p>{data.worker.lastSuccessAt ?? data.durable.lastSuccessAt ?? "—"}</p></div>
          <div><strong>Last failure</strong><p>{data.worker.lastFailureAt ?? data.durable.lastFailureAt ?? "—"}</p></div>
          <div><strong>Recovered stale</strong><p>{data.worker.recoveredStale}</p></div>
          <div><strong>Retries</strong><p>{data.worker.retried}</p></div>
        </div>
        {(data.worker.lastError || data.durable.lastError) ? <p role="status">Last error: {data.worker.lastError ?? data.durable.lastError}</p> : null}
      </Panel>

      <Panel>
        <SectionHeader kicker="PROVIDERS" title="External channels" description="Provider readiness and in-process delivery counters." />
        <div className="statistics-grid">
          <section>
            <h3>Legacy Pushover</h3>
            <p>{data.pushover.configured ? "CONFIGURED" : "DISABLED"}</p>
            <p>{data.pushover.sent} sent · {data.pushover.failed} failed · {data.pushover.attempts} attempts</p>
            <small>{data.pushover.lastError ?? "No current error"}</small>
          </section>
          <section>
            <h3>Web Push</h3>
            <p>{data.webPush.configured ? "CONFIGURED" : "DISABLED"} · {data.webPush.subscriptions} subscriptions</p>
            <p>{data.webPush.sent} sent · {data.webPush.failed} failed · {data.webPush.attempts} attempts</p>
            <small>{data.webPush.staleSubscriptionsRemoved} stale subscriptions removed</small>
          </section>
        </div>
      </Panel>
    </>}
  </main>;
}
