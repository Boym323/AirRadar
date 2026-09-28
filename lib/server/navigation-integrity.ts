import "temporal-polyfill/full/global";
import type { Aircraft } from "@/lib/aircraft/types";
import { cellCoordinate } from "@/lib/navigation-integrity/grid";
import { buildBaseline } from "@/lib/navigation-integrity/baseline";
import { classifyNavigationIntegrity } from "@/lib/navigation-integrity/classification";
import { detectNavigationIntegrityAnomalies, summariseCells, NAVIGATION_INTEGRITY_DETECTOR } from "@/lib/navigation-integrity/detector";
import { observationFromAircraft } from "@/lib/navigation-integrity/observation";
import type { NavigationIntegrityAnomaly, NavigationIntegrityCurrentResponse, NavigationIntegrityDiagnostics, NavigationIntegrityObservation } from "@/lib/navigation-integrity/types";
import { getPrisma } from "@/lib/server/db";

const WINDOW_MS = 15 * 60_000;
const RETENTION_MS = 2 * 60 * 60_000;
const MAX_OBSERVATIONS = 10_000;
const HEARTBEAT_MS = 120_000;
const MOVEMENT_DEDUP_DEGREES = 0.1;

type IntegrityStore = {
  observations: NavigationIntegrityObservation[];
  lastPersisted: Map<string, NavigationIntegrityObservation>;
  active: Map<string, NavigationIntegrityAnomaly>;
  candidateHits: Map<string, number>;
  normalHits: Map<string, number>;
  diagnostics: NavigationIntegrityDiagnostics;
  lastEvaluationAt: number;
  lastCollectionAt: number;
  writeTail: Promise<void>;
};

const globalStore = globalThis as typeof globalThis & { __airRadarNavigationIntegrity?: IntegrityStore };
const store: IntegrityStore = globalStore.__airRadarNavigationIntegrity ??= {
  observations: [], lastPersisted: new Map(), active: new Map(), candidateHits: new Map(), normalHits: new Map(), lastEvaluationAt: 0, writeTail: Promise.resolve(),
  diagnostics: {
    observationsCreated: 0, persisted: 0, deduplicated: 0, rejectedInvalidOrStale: 0, aircraftContributors: 0, cellsPopulated: 0, baselineCellsReady: 0,
    anomalyCandidates: 0, anomaliesOpened: 0, anomaliesClosed: 0, confidence: { LOW: 0, MEDIUM: 0, HIGH: 0 }, rejectionReasons: {}, lastObservationAt: null, lastPersistedAt: null, baselineMaturity: { UNAVAILABLE: 0, IMMATURE: 0, PARTIAL: 0, READY: 0, STRONG: 0 },
  }, lastCollectionAt: 0,
};

function addRejection(reason: string): void { store.diagnostics.rejectionReasons[reason] = (store.diagnostics.rejectionReasons[reason] ?? 0) + 1; }
function finiteInt(value: number | null): number | null { return value === null || !Number.isFinite(value) ? null : Math.round(value); }
function instant(date: string): Temporal.Instant { return Temporal.Instant.fromEpochMilliseconds(Date.parse(date)); }
function dedupKey(observation: NavigationIntegrityObservation): string {
  return `${observation.aircraftHex}:${Math.floor(Date.parse(observation.observedAt) / 60_000)}:${observation.source}:${observation.nic ?? "x"}:${observation.nacP ?? "x"}:${observation.nacV ?? "x"}`;
}
function changedMeaningfully(previous: NavigationIntegrityObservation | undefined, current: NavigationIntegrityObservation): boolean {
  if (!previous) return true;
  if (previous.source !== current.source || previous.altitudeBand !== current.altitudeBand) return true;
  if (Math.abs(previous.lat - current.lat) >= MOVEMENT_DEDUP_DEGREES || Math.abs(previous.lon - current.lon) >= MOVEMENT_DEDUP_DEGREES) return true;
  const previousState = classifyNavigationIntegrity(previous).state;
  const currentState = classifyNavigationIntegrity(current).state;
  if (previousState !== currentState) return true;
  return Date.parse(current.observedAt) - Date.parse(previous.observedAt) >= HEARTBEAT_MS;
}

