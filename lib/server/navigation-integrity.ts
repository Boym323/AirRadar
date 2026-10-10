import "temporal-polyfill/full/global";
import type { Aircraft } from "@/lib/aircraft/types";
import { cellCoordinate } from "@/lib/navigation-integrity/grid";
import { buildBaseline } from "@/lib/navigation-integrity/baseline";
import { classifyNavigationIntegrity } from "@/lib/navigation-integrity/classification";
import { detectNavigationIntegrityAnomalies, summariseCells, NAVIGATION_INTEGRITY_DETECTOR } from "@/lib/navigation-integrity/detector";
import { observationFromAircraft } from "@/lib/navigation-integrity/observation";
import type { NavigationIntegrityAnomaly, NavigationIntegrityCurrentResponse, NavigationIntegrityDiagnostics, NavigationIntegrityObservation } from "@/lib/navigation-integrity/types";
import { getPrisma } from "@/lib/server/db";
import { trackDbOperation } from "@/lib/server/db-operation-diagnostics";

const WINDOW_MS = 15 * 60_000;
const RETENTION_MS = 2 * 60 * 60_000;
const MAX_OBSERVATIONS = 10_000;
const HEARTBEAT_MS = 120_000;
const MOVEMENT_DEDUP_DEGREES = 0.1;
const MAX_PENDING_OBSERVATIONS = 2_048;
const WRITE_ACK_TTL_MS = 2 * 60_000;
const WRITE_ACK_MAX_KEYS = 1_024;

// Process-local, bounded acknowledgement cache: only successfully completed
// writes are memoized. Not a replacement for the database unique constraint,
// which still provides correctness across processes/restarts.
type DurableWriteMemo = {
  confirmed: Map<string, number>;
  inFlight: Map<string, Promise<void>>;
  avoidedUpserts: number;
};
const globalWriteMemo = globalThis as typeof globalThis & { __airRadarNavigationWriteMemo?: DurableWriteMemo };
const durableWriteMemo: DurableWriteMemo = globalWriteMemo.__airRadarNavigationWriteMemo ??= {
  confirmed: new Map(), inFlight: new Map(), avoidedUpserts: 0,
};

async function persistAcknowledgedOnce(key: string, operation: () => Promise<unknown>): Promise<void> {
  const now = Date.now();
  const expiresAt = durableWriteMemo.confirmed.get(key);
  if (expiresAt !== undefined && expiresAt > now) {
    durableWriteMemo.avoidedUpserts += 1;
    return;
  }
  if (expiresAt !== undefined) durableWriteMemo.confirmed.delete(key);

  const inFlight = durableWriteMemo.inFlight.get(key);
  if (inFlight) {
    // A failed first attempt rejects all waiters; it is never acknowledged.
    await inFlight;
    durableWriteMemo.avoidedUpserts += 1;
    return;
  }
  const write = (async () => {
    await operation();
    durableWriteMemo.confirmed.set(key, Date.now() + WRITE_ACK_TTL_MS);
    while (durableWriteMemo.confirmed.size > WRITE_ACK_MAX_KEYS) {
      const oldest = durableWriteMemo.confirmed.keys().next().value;
      if (oldest === undefined) break;
      durableWriteMemo.confirmed.delete(oldest);
    }
  })();
  durableWriteMemo.inFlight.set(key, write);
  try {
    await write;
  } finally {
    if (durableWriteMemo.inFlight.get(key) === write) durableWriteMemo.inFlight.delete(key);
  }
}

export function getNavigationWriteMemoDiagnostics(): {
  scope: "process-local"; confirmedKeys: number; inFlight: number;
  avoidedUpserts: number; ttlMs: number; maxKeys: number;
} {
  return {
    scope: "process-local",
    confirmedKeys: durableWriteMemo.confirmed.size,
    inFlight: durableWriteMemo.inFlight.size,
    avoidedUpserts: durableWriteMemo.avoidedUpserts,
    ttlMs: WRITE_ACK_TTL_MS,
    maxKeys: WRITE_ACK_MAX_KEYS,
  };
}

/** Test-only reset. Never clears durable rows or changes DB state. */
export function resetNavigationWriteMemoForTests(): void {
  durableWriteMemo.confirmed.clear();
  durableWriteMemo.inFlight.clear();
  durableWriteMemo.avoidedUpserts = 0;
}

const collectionTimes = new Map<string, number>();
const pendingObservations = new Map<string, NavigationIntegrityObservation>();
let observationDrainActive = false;

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
  currentVersion: number;
  currentCache: Map<string, { version: number; value: Omit<NavigationIntegrityCurrentResponse, "generatedAt"> }>;
};

