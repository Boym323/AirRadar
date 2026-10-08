"use client";
import { useEffect, useState } from "react";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import type { AlertEffectivenessSnapshot } from "@/lib/server/alert-effectiveness-analytics";
import { t } from "@/lib/i18n";

function pct(value: number | null) { return value === null ? "—" : Math.round(value * 100) + "%"; }
export function AlertEffectivenessAnalyticsPage() {
  const copy = t.locale.startsWith("cs") ? {
    kicker: "AIRRADAR / UPOZORNĚNÍ",
    title: "Analýza účinnosti upozornění",
    description: "Přehled účinnosti posledních 200 uložených událostí upozornění. Pouze ke čtení.",
    unavailable: "Analýza upozornění není dostupná.",
    occurrences: "Události", delivered: "Doručeno", failed: "Selhalo", centerOnly: "Pouze v centru",
    rulesKicker: "PRAVIDLA", rulesTitle: "Účinnost pravidel", attempts: "Průměr pokusů: ",
    rule: "Pravidlo", hits: "Zásahy", sent: "Odesláno", center: "Centrum", success: "Úspěšnost", avgAttempts: "Průměr pokusů",
    empty: "V posledním sledovaném období nejsou uložena žádná upozornění.",
    signalKicker: "SIGNÁL", signalTitle: "Četnost a pokrytí",
    signalDescription: "Pravidla s největším počtem zásahů, aktivní pravidla bez zásahu a letadla s nejvíce upozorněními.",
    noisiest: "Nejčastěji aktivovaná pravidla", dormant: "Aktivní pravidla bez zásahů", topAircraft: "Nejčastěji upozorňovaná letadla", none: "Žádná",
  } : {
    kicker: "AIRRADAR / ALERTS",
    title: "Alert Effectiveness Analytics",
    description: "Read-only effectiveness view over the latest 200 durable alert occurrences.",
    unavailable: "Alert analytics are unavailable.",
    occurrences: "Occurrences", delivered: "Delivered", failed: "Failed", centerOnly: "Center only",
    rulesKicker: "RULES", rulesTitle: "Rule effectiveness", attempts: "Average attempts: ",
    rule: "Rule", hits: "Hits", sent: "Sent", center: "Center", success: "Success", avgAttempts: "Avg attempts",
    empty: "No durable alert occurrences in the bounded window.",
    signalKicker: "SIGNAL", signalTitle: "Noise and coverage",
    signalDescription: "Rules with the most hits, rules with no sampled hits, and aircraft generating the most alert occurrences.",
    noisiest: "Noisiest rules", dormant: "Dormant enabled rules", topAircraft: "Top aircraft", none: "None",
  };
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
    <PageHeader kicker={copy.kicker} title={copy.title} description={copy.description} />
    {failed ? <EmptyState title={copy.unavailable} /> : !data ? <p>{t.common.loading}</p> : <>
      <MetricStrip>
        <MetricCard value={data.boundedOccurrences} label={copy.occurrences} />
        <MetricCard value={data.sent} label={copy.delivered} />
        <MetricCard value={data.failed} label={copy.failed} />
        <MetricCard value={data.centerOnly} label={copy.centerOnly} />
      </MetricStrip>
      <Panel>
        <SectionHeader kicker={copy.rulesKicker} title={copy.rulesTitle} description={copy.attempts + data.averageAttempts.toFixed(2)} />
        {data.rules.length ? <table><thead><tr><th>{copy.rule}</th><th>{copy.hits}</th><th>{copy.sent}</th><th>{copy.failed}</th><th>{copy.center}</th><th>{copy.success}</th><th>{copy.avgAttempts}</th></tr></thead><tbody>
          {data.rules.map((rule) => <tr key={rule.ruleId}><td><strong>{rule.ruleName}</strong><br /><small>{rule.ruleId}</small></td><td>{rule.occurrences}</td><td>{rule.sent}</td><td>{rule.failed}</td><td>{rule.centerOnly}</td><td>{pct(rule.successRate)}</td><td>{rule.averageAttempts.toFixed(2)}</td></tr>)}
        </tbody></table> : <EmptyState title={copy.empty} />}
      </Panel>
      <Panel>
        <SectionHeader kicker={copy.signalKicker} title={copy.signalTitle} description={copy.signalDescription} />
        <div className="statistics-grid">
          <section><h3>{copy.noisiest}</h3><ol>{data.noisiestRules.map((rule) => <li key={rule.ruleId}>{rule.ruleName} <StatusBadge variant="neutral">{rule.occurrences}</StatusBadge></li>)}</ol></section>
          <section><h3>{copy.dormant}</h3>{data.dormantRules.length ? <ul>{data.dormantRules.map((rule) => <li key={rule.ruleId}>{rule.ruleName}</li>)}</ul> : <p>{copy.none}</p>}</section>
          <section><h3>{copy.topAircraft}</h3><ol>{data.topAircraft.map((item) => <li key={item.icaoHex}>{item.icaoHex} · {item.occurrences}</li>)}</ol></section>
        </div>
      </Panel>
    </>}
  </main>;
}