async function persistObservation(observation: NavigationIntegrityObservation): Promise<void> {
  const database = getPrisma();
  if (!database) return;
  const key = dedupKey(observation);
  const schema = database.orm.public;
  await schema.NavigationIntegrityObservation.create({
    dedupKey: key,
    aircraftHex: observation.aircraftHex,
    flightId: observation.flightId,
    observedAt: instant(observation.observedAt),
    receivedAt: instant(observation.receivedAt),
    lat: observation.lat,
    lon: observation.lon,
    latCell: cellCoordinate(observation.lat),
    lonCell: cellCoordinate(observation.lon),
    altitudeFt: finiteInt(observation.altitudeFt),
    altitudeBand: observation.altitudeBand,
    nic: finiteInt(observation.nic), nacP: finiteInt(observation.nacP), nacV: finiteInt(observation.nacV), sil: finiteInt(observation.sil), sda: finiteInt(observation.sda), gva: finiteInt(observation.gva), adsbVersion: finiteInt(observation.adsbVersion),
    positionSource: observation.positionSource,
    source: observation.source,
    provider: observation.provider,
    quality: observation.quality,
    confidence: observation.confidence,
    provenanceJson: JSON.stringify(observation.provenance),
  });
}

async function persistAnomaly(anomaly: NavigationIntegrityAnomaly): Promise<void> {
  const database = getPrisma();
  if (!database) return;
  const schema = database.orm.public;
  await schema.NavigationIntegrityAnomaly.upsert({
    conflictOn: { id: anomaly.id },
    create: {
      id: anomaly.id,
      startedAt: instant(anomaly.startedAt),
      lastObservedAt: instant(anomaly.lastObservedAt),
      endedAt: anomaly.endedAt ? instant(anomaly.endedAt) : null,
      cellKeysJson: JSON.stringify(anomaly.cellKeys),
      altitudeBandsJson: JSON.stringify(anomaly.altitudeBands),
      affectedAircraftCount: anomaly.affectedAircraftCount,
      sampleCount: anomaly.sampleCount,
      baselineAircraftCount: anomaly.baselineAircraftCount,
      medianNic: anomaly.medianNic,
      medianNacP: anomaly.medianNacP,
      medianNacV: anomaly.medianNacV,
      baselineMedianNic: anomaly.baselineMedianNic,
      baselineMedianNacP: anomaly.baselineMedianNacP,
      baselineMedianNacV: anomaly.baselineMedianNacV,
      confidence: anomaly.confidence,
      severity: anomaly.severity,
      evidenceJson: JSON.stringify(anomaly.evidence),
      createdAt: instant(anomaly.startedAt),
    },
    update: {
      lastObservedAt: instant(anomaly.lastObservedAt),
      endedAt: anomaly.endedAt ? instant(anomaly.endedAt) : null,
      cellKeysJson: JSON.stringify(anomaly.cellKeys),
      altitudeBandsJson: JSON.stringify(anomaly.altitudeBands),
      affectedAircraftCount: anomaly.affectedAircraftCount,
      sampleCount: anomaly.sampleCount,
      baselineAircraftCount: anomaly.baselineAircraftCount,
      medianNic: anomaly.medianNic,
      medianNacP: anomaly.medianNacP,
      medianNacV: anomaly.medianNacV,
      baselineMedianNic: anomaly.baselineMedianNic,
      baselineMedianNacP: anomaly.baselineMedianNacP,
      baselineMedianNacV: anomaly.baselineMedianNacV,
      confidence: anomaly.confidence,
      severity: anomaly.severity,
      evidenceJson: JSON.stringify(anomaly.evidence),
    },
  });
}

function enqueue(work: () => Promise<void>): void {
  store.writeTail = store.writeTail.then(work, work).catch(() => undefined);
}

function prune(now: number): void {
  const cutoff = now - RETENTION_MS;
  store.observations = store.observations.filter((item) => Date.parse(item.receivedAt) >= cutoff);
  if (store.observations.length > MAX_OBSERVATIONS) store.observations = store.observations.slice(-MAX_OBSERVATIONS);
  for (const [hex, item] of store.lastPersisted) if (Date.parse(item.receivedAt) < cutoff) store.lastPersisted.delete(hex);
}

function anomalyKey(anomaly: NavigationIntegrityAnomaly): string { return `ni:${anomaly.cellKeys.join("|")}:${anomaly.altitudeBands.join(",")}`; }

