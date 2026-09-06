#!/usr/bin/env node
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateAtcImportDocument } from "../lib/atc/import-format";
import { runAtcImport } from "../lib/atc/import-db";

function parseArguments(): { file: string; dryRun: boolean } {
  const argumentsList = process.argv.slice(2);
  const dryRun = argumentsList.includes("--dry-run");
  const files = argumentsList.filter((argument) => argument !== "--dry-run");
  if (files.length !== 1) throw new Error("Usage: npm run atc:import -- [--dry-run] data/atc/cz-atc.json");
  return { file: resolve(process.cwd(), files[0]), dryRun };
}

async function main(): Promise<void> {
  const { file, dryRun } = parseArguments();
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const dataset = validateAtcImportDocument(raw);
  console.log(`Validated ATC schema v${dataset.schemaVersion}: ${file}`);
  console.log(`Source: ${dataset.source.name} (${dataset.source.reference}), effective ${dataset.source.effectiveDate}`);
  await runAtcImport(dataset, { dryRun });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
