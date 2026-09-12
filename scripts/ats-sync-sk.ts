#!/usr/bin/env node
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fetchCurrentSkEaip } from "../lib/atc/sk-eaip";
import { parseSkEaipRoutes } from "../lib/ats/sk-eaip-routes";

async function main(): Promise<void> {
  if (process.argv.slice(2).some((arg) => arg !== "--dry-run")) throw new Error("Usage: npm run ats:sync:sk -- [--dry-run]");
  const dryRun = process.argv.includes("--dry-run");
  const source = await fetchCurrentSkEaip();
  const base = source.enr21Url.replace(/LZ-ENR-2\.1-en-SK\.html$/i, "");
  const sections = await Promise.all(((["ENR 3.1", "ENR 3.2"] as const).map(async (section) => {
    const filename = section === "ENR 3.1" ? "LZ-ENR-3.1-en-SK.html" : "LZ-ENR-3.2-en-SK.html";
    const response = await fetch(`${base}${filename}`);
    if (!response.ok) throw new Error(`${section} HTTP ${response.status}`);
    return parseSkEaipRoutes(await response.text(), section, `${base}${filename}`, source.effectiveDate);
  })));
  const routes = sections.flatMap((document) => document.routes);
  const document = { ...sections[0], source: { ...sections[0].source, reference: base, sections: ["ENR 3.1", "ENR 3.2"] }, routes, counts: { routes: routes.length, points: routes.reduce((n, r) => n + r.points.length, 0), segments: routes.reduce((n, r) => n + r.segments.length, 0), cdrSegments: routes.flatMap((r) => r.segments).filter((s) => s.availabilityClass !== null).length, discontinuities: 0 } };
  console.log(`Official source: ${base}`);
  console.log(`Effective date: ${source.effectiveDate}`);
  console.log(`Routes: ${document.counts.routes}; points: ${document.counts.points}; segments: ${document.counts.segments}`);
  if (dryRun) return;
  const path = resolve(process.env.ATS_SK_ROUTES_PATH?.trim() || "data/ats/generated/sk-routes.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path}`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