function evaluate(now: Date): void {
  const from = now.getTime() - WINDOW_MS;
  const recent = store.observations.filter((item) => Date.parse(item.receivedAt) >= from);
  const baselines = buildBaseline(recent);
  const cells = summariseCells(recent, baselines);
  store.diagnostics.cellsPopulated = cells.length;
  store.diagnostics.baselineCellsReady = [...baselines.values()].filter((item) => item.aircraftCount >= 3).length;
  store.diagnostics.baselineMaturity = { UNAVAILABLE: 0, IMMATURE: 0, PARTIAL: 0, READY: 0, STRONG: 0 };
  for (const item of baselines.values()) store.diagnostics.baselineMaturity[item.maturity] += 1;
  const candidates = detectNavigationIntegrityAnomalies(recent, now, baselines);
  store.diagnostics.anomalyCandidates += candidates.length;
  const candidateKeys = new Set<string>();
  for (const candidate of candidates) {
    const key = anomalyKey(candidate);
    candidateKeys.add(key);
    const hits = (store.candidateHits.get(key) ?? 0) + 1;
    store.candidateHits.set(key, hits);
    if (hits < NAVIGATION_INTEGRITY_DETECTOR.openEvaluations && !store.active.has(key)) continue;
    const existing = store.active.get(key);
    if (existing) {
      const updated = { ...candidate, id: existing.id, startedAt: existing.startedAt, endedAt: null };
      store.active.set(key, updated);
      enqueue(async () => { try { await persistAnomaly(updated); } catch { /* database is optional */ } });
    } else {
      const opened = { ...candidate, id: key };
      store.active.set(key, opened);
      store.diagnostics.anomaliesOpened += 1;
      store.diagnostics.confidence[opened.confidence] += 1;
      enqueue(async () => { try { await persistAnomaly(opened); } catch { /* database is optional */ } });
    }
  }
  for (const [key, anomaly] of store.active) {
    if (candidateKeys.has(key)) { store.normalHits.delete(key); continue; }
    const normalHits = (store.normalHits.get(key) ?? 0) + 1;
    store.normalHits.set(key, normalHits);
    if (normalHits < NAVIGATION_INTEGRITY_DETECTOR.closeEvaluations) continue;
    const closed = { ...anomaly, endedAt: now.toISOString() };
    enqueue(async () => { try { await persistAnomaly(closed); } catch { /* database is optional */ } });
    store.active.set(key, closed);
    store.active.delete(key);
    store.diagnostics.anomaliesClosed += 1;
    store.candidateHits.delete(key);
    store.normalHits.delete(key);
  }
  store.lastEvaluationAt = now.getTime();
}

export class NavigationIntegrityService {
  observe(aircraft: Aircraft[], now = new Date()): void {
    if (now.getTime() - store.lastCollectionAt < 15_000) return;
    store.lastCollectionAt = now.getTime();
    prune(now.getTime());
    for (const item of aircraft) {
      const observation = observationFromAircraft(item, now);
      if (!observation) { store.diagnostics.rejectedInvalidOrStale += 1; addRejection("invalid_or_stale_pair"); continue; }
      store.diagnostics.observationsCreated += 1;
      store.diagnostics.lastObservationAt = observation.observedAt;
      store.observations.push(observation);
      store.diagnostics.confidence[observation.confidence] += 0;
      const previous = store.lastPersisted.get(observation.aircraftHex);
      if (!changedMeaningfully(previous, observation)) { store.diagnostics.deduplicated += 1; continue; }
      store.lastPersisted.set(observation.aircraftHex, observation);
      store.diagnostics.persisted += 1;
      store.diagnostics.lastPersistedAt = observation.observedAt;
      enqueue(async () => { try { await persistObservation(observation); } catch { /* database is optional */ } });
    }
    store.diagnostics.aircraftContributors = new Set(store.observations.map((item) => item.aircraftHex)).size;
    if (now.getTime() - store.lastEvaluationAt >= 30_000) evaluate(now);
  }

