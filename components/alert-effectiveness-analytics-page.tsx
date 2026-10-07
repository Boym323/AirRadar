"use client";
import { useEffect, useState } from "react";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import type { AlertEffectivenessSnapshot } from "@/lib/server/alert-effectiveness-analytics";

function pct(value: number | null) { return value === null ? "—" : Math.round(value * 100) + "%"; }
export function AlertEffectivenessAnalyticsPage() {
  const [data, setData] = useState<AlertEffectivenessSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/alerts/analytics", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("analytics unavailable"); return await response.json() as AlertEffectivenessSnapshot; })
      .then((next) => { if (!controller.signal.aborted) { setData(next); setFailed(false); } })
      .catch((error) => { if ((error as Error).name !== "AbortError") setFailed(true); });
    return () => controller.abort();
  }, []);
  return <main className="history-page" data-testid="alert-effectiveness-analytics-v1">
    <PageHeader kicker="AIRRADAR / ALERTS" title="Alert Effectiveness Analytics" description="Read-only effectiveness view over the latest 200 durable alert occurrences." />
    {failed ? <EmptyState title="Alert analytics are unavailable." /> : !data ? <p>Loading…</p> : <>
      <MetricStrip>
        <MetricCard value={data.boundedOccurrences} label="Occurrences" />
        <MetricCard value={data.sent} label="Delivered" />
        <MetricCard value={data.failed} label="Failed" />
        <MetricCard value={data.centerOnly} label="Center only" />
      </MetricStrip>
      <Panel>
        <SectionHeader kicker="RULES" title="Rule effectiveness" description={"Average attempts: " + data.averageAttempts.toFixed(2)} />
        {data.rules.length ? <table><thead><tr><th>Rule</th><th>Hits</th><th>Sent</th><th>Failed</th><th>Center</th><th>Success</th><th>Avg attempts</th></tr></thead><tbody>
          {data.rules.map((rule) => <tr key={rule.ruleId}><td><strong>{rule.ruleName}</strong><br /><small>{rule.ruleId}</small></td><td>{rule.occurrences}</td><td>{rule.sent}</td><td>{rule.failed}</td><td>{rule.centerOnly}</td><td>{pct(rule.successRate)}</td><td>{rule.averageAttempts.toFixed(2)}</td></tr>)}
        </tbody></table> : <EmptyState title="No durable alert occurrences in the bounded window." />}
      </Panel>
      <Panel>
        <SectionHeader kicker="SIGNAL" title="Noise and coverage" description="Rules with the most hits, rules with no sampled hits, and aircraft generating the most alert occurrences." />
        <div className="statistics-grid">
          <section><h3>Noisiest rules</h3><ol>{data.noisiestRules.map((rule) => <li key={rule.ruleId}>{rule.ruleName} <StatusBadge variant="neutral">{rule.occurrences}</StatusBadge></li>)}</ol></section>
          <section><h3>Dormant enabled rules</h3>{data.dormantRules.length ? <ul>{data.dormantRules.map((rule) => <li key={rule.ruleId}>{rule.ruleName}</li>)}</ul> : <p>None</p>}</section>
          <section><h3>Top aircraft</h3><ol>{data.topAircraft.map((item) => <li key={item.icaoHex}>{item.icaoHex} · {item.occurrences}</li>)}</ol></section>
        </div>
      </Panel>
    </>}
  </main>;
}
