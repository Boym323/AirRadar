#!/usr/bin/env node
import "dotenv/config";
import { austroControlPdfUrls, discoverAustroControl, extractAustroControlPdfText, fetchAustroControlPdf } from "../lib/atc/austro-control";
import { parseAustrianEnr31Or33, parseAustrianEnr32 } from "../lib/ats/at-eaip-routes";

async function main(): Promise<void> {
  if (process.argv.slice(2).some((arg) => arg !== "--dry-run")) throw new Error("Usage: npm run ats:sync:at -- [--dry-run]");
  const discovery = await discoverAustroControl();
  if (!discovery.current) throw new Error("No currently effective Austro Control AIP found");
  const urls = austroControlPdfUrls(discovery.current);
  const [enr31, enr32, enr33] = await Promise.all([urls.enr31Url, urls.enr32Url, urls.enr33Url].map(async (url) => extractAustroControlPdfText(await fetchAustroControlPdf(url))));
  const nil31 = parseAustrianEnr31Or33(enr31, "ENR 3.1");
  const parsed32 = parseAustrianEnr32(enr32, discovery.current.effectiveFrom, urls.enr32Url);
  const nil33 = parseAustrianEnr31Or33(enr33, "ENR 3.3");
  console.log(`AT ATS ${discovery.current.effectiveFrom}: ENR 3.1 ${nil31.diagnostic.status}; ENR 3.2 ${parsed32.document.counts.routes} routes/${parsed32.document.counts.segments} segments; ENR 3.3 ${nil33.diagnostic.status}`);
  console.log("FRA: audited as metadata-only; no fake ATS LineStrings are generated.");
  console.log("Dry run: no dataset file was modified.");
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