  getCurrent(window: "5m" | "15m" | "30m" | "60m" = "15m", now = new Date(), filters: { minAltitudeFt?: number; maxAltitudeFt?: number; source?: "LOCAL" | "NETWORK" } = {}): NavigationIntegrityCurrentResponse {
    const minutes = Number(window.slice(0, -1));
    const observations = store.observations.filter((item) => Date.parse(item.receivedAt) >= now.getTime() - minutes * 60_000
      && (filters.minAltitudeFt === undefined || (item.altitudeFt !== null && item.altitudeFt >= filters.minAltitudeFt))
      && (filters.maxAltitudeFt === undefined || (item.altitudeFt !== null && item.altitudeFt <= filters.maxAltitudeFt))
      && (filters.source === undefined || item.source === filters.source));
    const baselines = buildBaseline(observations);
    const cells = summariseCells(observations, baselines);
    const activeAnomalies = [...store.active.values()].filter((item) => item.endedAt === null);
    return {
      generatedAt: now.toISOString(), window,
      summary: { observations: observations.length, aircraft: new Set(observations.map((item) => item.aircraftHex)).size, cells: cells.length, reducedAircraft: new Set(observations.filter((item) => classifyNavigationIntegrity(item).state !== "NORMAL").map((item) => item.aircraftHex)).size, activeAnomalies: activeAnomalies.length },
      cells, activeAnomalies,
    };
  }

  getAircraft(icaoHex: string, now = new Date()): { latest: NavigationIntegrityObservation | null; classification: ReturnType<typeof classifyNavigationIntegrity> | null; regionalContext: { state: string; affectedAircraft: number; anomaly: NavigationIntegrityAnomaly | null } } {
    const latest = [...store.observations].reverse().find((item) => item.aircraftHex === icaoHex && Date.parse(item.receivedAt) >= now.getTime() - WINDOW_MS) ?? null;
    const anomaly = [...store.active.values()].find((item) => item.evidence.independentAircraft.includes(icaoHex)) ?? null;
    return { latest, classification: latest ? classifyNavigationIntegrity(latest) : null, regionalContext: { state: anomaly?.severity ?? "NORMAL", affectedAircraft: anomaly?.affectedAircraftCount ?? 0, anomaly } };
  }

  async getHistory(from: Date, to: Date): Promise<NavigationIntegrityAnomaly[]> {
    const local = [...store.active.values()].filter((item) => Date.parse(item.startedAt) < to.getTime() && (item.endedAt === null || Date.parse(item.endedAt) >= from.getTime()));
    const database = getPrisma();
    if (!database) return local;
    try {
      const rows = await database.orm.public.NavigationIntegrityAnomaly
        .where((row) => row.startedAt.lt(instant(to.toISOString())))
        .orderBy((row) => row.startedAt.desc())
        .limit(200)
        .all();
      const persisted = rows.map((row) => ({
        id: row.id,
        startedAt: String(row.startedAt),
        lastObservedAt: String(row.lastObservedAt),
        endedAt: row.endedAt === null ? null : String(row.endedAt),
        cellKeys: JSON.parse(row.cellKeysJson) as string[],
        altitudeBands: JSON.parse(row.altitudeBandsJson) as number[],
        affectedAircraftCount: row.affectedAircraftCount,
        sampleCount: row.sampleCount,
        baselineAircraftCount: row.baselineAircraftCount,
        medianNic: row.medianNic,
        medianNacP: row.medianNacP,
        medianNacV: row.medianNacV,
        baselineMedianNic: row.baselineMedianNic,
        baselineMedianNacP: row.baselineMedianNacP,
        baselineMedianNacV: row.baselineMedianNacV,
        confidence: row.confidence as NavigationIntegrityAnomaly["confidence"],
        severity: row.severity as NavigationIntegrityAnomaly["severity"],
        evidence: JSON.parse(row.evidenceJson) as NavigationIntegrityAnomaly["evidence"],
      })).filter((item) => item.endedAt === null || Date.parse(item.endedAt) >= from.getTime());
      return persisted;
    } catch {
      return local;
    }
  }

  getDiagnostics(): NavigationIntegrityDiagnostics { return { ...store.diagnostics, confidence: { ...store.diagnostics.confidence }, rejectionReasons: { ...store.diagnostics.rejectionReasons }, baselineMaturity: { ...store.diagnostics.baselineMaturity } }; }
}

const globalService = globalThis as typeof globalThis & { __airRadarNavigationIntegrityService?: NavigationIntegrityService };
export function getNavigationIntegrityService(): NavigationIntegrityService { return globalService.__airRadarNavigationIntegrityService ??= new NavigationIntegrityService(); }
