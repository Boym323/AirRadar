import {
  CZ_ACTIVATION_INDEX_URL,
  CZ_AUP_INDEX_URL,
  buildCurrentCzPlan,
  parseCzActualActivationIndex,
  parseCzActualActivationPreview,
  parseCzAupIndex,
  parseCzPlanPage,
} from "@/lib/airspace-activity/cz-aim";
import type {
  AirspaceActivityResponse,
  AirspacePlanSnapshot,
  HistoricalAirspaceActivitySnapshot,
} from "@/lib/airspace-activity/types";
import { getAirRadarUserAgent } from "@/lib/server/user-agent";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 512 * 1024;
const PLAN_TTL_MS = 5 * 60_000;
const PLAN_STALE_MAX_MS = 60 * 60_000;
const ACTUAL_TTL_MS = 30 * 60_000;
const ACTUAL_STALE_MAX_MS = 48 * 60 * 60_000;

interface CacheEntry<T> {
  value: T;
  loadedAt: number;
}

let planCache: CacheEntry<AirspacePlanSnapshot> | null = null;
let actualCache: CacheEntry<HistoricalAirspaceActivitySnapshot> | null = null;
let planInflight: Promise<AirspacePlanSnapshot> | null = null;
let actualInflight: Promise<HistoricalAirspaceActivitySnapshot> | null = null;

function unavailablePlan(now: Date): AirspacePlanSnapshot {
  return {
    status: "unavailable",
    validityStart: null,
    validityEnd: null,
    issuedAt: null,
    aupReference: null,
    latestUupReference: null,
    uupCount: 0,
    fetchedAt: now.toISOString(),
    windows: [],
  };
}

function unavailableActual(now: Date): HistoricalAirspaceActivitySnapshot {
  return {
    status: "unavailable",
    delayed: true,
    periodStart: null,
    periodEnd: null,
    sourceReference: null,
    fetchedAt: now.toISOString(),
    records: [],
  };
}

async function fetchBoundedHtml(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !["aup.rlp.cz", "aim.rlp.cz"].includes(parsed.hostname)) {
    throw new Error("Unsupported Czech AIM host");
  }
  const response = await fetch(parsed, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      "User-Agent": getAirRadarUserAgent("airspace-activity"),
    },
  });
  if (!response.ok) throw new Error(`Czech AIM request failed (${response.status})`);
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) throw new Error("Czech AIM response too large");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_HTML_BYTES) throw new Error("Czech AIM response too large");
  return text;
}

async function loadPlan(now: Date): Promise<AirspacePlanSnapshot> {
  const index = parseCzAupIndex(await fetchBoundedHtml(CZ_AUP_INDEX_URL));
  if (!index.aupUrl) throw new Error("Current Czech AUP link not found");

  const aupPage = parseCzPlanPage(await fetchBoundedHtml(index.aupUrl));
  const uupPages = await Promise.all(index.uupUrls.map(async (reference) => ({
    reference,
    page: parseCzPlanPage(await fetchBoundedHtml(reference)),
  })));
  const applicableUups = uupPages
    .filter(({ page }) => page.validityStart.getTime() === aupPage.validityStart.getTime() && page.validityEnd.getTime() === aupPage.validityEnd.getTime())
    .sort((left, right) => (left.page.issuedAt?.getTime() ?? 0) - (right.page.issuedAt?.getTime() ?? 0));

  return {
    status: "ok",
    validityStart: aupPage.validityStart.toISOString(),
    validityEnd: aupPage.validityEnd.toISOString(),
    issuedAt: aupPage.issuedAt?.toISOString() ?? null,
    aupReference: index.aupUrl,
    latestUupReference: applicableUups.at(-1)?.reference ?? null,
    uupCount: applicableUups.length,
    fetchedAt: now.toISOString(),
    windows: buildCurrentCzPlan(aupPage, index.aupUrl, applicableUups, now),
  };
}

async function loadActual(now: Date): Promise<HistoricalAirspaceActivitySnapshot> {
  const index = parseCzActualActivationIndex(await fetchBoundedHtml(CZ_ACTIVATION_INDEX_URL));
  if (!index.fileName || !index.previewUrl || !index.sourceUrl) throw new Error("Latest Czech actual-activation file not found");
  const records = parseCzActualActivationPreview(await fetchBoundedHtml(index.previewUrl));
  return {
    status: "ok",
    delayed: true,
    periodStart: index.periodStart?.toISOString() ?? null,
    periodEnd: index.periodEnd?.toISOString() ?? null,
    sourceReference: index.sourceUrl,
    fetchedAt: now.toISOString(),
    records,
  };
}

async function cachedPlan(now: Date): Promise<AirspacePlanSnapshot> {
  const timestamp = now.getTime();
  if (planCache && timestamp - planCache.loadedAt < PLAN_TTL_MS) return planCache.value;
  if (planInflight) return planInflight;
  planInflight = loadPlan(now)
    .then((value) => {
      planCache = { value, loadedAt: Date.now() };
      return value;
    })
    .catch(() => {
      if (planCache && timestamp - planCache.loadedAt <= PLAN_STALE_MAX_MS) return { ...planCache.value, status: "stale" as const };
      return unavailablePlan(now);
    })
    .finally(() => { planInflight = null; });
  return planInflight;
}

async function cachedActual(now: Date): Promise<HistoricalAirspaceActivitySnapshot> {
  const timestamp = now.getTime();
  if (actualCache && timestamp - actualCache.loadedAt < ACTUAL_TTL_MS) return actualCache.value;
  if (actualInflight) return actualInflight;
  actualInflight = loadActual(now)
    .then((value) => {
      actualCache = { value, loadedAt: Date.now() };
      return value;
    })
    .catch(() => {
      if (actualCache && timestamp - actualCache.loadedAt <= ACTUAL_STALE_MAX_MS) return { ...actualCache.value, status: "stale" as const };
      return unavailableActual(now);
    })
    .finally(() => { actualInflight = null; });
  return actualInflight;
}

export async function getAirspaceActivity(now = new Date()): Promise<AirspaceActivityResponse> {
  const [planned, historicalActual] = await Promise.all([cachedPlan(now), cachedActual(now)]);
  return {
    fetchedAt: now.toISOString(),
    planned,
    historicalActual,
    disclaimer: "AUP/UUP describes planned airspace allocation, not confirmed real-time activation. Historical actual activations are official ANS CR records published with a normal 1–2 day delay. Operational status must be verified with the appropriate ATS/FIC source.",
  };
}

export function resetAirspaceActivityCacheForTests(): void {
  planCache = null;
  actualCache = null;
  planInflight = null;
  actualInflight = null;
}
