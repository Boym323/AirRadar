#!/usr/bin/env node
// Offline-only reconciliation of PostgreSQL rollback deltas and process-local
// attribution. No database connection, credentials, or production mutations.
import { readFile } from "node:fs/promises";

const [dbPath, attributionPath] = process.argv.slice(2);
if (!dbPath || !attributionPath) {
  console.error("Usage: node scripts/reconcile-db-rollbacks.mjs database-metrics.json attribution.json");
  process.exitCode = 2;
} else {
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  const attribution = JSON.parse(await readFile(attributionPath, "utf8"));
  const count = (x, label) => {
    if (!Number.isSafeInteger(x) || x < 0) throw Error("Invalid counter: " + label);
    return x;
  };
  const duration = db.window?.durationMinutes;
  if (!Number.isFinite(duration) || duration <= 0) throw Error("Invalid observation window");
  const total = count(db.transactions?.rollbacksDelta, "rollbacksDelta");
  const lanes = attribution.lanes ?? {};
  if (typeof lanes !== "object" || Array.isArray(lanes)) throw Error("Invalid lanes");
  // Explicit failed calls and autocommit failures are different classes of
  // events; neither is guaranteed to equal a PostgreSQL transaction rollback.
  const failures = Object.entries(lanes).map(([lane, data]) => ({
    lane, failures: count(data?.windows?.["15m"]?.failures ?? 0, lane),
  })).filter(x => x.failures > 0).sort((a,b) => b.failures-a.failures);
  const attributedFailures = failures.reduce((sum, row) => sum + row.failures, 0);
  process.stdout.write(JSON.stringify({
    schemaVersion: 1,
    status: "attribution-candidates-only",
    windowMinutes: duration,
    postgresRollbacks: total,
    postgresRollbacksPerMinute: +(total/duration).toFixed(2),
    applicationFailureCandidates: attributedFailures,
    lanes: failures,
    importantCaveats: [
      "Operation failures are not necessarily PostgreSQL transaction rollbacks.",
      "The diagnostic snapshots must cover the same time window and process identity.",
      "Autocommit and explicit transaction lanes must not be double-counted.",
      "The unmatched difference is not an unexplained-rollback count.",
    ],
  }, null, 2) + "\n");
}
