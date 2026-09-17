import { fetchCurrentSkEaip } from "@/lib/atc/sk-eaip";
import { AUSTRO_CONTROL_ENTRY_URL, discoverAustroControl } from "@/lib/atc/austro-control";
import { CZ_EAIP_AD2_URL, CZ_EAIP_GEN02_URL, fetchOfficialCzEaip, parseCzPublicationMetadata } from "@/lib/atc/cz-eaip";

export type ProcedureCountry = "CZ" | "SK" | "AT";

export interface ProcedureSourceRequest {
  country: ProcedureCountry;
  airportIcao: string;
  url: string;
  provider: string;
  reference: string;
  effectiveDate: string | null;
  airacCycle: string | null;
  amendment: string | null;
  html: string;
}

export const PROCEDURE_SOURCE_HOSTS: Record<ProcedureCountry, string> = {
  CZ: "aim.rlp.cz",
  SK: "aim.lps.sk",
  AT: "eaip.austrocontrol.at",
};

export const PROCEDURE_DEFAULT_AIRPORTS: Record<ProcedureCountry, string[]> = {
  CZ: ["LKPR", "LKMT"],
  SK: ["LZIB", "LZKZ"],
  AT: ["LOWW", "LOWL"],
};

function isOfficialUrl(country: ProcedureCountry, value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === PROCEDURE_SOURCE_HOSTS[country] && !url.username && !url.password; } catch { return false; }
}

function effectiveDateFromHtml(html: string): string | null {
  return /<meta[^>]+content=["'](20\d{2}-\d{2}-\d{2})["'][^>]+name=["']EM\.effectiveDateStart["']/i.exec(html)?.[1]
    ?? /<meta[^>]+name=["']EM\.effectiveDateStart["'][^>]+content=["'](20\d{2}-\d{2}-\d{2})["']/i.exec(html)?.[1]
    ?? null;
}

export async function fetchOfficialProcedureSource(country: ProcedureCountry, airportIcao: string, fetchImpl: typeof fetch = fetch): Promise<ProcedureSourceRequest> {
  const icao = airportIcao.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(icao)) throw new Error(`Invalid procedure airport ICAO: ${airportIcao}`);
  if (country === "CZ") {
    const url = CZ_EAIP_AD2_URL.replace("{icao}", icao);
    if (!isOfficialUrl(country, url)) throw new Error("Czech procedure URL failed official-host validation");
    const [html, publicationHtml] = await Promise.all([fetchOfficialCzEaip(url), fetchOfficialCzEaip(CZ_EAIP_GEN02_URL)]);
    const publication = parseCzPublicationMetadata(publicationHtml);
    return { country, airportIcao: icao, url, provider: "AIM ŘLP ČR eAIP", reference: `${url} | ${CZ_EAIP_GEN02_URL}`, effectiveDate: effectiveDateFromHtml(html) ?? publication.effectiveDate, airacCycle: publication.airacAmendment, amendment: publication.aipAmendment, html };
  }
  if (country === "SK") {
    const current = await fetchCurrentSkEaip({ fetchImpl });
    const url = `${current.enr21Url.replace(/LZ-ENR-2\.1-en-SK\.html$/i, "")}LZ-AD-2.${icao}-en-SK.html`;
    if (!isOfficialUrl(country, url)) throw new Error("Slovak procedure URL failed official-host validation");
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: "text/html,application/xhtml+xml" } });
    if (!response.ok) throw new Error(`Official Slovak ${icao} AD 2 page returned HTTP ${response.status}`);
    const html = await response.text();
    return { country, airportIcao: icao, url, provider: "LPS SR eAIP", reference: url, effectiveDate: current.effectiveDate, airacCycle: null, amendment: null, html };
  }
  const discovery = await discoverAustroControl({ fetchImpl });
  if (!discovery.current) throw new Error("No currently effective Austro Control AIP publication was discovered");
  const prefix = discovery.current.baseUrl;
  const url = `${prefix}ad_2_${icao.toLowerCase()}.htm`;
  if (!isOfficialUrl(country, url)) throw new Error("Austrian procedure URL failed official-host validation");
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: "text/html,application/xhtml+xml" } });
  if (!response.ok) throw new Error(`Official Austrian ${icao} AD 2 page returned HTTP ${response.status}`);
  const html = await response.text();
  return { country, airportIcao: icao, url, provider: "Austro Control AIP", reference: url, effectiveDate: discovery.current.effectiveFrom, airacCycle: null, amendment: discovery.latestAiracAmendment ?? discovery.latestAmendment, html };
}

export function assertOfficialProcedureUrl(country: ProcedureCountry, url: string): void {
  if (!isOfficialUrl(country, url)) throw new Error(`Refusing non-authoritative ${country} procedure URL`);
}

export const OFFICIAL_PROCEDURE_ENTRYPOINTS = {
  CZ: CZ_EAIP_AD2_URL,
  SK: "https://aim.lps.sk/web/eAIP_SR/",
  AT: AUSTRO_CONTROL_ENTRY_URL,
} as const;
