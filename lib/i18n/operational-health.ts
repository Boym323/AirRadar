import type { OperationalHealthReason, OperationalHealthV2 } from "@/lib/server/operational-health-v2";

type OperationalHealthLocale = {
  title: string;
  state: Record<OperationalHealthV2["state"], string>;
  reasons: Record<OperationalHealthReason, string>;
  stateLabel: string;
  availability: string;
  connections: string;
  denied: string;
  coalesced: string;
  database: string;
  predictiveCapture: string;
  predictiveState: Record<OperationalHealthV2["predictiveCapture"], string>;
  noIssues: string;
  reasonLabel: string;
};

const cs: OperationalHealthLocale = {
  title: "Provozní spolehlivost",
  state: { HEALTHY: "V pořádku", DEGRADED: "Zhoršená", INSUFFICIENT_DATA: "Nedostatek dat" },
  reasons: {
    FEEDS_UNAVAILABLE: "Nedostupné přijímací zdroje",
    LOCAL_FEED_STALE: "Zastaralý lokální příjem",
    DATABASE_OFFLINE: "Databáze nedostupná",
    HISTORY_DEGRADED: "Zhoršený zápis historie",
    SSE_CAPACITY_EXHAUSTED: "Vyčerpaná kapacita streamu",
  },
  stateLabel: "Stav", availability: "Dostupné zdroje", connections: "SSE spojení",
  denied: "Odmítnutí od startu", coalesced: "Sloučené snapshoty od startu",
  database: "Databáze", predictiveCapture: "Sběr podkladů predikcí",
  predictiveState: { ACTIVE: "Zapnuto", DISABLED: "Vypnuto", UNAVAILABLE: "Neznámý stav" }, noIssues: "Bez potvrzených problémů", reasonLabel: "Zjištění",
};
const en: OperationalHealthLocale = {
  title: "Operational reliability",
  state: { HEALTHY: "Healthy", DEGRADED: "Degraded", INSUFFICIENT_DATA: "Insufficient evidence" },
  reasons: {
    FEEDS_UNAVAILABLE: "No available feeds",
    LOCAL_FEED_STALE: "Stale local feed",
    DATABASE_OFFLINE: "Database offline",
    HISTORY_DEGRADED: "History persistence degraded",
    SSE_CAPACITY_EXHAUSTED: "SSE capacity exhausted",
  },
  stateLabel: "State", availability: "Feed availability", connections: "SSE sessions",
  denied: "Denied since startup", coalesced: "Coalesced snapshots since startup",
  database: "Database", predictiveCapture: "Prediction evidence capture",
  predictiveState: { ACTIVE: "Enabled", DISABLED: "Disabled", UNAVAILABLE: "Unknown" }, noIssues: "No confirmed issues", reasonLabel: "Findings",
};

export function operationalHealthLabels(locale: string): OperationalHealthLocale {
  return locale.startsWith("cs") ? cs : en;
}
