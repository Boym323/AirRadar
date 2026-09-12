#!/usr/bin/env node
import "dotenv/config";
import { austroControlPdfUrls, discoverAustroControl, extractAustroControlPdfText, fetchAustroControlPdf, parseAustrianEnr21 } from "../lib/atc/austro-control";
import { validateAtcImportDocument } from "../lib/atc/import-format";
import { AustrianBevBoundaryProvider, BEV_AUSTRIAN_BOUNDARY_SOURCE } from "../lib/atc/austrian-boundary";

async function main(): Promise<void> {
  if (process.argv.slice(2).some((arg) => arg !== "--dry-run")) throw new Error("Usage: npm run atc:sync:at -- [--dry-run]");
  const dryRun = process.argv.includes("--dry-run");
  const discovery = await discoverAustroControl();
  if (!discovery.current) throw new Error("No currently effective Austro Control AIP found");
  const urls = austroControlPdfUrls(discovery.current);
  const enr21 = await extractAustroControlPdfText(await fetchAustroControlPdf(urls.enr21Url));
  const boundary = new AustrianBevBoundaryProvider();
  let boundaryResolver: ((start: [number, number], end: [number, number], name: string) => [number, number][]) | undefined;
  const boundarySnaps: number[] = [];
  try { boundary.load(); boundaryResolver = (start, end, name) => { const result = boundary.getBoundarySegment({ kind: "austrian-border", neighbour: "DE" }, { start, end, hint: name }); boundarySnaps.push(result.startSnapDistanceKm, result.endSnapDistanceKm); return result.coordinates; }; } catch { /* A missing committed artifact remains a sync failure, never a straight-line fallback. */ }
  const parsed = parseAustrianEnr21(enr21, { effectiveDate: discovery.current.effectiveFrom, sourceReference: `${urls.enr21Url} | geometry: ${BEV_AUSTRIAN_BOUNDARY_SOURCE}`, boundaryResolver });
  const document = validateAtcImportDocument(parsed.document);
  const accepted = parsed.diagnostics.filter((item) => item.status === "accepted");
  const rejected = parsed.diagnostics.filter((item) => item.status === "skipped");
  const typeCounts = [...parsed.document.sectors.reduce((counts, sector) => { const type = String(sector.airspaceType ?? "unknown"); counts.set(type, (counts.get(type) ?? 0) + 1); return counts; }, new Map<string, number>())].map(([type, count]) => `${type} ${count}`).join(", ");
  const geometryCounts = [...parsed.diagnostics.reduce((counts, item) => { const type = String(item.geometry ?? "none"); counts.set(type, (counts.get(type) ?? 0) + 1); return counts; }, new Map<string, number>())].map(([type, count]) => `${type} ${count}`).join(", ");
  console.log(`Provider: ${discovery.provider}; current ${discovery.current.effectiveFrom}; future ${discovery.future?.effectiveFrom ?? "none"}`);
  console.log(`AMDT: ${discovery.latestAmendment ?? "unknown"}; AIRAC ${discovery.latestAiracAmendment ?? "unknown"}`);
  console.log(`ATC AT: source ${parsed.diagnostics.length}; accepted ${accepted.length}; rejected ${rejected.length}; persisted preview ${document.sectors.length}`);
  console.log(`Airspace types: ${typeCounts}; geometry: ${geometryCounts}`);
  for (const item of rejected) console.log(`  reject ${item.name}: ${item.reason}`);
  if (boundarySnaps.length) { const sorted = [...boundarySnaps].sort((left, right) => left - right); console.log(`Boundary snaps: max ${Math.max(...boundarySnaps).toFixed(3)} km; median ${sorted[Math.floor(sorted.length / 2)].toFixed(3)} km; limit 5.000 km`); }
  if (dryRun) console.log("Dry run: no database or dataset file was modified.");
  else console.log("Apply intentionally disabled in this implementation; use the reviewed import/release procedure for production enablement.");
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
