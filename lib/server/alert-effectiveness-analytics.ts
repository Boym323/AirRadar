import type { AlertV1Config } from "@/lib/server/alerts-fleets-v1";
import { getAlertsFleetsRepository, type AlertV1HistoryRow } from "@/lib/server/alerts-fleets-repository";

export interface AlertRuleEffectiveness {
  ruleId: string;
  ruleName: string;
  occurrences: number;
  deliveries: number;
  sent: number;
  failed: number;
  pending: number;
  processing: number;
  centerOnly: number;
  attempts: number;
  averageAttempts: number;
  successRate: number | null;
}

export interface AlertEffectivenessSnapshot {
  generatedAt: string;
  boundedOccurrences: number;
  totalDeliveries: number;
  sent: number;
  failed: number;
  centerOnly: number;
  averageAttempts: number;
  rules: AlertRuleEffectiveness[];
  noisiestRules: AlertRuleEffectiveness[];
  dormantRules: Array<{ ruleId: string; ruleName: string }>;
  topAircraft: Array<{ icaoHex: string; occurrences: number }>;
}

function payload(row: AlertV1HistoryRow): Record<string, unknown> {
  try { return typeof row.occurrence.payloadJson === "string" ? JSON.parse(row.occurrence.payloadJson) as Record<string, unknown> : {}; }
  catch { return {}; }
}

export function buildAlertEffectivenessAnalytics(config: AlertV1Config, history: readonly AlertV1HistoryRow[]): AlertEffectivenessSnapshot {
  const byRule = new Map<string, AlertRuleEffectiveness>();
  const byAircraft = new Map<string, number>();
  let totalDeliveries = 0, sent = 0, failed = 0, centerOnly = 0, attempts = 0;
  for (const row of history) {
    const ruleId = String(row.occurrence.ruleId ?? "unknown");
    const configuredRule = config.rules.find((rule) => rule.id === ruleId);
    const current = byRule.get(ruleId) ?? {
      ruleId, ruleName: row.ruleName ?? configuredRule?.name ?? ruleId, occurrences: 0, deliveries: 0, sent: 0, failed: 0, pending: 0, processing: 0, centerOnly: 0, attempts: 0, averageAttempts: 0, successRate: null,
    };
    current.occurrences += 1;
    const mode = payload(row).notificationDeliveryMode;
    if (!row.deliveries.length && mode === "CENTER_ONLY") { current.centerOnly += 1; centerOnly += 1; }
    for (const delivery of row.deliveries) {
      totalDeliveries += 1;
      current.deliveries += 1;
      const count = Number.isFinite(delivery.attemptCount) ? delivery.attemptCount : 0;
      attempts += count;
      current.attempts += count;
      if (delivery.status === "SENT") { sent += 1; current.sent += 1; }
      else if (delivery.status === "FAILED") { failed += 1; current.failed += 1; }
      else if (delivery.status === "PROCESSING") current.processing += 1;
      else current.pending += 1;
    }
    byRule.set(ruleId, current);
    const icaoHex = String(row.occurrence.aircraftIcao ?? "UNKNOWN").toUpperCase();
    byAircraft.set(icaoHex, (byAircraft.get(icaoHex) ?? 0) + 1);
  }
  const rules = [...byRule.values()].map((rule) => ({
    ...rule,
    averageAttempts: rule.deliveries ? rule.attempts / rule.deliveries : 0,
    successRate: rule.sent + rule.failed ? rule.sent / (rule.sent + rule.failed) : null,
  })).sort((a, b) => b.occurrences - a.occurrences || a.ruleName.localeCompare(b.ruleName));
  const seenRules = new Set(rules.map((rule) => rule.ruleId));
  return {
    generatedAt: new Date().toISOString(),
    boundedOccurrences: history.length,
    totalDeliveries, sent, failed, centerOnly,
    averageAttempts: totalDeliveries ? attempts / totalDeliveries : 0,
    rules,
    noisiestRules: rules.slice(0, 10),
    dormantRules: config.rules.filter((rule) => rule.enabled && !seenRules.has(rule.id)).map((rule) => ({ ruleId: rule.id, ruleName: rule.name })),
    topAircraft: [...byAircraft.entries()].map(([icaoHex, occurrences]) => ({ icaoHex, occurrences })).sort((a, b) => b.occurrences - a.occurrences || a.icaoHex.localeCompare(b.icaoHex)).slice(0, 10),
  };
}

export async function getAlertEffectivenessAnalytics(): Promise<AlertEffectivenessSnapshot> {
  const repo = getAlertsFleetsRepository();
  const [config, history] = await Promise.all([repo.loadConfig(true), repo.listOccurrenceHistory(200)]);
  return buildAlertEffectivenessAnalytics(config, history);
}
