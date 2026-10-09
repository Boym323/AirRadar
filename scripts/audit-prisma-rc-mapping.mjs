#!/usr/bin/env node
/**
 * Read-only Prisma 8 RC table-name safety audit. CLI RC >=12 no longer applies
 * implicit lower-casing: the existing RC9 model names require verified @@map
 * before a dependency upgrade can be approved.
 *
 * Does not connect to a database or modify the schema.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function inspectPrismaTableMappings(source, catalog = null) {
  const models = [];
  const known = catalog === null ? null : new Set(catalog.map(name => String(name)));
  for (const match of source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const model = match[1];
    const body = match[2];
    const mapped = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? null;
    // Legacy RC9 emitted lower-initial names; this is a candidate only.
    const legacyCandidate = model[0].toLowerCase() + model.slice(1);
    models.push({
      model,
      explicitlyMapped: mapped !== null,
      expectedTable: mapped ?? legacyCandidate,
      legacyCandidate,
      // Without a live catalog, absence cannot be mistaken for compatibility.
      catalogVerified: known === null ? false : known.has(mapped ?? legacyCandidate),
    });
  }
  const duplicates = models
    .filter((entry, index) => models.findIndex(other => other.expectedTable === entry.expectedTable) !== index)
    .map(entry => entry.expectedTable);
  return {
    version: "prisma-rc-table-parity-v1",
    totalModels: models.length,
    explicitMappings: models.filter(x => x.explicitlyMapped).length,
    catalogProvided: known !== null,
    compatibilityVerified: known !== null && models.length > 0
      && models.every(x => x.explicitlyMapped && x.catalogVerified) && duplicates.length === 0,
    duplicates,
    models,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.some(x => x !== "--require-safe" && x !== "--catalog-json" && x !== "--help"
      && x !== "--print-candidates" && !args.includes("--catalog-json")))
    throw new Error("Usage: npm run prisma:upgrade:preflight -- [--catalog-json FILE] [--require-safe] [--print-candidates]");
  if (args.includes("--help")) {
    console.log("Read-only RC table mapping preflight. Supply a JSON array of verified PostgreSQL public table names with --catalog-json FILE.");
    return;
  }
  const idx = args.indexOf("--catalog-json");
  if (idx >= 0 && (!args[idx + 1] || args[idx + 1].startsWith("--")))
    throw new Error("--catalog-json requires a JSON file");
  const contract = readFileSync(resolve("prisma/contract.prisma"), "utf8");
  const catalog = idx >= 0 ? JSON.parse(readFileSync(resolve(args[idx+1]), "utf8")) : null;
  if (catalog !== null && (!Array.isArray(catalog) || !catalog.every(x => typeof x === "string")))
    throw new Error("Table catalog must be an array of table-name strings");
  const result = inspectPrismaTableMappings(contract, catalog);
  const summary = {
    version: result.version, totalModels: result.totalModels,
    explicitMappings: result.explicitMappings, catalogProvided: result.catalogProvided,
    compatibilityVerified: result.compatibilityVerified, duplicates: result.duplicates,
    unmappedModels: result.models.filter(x => !x.explicitlyMapped).map(x => x.model),
    tablesMissingFromCatalog: result.models.filter(x => !x.catalogVerified && catalog !== null).map(x => x.expectedTable),
    ...(args.includes("--print-candidates") ? {mappingCandidatesNotVerified: result.models
      .filter(x => !x.explicitlyMapped).map(x => ({model:x.model, candidate:x.legacyCandidate}))} : {}),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (args.includes("--require-safe") && !result.compatibilityVerified) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try { main(); } catch (e) {
    console.error("[prisma upgrade preflight]", e instanceof Error ? e.message : "unknown error");
    process.exitCode = 2;
  }
}
