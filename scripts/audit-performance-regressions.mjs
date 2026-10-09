#!/usr/bin/env node
// Optional deterministic threshold evaluation of a *recorded* perf report.
// No timing thresholds are enabled automatically on heterogeneous hosted CI runners.
import { readFile } from "node:fs/promises";
const [reportPath, budgetPath] = process.argv.slice(2);
if (!reportPath || !budgetPath) {
  console.error("Usage: node scripts/audit-performance-regressions.mjs report.json budget.json");
  process.exit(2);
}
const [report, budgets] = await Promise.all([reportPath, budgetPath].map(async p => JSON.parse(await readFile(p, "utf8"))));
if (typeof budgets !== "object" || !budgets || Array.isArray(budgets)) throw new Error("Budget must be an object");
if (typeof report !== "object" || !report) throw new Error("Report must be an object");
const errors = [];
for (const [name, cap] of Object.entries(budgets)) {
  if (!Number.isFinite(cap) || cap < 0) throw new Error("Invalid limit for " + name);
  const value = name.split(".").reduce((v, part) => v?.[part], report);
  if (!Number.isFinite(value)) errors.push(`${name}: missing or nonnumeric`);
  else if (value > cap) errors.push(`${name}: ${value} > ${cap}`);
}
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
else console.log(`Performance budgets PASS (${Object.keys(budgets).length} checks)`);