const globalStore = globalThis as typeof globalThis & { __airRadarNavigationIntegrity?: IntegrityStore };
const store: IntegrityStore = globalStore.__airRadarNavigationIntegrity ??= {
  observations: [], lastPersisted: new Map(), active: new Map(), candidateHits: new Map(), normalHits: new Map(), lastEvaluationAt: 0, writeTail: Promise.resolve(), currentVersion: 0, currentCache: new Map(),
  diagnostics: {
    observationsCreated: 0, persisted: 0, ormAttempts: 0, ormSuccesses: 0, deduplicated: 0, rejectedInvalidOrStale: 0, aircraftContributors: 0, cellsPopulated: 0, baselineCellsReady: 0,
    anomalyCandidates: 0, anomaliesOpened: 0, anomaliesClosed: 0, confidence: { LOW: 0, MEDIUM: 0, HIGH: 0 }, rejectionReasons: {}, lastObservationAt: null, lastPersistedAt: null, baselineMaturity: { UNAVAILABLE: 0, IMMATURE: 0, PARTIAL: 0, READY: 0, STRONG: 0 },
  }, lastCollectionAt: 0,
};

function addRejection(reason: string): void { store.diagnostics.rejectionReasons[reason] = (store.diagnostics.rejectionReasons[reason] ?? 0) + 1; }
function finiteInt(value: number | null): number | null { return value === null || !Number.isFinite(value) ? null : Math.round(value); }
function instant(date: string): Temporal.Instant { return Temporal.Instant.fromEpochMilliseconds(Date.parse(date)); }
function dedupKey(observation: NavigationIntegrityObservation): string {
  // v2 identity preserves meaningfully distinct same-minute observations.
  // Stable microdegree coordinates cover movement even when timestamps coincide;
  // altitude band and classification cover the other changedMeaningfully paths.
  // The prefix keeps legacy minute-granular keys untouched during rollout.
  return [
    "v2", observation.aircraftHex, Date.parse(observation.observedAt),
    observation.source, observation.nic ?? "x", observation.nacP ?? "x",
    observation.nacV ?? "x", Math.round(observation.lat * 1_000_000),
    Math.round(observation.lon * 1_000_000), observation.altitudeBand,
    classifyNavigationIntegrity(observation).state,
  ].join(":");
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

export async function persistNavigationIntegrityObservation(observation: NavigationIntegrityObservation): Promise<void> {
  const database = getPrisma();
  if (!database) return;
  const key = dedupKey(observation);
  const schema = database.orm.public;
  const row = {
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
  };
  // ORM 8.0.0-rc.9 has no insert-on-conflict-skip API (added in rc.12).
  // A non-empty update uses native atomic upsert. Only reassign the same
  // immutable key on collision; never overwrite a previously stored position,
  // timestamp, classification, or provenance. PostgreSQL may still touch the
  // existing tuple, so do not count every successful upsert as a new insert.
  await persistAcknowledgedOnce(key, async () => {
    store.diagnostics.ormAttempts += 1;
    await trackDbOperation("navigation.observation.create", () =>
      schema.NavigationIntegrityObservation.upsert({
        conflictOn: { dedupKey: key },
        update: { dedupKey: key },
        create: row,
      }));
    store.diagnostics.ormSuccesses += 1;
  });
}

async function persistAnomaly(anomaly: NavigationIntegrityAnomaly): Promise<void> {
  const database = getPrisma();
  if (!database) return;
  const schema = database.orm.public;
  await trackDbOperation("navigation.anomaly.upsert", () => schema.NavigationIntegrityAnomaly.upsert({
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
  }));
}

function enqueue(work: () => Promise<void>): void {
  store.writeTail = store.writeTail.then(work, work).catch(() => undefined);
}

function queueObservation(observation: NavigationIntegrityObservation): boolean {
  const key = dedupKey(observation);
  if (!pendingObservations.has(key) && pendingObservations.size >= MAX_PENDING_OBSERVATIONS) {
    addRejection("persistence_queue_capacity");
    return false;
  }
  pendingObservations.set(key, observation);
  if (!observationDrainActive) {
    observationDrainActive = true;
    enqueue(async () => {
      try {
        // Yield the serial writer after a small group so anomaly lifecycle
        // writes are not starved by continuous observation ingestion.
        for (let count = 0; count < 64 && pendingObservations.size; count++) {
          const [key, item] = pendingObservations.entries().next().value!;
          pendingObservations.delete(key);
          try {
            if (!getPrisma()) continue;
            await persistNavigationIntegrityObservation(item);
            // A successful upsert confirms durable availability, but cannot
            // distinguish an insert from a duplicate-key self-update.
            store.diagnostics.persisted += 1;
            store.diagnostics.lastPersistedAt = item.observedAt;
          } catch {
            // Retry on the next collection rather than memoizing a failed write.
            if (store.lastPersisted.get(item.aircraftHex) === item) store.lastPersisted.delete(item.aircraftHex);
          }
        }
      } finally {
        observationDrainActive = false;
        const next = pendingObservations.values().next().value;
        if (next) queueObservation(next);
      }
    });
  }
  return true;
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
  observe(aircraft: Iterable<Aircraft>, now = new Date(), lane: "local" | "network" | "default" = "default"): void {
    if (now.getTime() - (collectionTimes.get(lane) ?? 0) < 15_000) return;
    collectionTimes.set(lane, now.getTime());
    store.lastCollectionAt = now.getTime();
    prune(now.getTime());
    store.currentVersion += 1;
    store.currentCache.clear();
    for (const item of aircraft) {
      const observation = observationFromAircraft(item, now);
      if (!observation) { store.diagnostics.rejectedInvalidOrStale += 1; addRejection("invalid_or_stale_pair"); continue; }
      store.diagnostics.observationsCreated += 1;
      store.diagnostics.lastObservationAt = observation.observedAt;
      store.observations.push(observation);
      store.diagnostics.confidence[observation.confidence] += 0;
      const previous = store.lastPersisted.get(observation.aircraftHex);
      if (!changedMeaningfully(previous, observation)) { store.diagnostics.deduplicated += 1; continue; }
      if (queueObservation(observation)) store.lastPersisted.set(observation.aircraftHex, observation);
    }
    const contributors = new Set<string>();
    for (const item of store.observations) contributors.add(item.aircraftHex);
    store.diagnostics.aircraftContributors = contributors.size;
    if (now.getTime() - store.lastEvaluationAt >= 30_000) evaluate(now);
  }

  getCurrent(window: "5m" | "15m" | "30m" | "60m" = "15m", now = new Date(), filters: { minAltitudeFt?: number; maxAltitudeFt?: number; source?: "LOCAL" | "NETWORK" } = {}): NavigationIntegrityCurrentResponse {
    const nowMs = now.getTime();
    const cacheKey = [
      window,
      filters.source ?? "*",
      filters.minAltitudeFt ?? "*",
      filters.maxAltitudeFt ?? "*",
      Math.floor(nowMs / 5_000),
    ].join(":");
    const cached = store.currentCache.get(cacheKey);
    if (cached?.version === store.currentVersion) return { ...cached.value, generatedAt: now.toISOString() };

    const minutes = Number(window.slice(0, -1));
    const observations: NavigationIntegrityObservation[] = [];
    const aircraftHexes = new Set<string>();
    const reducedAircraftHexes = new Set<string>();
    const cutoff = nowMs - minutes * 60_000;
    for (const item of store.observations) {
      if (Date.parse(item.receivedAt) < cutoff) continue;
      if (filters.minAltitudeFt !== undefined && (item.altitudeFt === null || item.altitudeFt < filters.minAltitudeFt)) continue;
      if (filters.maxAltitudeFt !== undefined && (item.altitudeFt === null || item.altitudeFt > filters.maxAltitudeFt)) continue;
      if (filters.source !== undefined && item.source !== filters.source) continue;
      observations.push(item);
      aircraftHexes.add(item.aircraftHex);
      if (classifyNavigationIntegrity(item).state !== "NORMAL") reducedAircraftHexes.add(item.aircraftHex);
    }
    const baselines = buildBaseline(observations);
    const cells = summariseCells(observations, baselines);
    const activeAnomalies: NavigationIntegrityAnomaly[] = [];
    for (const item of store.active.values()) if (item.endedAt === null) activeAnomalies.push(item);
    const value: Omit<NavigationIntegrityCurrentResponse, "generatedAt"> = {
      window,
      summary: { observations: observations.length, aircraft: aircraftHexes.size, cells: cells.length, reducedAircraft: reducedAircraftHexes.size, activeAnomalies: activeAnomalies.length },
      cells,
      activeAnomalies,
    };
    if (store.currentCache.size >= 32) store.currentCache.clear();
    store.currentCache.set(cacheKey, { version: store.currentVersion, value });
    return { ...value, generatedAt: now.toISOString() };
  }

  getAircraft(icaoHex: string, now = new Date()): { latest: NavigationIntegrityObservation | null; classification: ReturnType<typeof classifyNavigationIntegrity> | null; regionalContext: { state: string; affectedAircraft: number; anomaly: NavigationIntegrityAnomaly | null } } {
    let latest: NavigationIntegrityObservation | null = null;
    const cutoff = now.getTime() - WINDOW_MS;
    for (let index = store.observations.length - 1; index >= 0; index -= 1) {
      const item = store.observations[index]!;
      if (item.aircraftHex === icaoHex && Date.parse(item.receivedAt) >= cutoff) { latest = item; break; }
    }
    let anomaly: NavigationIntegrityAnomaly | null = null;
    for (const item of store.active.values()) {
      if (item.evidence.independentAircraft.includes(icaoHex)) { anomaly = item; break; }
    }
    return { latest, classification: latest ? classifyNavigationIntegrity(latest) : null, regionalContext: { state: anomaly?.severity ?? "NORMAL", affectedAircraft: anomaly?.affectedAircraftCount ?? 0, anomaly } };
  }

  async getHistory(from: Date, to: Date): Promise<NavigationIntegrityAnomaly[]> {
    const local = [...store.active.values()].filter((item) => Date.parse(item.startedAt) < to.getTime() && (item.endedAt === null || Date.parse(item.endedAt) >= from.getTime()));
    const database = getPrisma();
    if (!database) return local;
    try {
      const rows = await trackDbOperation("navigation.history.query", async () => await database.orm.public.NavigationIntegrityAnomaly
        .where((row) => row.startedAt.lt(instant(to.toISOString())))
        .orderBy((row) => row.startedAt.desc())
        .limit(200)
        .all());
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
