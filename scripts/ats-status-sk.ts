#!/usr/bin/env node
import "dotenv/config";
import { fetchCurrentSkEaip } from "../lib/atc/sk-eaip";
import { parseSkEaipRoutes } from "../lib/ats/sk-eaip-routes";

async function main(): Promise<void> {
  const source = await fetchCurrentSkEaip();
  const base = source.enr21Url.replace(/LZ-ENR-2\.1-en-SK\.html$/i, "");
  const fetchSection = async (section: "ENR 3.1" | "ENR 3.2"): Promise<ReturnType<typeof parseSkEaipRoutes>> => {
    const filename = section === "ENR 3.1" ? "LZ-ENR-3.1-en-SK.html" : "LZ-ENR-3.2-en-SK.html";
    const response = await fetch(`${base}${filename}`);
    if (!response.ok) throw new Error(`${section} HTTP ${response.status}`);
    return parseSkEaipRoutes(await response.text(), section, `${base}${filename}`, source.effectiveDate);
  };
  const conventional = await fetchSection("ENR 3.1");
  const rnav = await fetchSection("ENR 3.2");
  console.log(`Official source: ${base}`);
  console.log(`Effective date: ${source.effectiveDate}`);
  console.log(`Conventional routes: ${conventional.counts.routes}; points ${conventional.counts.points}; segments ${conventional.counts.segments}`);
  console.log(`RNAV routes: ${rnav.counts.routes}; points ${rnav.counts.points}; segments ${rnav.counts.segments}`);
  console.log(`Total routes: ${conventional.counts.routes + rnav.counts.routes}; segments ${conventional.counts.segments + rnav.counts.segments}`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
