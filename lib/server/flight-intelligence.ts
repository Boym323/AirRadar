import type { Aircraft } from "@/lib/aircraft/types";
import { Temporal } from "temporal-polyfill";
import type { AirportRunway } from "@/lib/airports/infrastructure";
import { getFlightContinuityGapMs } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import { trackDbOperation } from "@/lib/server/db-operation-diagnostics";
import { FlightIntelligenceDetector } from "@/lib/intelligence/detector";
import { confidenceLevel, FLIGHT_INTELLIGENCE_DETECTOR_VERSION, type FlightIntelligenceEvent, type FlightEventType, type FlightPhase } from "@/lib/intelligence/types";
import type { RunwayContext } from "@/lib/route-intelligence/contracts";
import { haversineDistanceKm } from "@/lib/geo";
import { fitTerminalEvidence, type LandingGroundObservation, type LandingTerminalEvidenceV1 } from "@/lib/intelligence/terminal-evidence";
import { TERMINAL_EVIDENCE_VERSION } from "@/lib/intelligence/terminal-evidence";

const MAX_EVENTS = 500;
const AIRPORT_INDEX_RETRY_MS = 60_000;
const PENDING_GROUND_TTL_MS = 8 * 60_000;
const MAX_PENDING_GROUND = 256;
const MAX_GROUND_EVENT_DISTANCE_KM = 5;
const MAX_GROUND_AIRPORT_DISTANCE_KM = 5;

type Listener = (event: FlightIntelligenceEvent) => void;

export interface IntelligenceQuery {
  limit?: number;
  type?: FlightEventType;
  aircraft?: string;
  flightId?: number;
  since?: string;
}

interface RelationQuery {
  select(...fields: string[]): RelationQuery;
}

interface FlightEventRow {
  id?: number;
  eventKey: string;
  type: FlightEventType;
  icaoHex: string;
  flightId?: number | null;
  metadataJson?: string | null;
  occurredAt: Date | string;
  detectedAt: Date | string;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  confidence?: number;
  airportIcao?: string | null;
  runway?: string | null;
  sectorId?: string | null;
  evidenceJson?: string | null;
  aircraft?: { registration?: string | null } | null;
  flight?: { callsign?: string | null; registration?: string | null } | null;
}

interface FlightEventQuery {
  where(filter: Record<string, unknown>): FlightEventQuery;
  orderBy(order: unknown): FlightEventQuery;
  limit(value: number): FlightEventQuery;
  include(relation: string, callback: (query: RelationQuery) => RelationQuery): FlightEventQuery;
  all(): Promise<FlightEventRow[]>;
  first?(): Promise<FlightEventRow | null>;
  update?(values: Record<string, unknown>): Promise<unknown>;
}

interface FlightEventTable extends FlightEventQuery {
  create(input: Record<string, unknown>): Promise<unknown>;
}

interface FlightRow {
  id: number;
  startTime?: Date | string;
  lastSeenAt?: Date | string;
  endTime?: Date | string | null;
}

interface FlightQuery {
  where(filter: Record<string, unknown>): FlightQuery;
  orderBy(order: unknown): FlightQuery;
  limit(value: number): FlightQuery;
  first(): Promise<FlightRow | null>;
  all(): Promise<FlightRow[]>;
}

interface FlightTable {
  where(filter: Record<string, unknown>): FlightQuery;
}

interface AircraftTable {
  where(filter: Record<string, unknown>): { first(): Promise<{ id: number } | null> };
}

interface AirportTable {
  all(): Promise<Array<{
    id?: number;
    icao: string;
    iata: string | null;
    name: string;
    city: string | null;
    country: string | null;
    latitude: number;
    longitude: number;
  }>>;
}

interface AirportRunwayTable {
  all(): Promise<AirportRunway[]>;
}

export class FlightIntelligenceService {
  private readonly detector = new FlightIntelligenceDetector([]);
  private readonly events: FlightIntelligenceEvent[] = [];
  private readonly listeners = new Set<Listener>();
  private airportIndexLoaded = false;
  private airportIndexLoading: Promise<void> | null = null;
  private airportIndexRetryAt = 0;
  private readonly airportsByIcao = new Map<string, { latitude: number; longitude: number }>();
  /** Bounded authoritative runway index loaded alongside the airport index. */
  private readonly runwaysByAirport = new Map<string, readonly AirportRunway[]>();
  private readonly persistence = new Map<string, Promise<void>>();
  private readonly pendingGround = new Map<string, { event: FlightIntelligenceEvent; expiresAt: number }>();
  private readonly diagnostics = { landingEvents: 0, landingEvidenceCaptured: 0, landingDetectedOnGround: 0, landingPendingGroundConfirmation: 0, landingGroundConfirmedLater: 0, landingGroundConfirmationExpired: 0, landingEvidencePersistFailures: 0, reportedArrivalRunwayPresent: 0, terminalEvidenceVersion: TERMINAL_EVIDENCE_VERSION };

  constructor() {
    void this.ensureAirportIndex();
  }

  private ensureAirportIndex(now = Date.now()): Promise<void> {
    if (this.airportIndexLoaded) return Promise.resolve();
    if (this.airportIndexLoading) return this.airportIndexLoading;
    if (now < this.airportIndexRetryAt) return Promise.resolve();

    const database = getPrisma();
    const table = database?.orm.public.Airport as unknown as AirportTable | undefined;
    if (!table) {
      this.airportIndexRetryAt = now + AIRPORT_INDEX_RETRY_MS;
      return Promise.resolve();
    }

    this.airportIndexLoading = (async () => {
      try {
        const rows = await trackDbOperation("flight-intelligence.airport-index.query", async () => await table.all());
        this.airportsByIcao.clear();
        for (const row of rows) {
          if (Number.isFinite(row.latitude) && Number.isFinite(row.longitude)) {
            this.airportsByIcao.set(row.icao.toUpperCase(), { latitude: row.latitude, longitude: row.longitude });
          }
        }
        const runwayTable = (database!.orm.public as unknown as { AirportRunway?: AirportRunwayTable }).AirportRunway;
        const runwayResult = runwayTable && typeof runwayTable.all === "function"
          ? await Promise.allSettled([trackDbOperation("flight-intelligence.airport-index.query", async () => await runwayTable.all())])
          : [];
        const runways = runwayResult[0]?.status === "fulfilled" ? runwayResult[0].value.slice(0, 200_000) : [];
        const runwaysByAirportId = new Map<number, AirportRunway[]>();
        for (const runway of runways) {
          const values = runwaysByAirportId.get(runway.airportId) ?? [];
          if (values.length < 64) values.push(runway);
          runwaysByAirportId.set(runway.airportId, values);
        }
        const runwaysByAirport = new Map<string, readonly AirportRunway[]>();
        this.detector.setAirports(rows
          .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude))
          .map((row) => {
            const airport = {
            icaoCode: row.icao,
            iataCode: row.iata,
            name: row.name,
            city: row.city,
            country: row.country,
            latitude: row.latitude,
            longitude: row.longitude,
            };
            if (row.id !== undefined) runwaysByAirport.set(row.icao.toUpperCase(), runwaysByAirportId.get(row.id) ?? []);
            return airport;
          }));
        this.detector.setRunways(runwaysByAirport);
        this.runwaysByAirport.clear();
        for (const [icao, values] of runwaysByAirport) this.runwaysByAirport.set(icao, values);
        this.airportIndexLoaded = true;
        this.airportIndexRetryAt = 0;
      } catch {
        this.airportIndexRetryAt = Date.now() + AIRPORT_INDEX_RETRY_MS;
      } finally {
        this.airportIndexLoading = null;
      }
    })();

    return this.airportIndexLoading;
  }

  observe(previous: Aircraft | undefined, aircraft: Aircraft, observedAt?: number): FlightIntelligenceEvent[] {
    void this.ensureAirportIndex();
    let detected: FlightIntelligenceEvent[];
    try {
      detected = this.detector.observe(previous, aircraft, observedAt);
    } catch {
      // Intelligence is optional enrichment. A malformed observation must not
      // reject the live snapshot or stop the single state owner.
      return [];
    }
    this.expirePendingGround(Date.now());
    for (const event of detected) {
      this.events.unshift(event);
      if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch {
          this.listeners.delete(listener);
        }
      }
      const persistence = this.persist(event);
      this.persistence.set(event.eventKey, persistence);
      void persistence.finally(() => this.persistence.delete(event.eventKey));
      if (event.type === "LANDING") this.captureLanding(event, aircraft, persistence);
    }
    this.confirmPendingGround(aircraft, observedAt ?? Date.parse(aircraft.lastSeen));
    return detected;
  }

  getDiagnostics() { return { ...this.diagnostics, pendingGroundConfirmation: this.pendingGround.size }; }

  /** Returns the already-loaded runway geometry without doing I/O. */
  getRunways(icao: string): readonly AirportRunway[] {
    return this.runwaysByAirport.get(icao.trim().toUpperCase()) ?? [];
  }

  private captureLanding(event: FlightIntelligenceEvent, aircraft: Aircraft, persistence: Promise<void>): void {
    const evidence = event.metadata?.terminalEvidence as LandingTerminalEvidenceV1 | undefined;
    this.diagnostics.landingEvents += 1;
    if (!evidence) return;
    this.diagnostics.landingEvidenceCaptured += 1;
    if (evidence.reportedArrivalRunway) this.diagnostics.reportedArrivalRunwayPresent += 1;
    if (aircraft.onGround) this.diagnostics.landingDetectedOnGround += 1;
    else {
      this.pendingGround.set(event.eventKey, { event, expiresAt: Date.parse(event.occurredAt) + PENDING_GROUND_TTL_MS });
      this.diagnostics.landingPendingGroundConfirmation += 1;
      while (this.pendingGround.size > MAX_PENDING_GROUND) this.pendingGround.delete(this.pendingGround.keys().next().value!);
    }
    void persistence.catch(() => { this.diagnostics.landingEvidencePersistFailures += 1; });
  }

  private expirePendingGround(now: number): void {
    for (const [key, pending] of this.pendingGround) if (pending.expiresAt < now) {
      this.pendingGround.delete(key);
      this.diagnostics.landingGroundConfirmationExpired += 1;
    }
  }

  private confirmPendingGround(aircraft: Aircraft, observedAt: number): void {
    if (!aircraft.onGround || !Number.isFinite(observedAt)) return;
    const activeLifecycleKey = this.detector.getLifecycleKey(aircraft.icaoHex);
    if (!activeLifecycleKey || aircraft.lat === null || aircraft.lon === null) return;
    const candidates: Array<[string, { event: FlightIntelligenceEvent; expiresAt: number }]> = [];
    for (const [key, pending] of this.pendingGround) {
      const event = pending.event;
      const evidence = event.metadata?.terminalEvidence as LandingTerminalEvidenceV1 | undefined;
      if (event.icaoHex.toUpperCase() !== aircraft.icaoHex.toUpperCase()) continue;
      if (event.lifecycleKey !== activeLifecycleKey) continue;
      if (event.callsign && aircraft.callsign && event.callsign !== aircraft.callsign) continue;
      const distance = event.latitude !== null && event.longitude !== null && aircraft.lat !== null && aircraft.lon !== null
        ? haversineDistanceKm(event.latitude, event.longitude, aircraft.lat, aircraft.lon) : Number.POSITIVE_INFINITY;
      if (!evidence || observedAt < Date.parse(event.occurredAt) || observedAt > pending.expiresAt || distance > MAX_GROUND_EVENT_DISTANCE_KM) continue;
      if (event.airportIcao) {
        const airport = this.airportsByIcao.get(event.airportIcao.toUpperCase());
        if (!airport || haversineDistanceKm(airport.latitude, airport.longitude, aircraft.lat, aircraft.lon) > MAX_GROUND_AIRPORT_DISTANCE_KM) continue;
      }
      candidates.push([key, pending]);
    }
    candidates.sort((left, right) => Date.parse(right[1].event.occurredAt) - Date.parse(left[1].event.occurredAt));
    const selected = candidates[0];
    if (selected) {
      const [key, pending] = selected;
      const event = pending.event;
      const evidence = event.metadata?.terminalEvidence as LandingTerminalEvidenceV1;
      const confirmation: LandingGroundObservation = { ...evidence.detection, ...this.groundObservation(aircraft, new Date(observedAt).toISOString()), onGround: true };
      evidence.groundConfirmation = confirmation;
      this.pendingGround.delete(key);
      this.diagnostics.landingGroundConfirmedLater += 1;
      void this.finalizeLanding(event, evidence);
    }
  }

  private groundObservation(aircraft: Aircraft, observedAt: string): LandingGroundObservation {
    return {
      observedAt, onGround: true, lat: aircraft.lat, lon: aircraft.lon, altitudeFt: aircraft.altitude,
      baroAltitudeFt: aircraft.baroAltitude, geomAltitudeFt: aircraft.geomAltitude, groundSpeedKt: aircraft.groundSpeed,
      trackDeg: aircraft.track, verticalRateFpm: aircraft.verticalRate, baroRateFpm: aircraft.baroRate, geomRateFpm: aircraft.geomRate,
      seenSeconds: aircraft.seenSeconds, seenPosSeconds: aircraft.seenPosSeconds, source: aircraft.source ?? null, origin: aircraft.origin ?? null,
    };
  }

  private async finalizeLanding(event: FlightIntelligenceEvent, evidence: LandingTerminalEvidenceV1): Promise<void> {
    try {
      await this.persistence.get(event.eventKey);
      const database = getPrisma();
      const table = database?.orm.public.FlightEvent as unknown as FlightEventTable | undefined;
      if (!table?.where) return;
      const row = table.where({ eventKey: event.eventKey });
      const current = row.first ? await row.first() : null;
      const currentMetadata = this.safeMetadata(current?.metadataJson);
      const currentEvidence = currentMetadata.terminalEvidence as LandingTerminalEvidenceV1 | undefined;
      if (currentEvidence?.groundConfirmation) return;
      if (!row.update) return;
      const bounded = fitTerminalEvidence(evidence);
      if (!bounded) { this.diagnostics.landingEvidencePersistFailures += 1; return; }
      await trackDbOperation("flight-intelligence.terminal-evidence.update", async () => await row.update!({ metadataJson: JSON.stringify({ ...currentMetadata, terminalEvidence: bounded }) }));
    } catch {
      this.diagnostics.landingEvidencePersistFailures += 1;
    }
  }

  cleanup(activeHexes: ReadonlySet<string>): void {
    this.detector.cleanup(activeHexes);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getRecent(query: IntelligenceQuery = {}): FlightIntelligenceEvent[] {
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const since = query.since ? Date.parse(query.since) : NaN;
    return this.events
      .filter((event) =>
        (!query.type || event.type === query.type)
        && (!query.aircraft || event.icaoHex === query.aircraft.toUpperCase())
        && (query.flightId === undefined || event.flightId === query.flightId)
        && (!Number.isFinite(since) || Date.parse(event.occurredAt) >= since))
      .slice(0, limit);
  }

  async query(query: IntelligenceQuery = {}): Promise<FlightIntelligenceEvent[]> {
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const memory = this.getRecent({ ...query, limit });
    const database = getPrisma();
    if (!database) return memory;

    try {
      const where: Record<string, unknown> = {};
      if (query.type) where.type = query.type;
      if (query.aircraft) where.icaoHex = query.aircraft.toUpperCase();
      if (query.flightId !== undefined) where.flightId = query.flightId;
      if (query.since && Number.isFinite(Date.parse(query.since))) where.occurredAt = { gte: new Date(query.since) };

      const table = (database.orm.public as unknown as { FlightEvent: FlightEventTable }).FlightEvent;
      const rows = await trackDbOperation("flight-intelligence.event.query", async () => await table
        .where(where)
        .orderBy((event: { occurredAt: { desc(): unknown } }) => event.occurredAt.desc())
        .include("aircraft", (aircraft) => aircraft.select("registration"))
        .include("flight", (flight) => flight.select("callsign", "registration"))
        .limit(limit)
        .all());

      const merged = new Map<string, FlightIntelligenceEvent>();
      for (const event of memory) merged.set(event.eventKey, event);
      // Prefer the durable row when persistence has already completed because
      // it may include linked Flight/aircraft relation data unavailable at detection time.
      for (const row of rows) {
        const event = this.fromRow(row);
        merged.set(event.eventKey, event);
      }
      return [...merged.values()]
        .sort((left, right) =>
          Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
          || Date.parse(right.detectedAt) - Date.parse(left.detectedAt)
          || right.eventKey.localeCompare(left.eventKey))
        .slice(0, limit);
    } catch {
      return memory;
    }
  }

  private async persist(event: FlightIntelligenceEvent): Promise<void> {
    const database = getPrisma();
    if (!database) return;
    try {
      const schema = database.orm.public as unknown as { FlightEvent: FlightEventTable; Flight: FlightTable; Aircraft: AircraftTable };
      const occurredAt = Date.parse(event.occurredAt);
      let linkedFlight: FlightRow | undefined;
      const aircraft = await trackDbOperation("flight-intelligence.aircraft-link.query", async () => await schema.Aircraft
        .where({ icaoHex: event.icaoHex })
        .first());
      for (let attempt = 0; attempt < 3 && !linkedFlight; attempt += 1) {
        const flights = aircraft
          ? await trackDbOperation("flight-intelligence.flight-link.query", async () => await schema.Flight
            .where({ aircraftId: aircraft.id })
            .orderBy((flight: { lastSeenAt: { desc(): unknown } }) => flight.lastSeenAt.desc())
            .limit(8)
            .all())
          : [];
        const hasTemporalRows = flights.some((flight) => flight.startTime !== undefined || flight.lastSeenAt !== undefined || flight.endTime !== undefined);
        linkedFlight = flights.find((flight) => {
          const start = typeof flight.startTime === "undefined" ? NaN : Date.parse(String(flight.startTime));
          const lastSeen = typeof flight.lastSeenAt === "undefined" ? NaN : Date.parse(String(flight.lastSeenAt));
          const end = flight.endTime == null
            ? (Number.isFinite(lastSeen) ? lastSeen + getFlightContinuityGapMs() : Number.POSITIVE_INFINITY)
            : Date.parse(String(flight.endTime));
          return !Number.isFinite(occurredAt) || (!Number.isFinite(start) && !Number.isFinite(end)) || (occurredAt >= start && occurredAt <= end);
        }) ?? (hasTemporalRows ? undefined : flights[0]);
        if (!linkedFlight && attempt < 2) await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
      }
      event.flightId = linkedFlight?.id ?? null;
      await trackDbOperation("flight-intelligence.event.create", async () => await schema.FlightEvent.create({
          eventKey: event.eventKey,
          type: event.type,
          icaoHex: event.icaoHex,
          flightId: linkedFlight?.id ?? null,
          // The Prisma contract uses the temporal PostgreSQL codec. Keep the
          // application write path on the same Temporal.Instant type used by
          // the rest of the persistence layer; JavaScript Date is not a
          // contract-compatible substitute here.
          occurredAt: Temporal.Instant.fromEpochMilliseconds(Date.parse(event.occurredAt)),
          detectedAt: Temporal.Instant.fromEpochMilliseconds(Date.parse(event.detectedAt)),
          latitude: event.latitude,
          longitude: event.longitude,
          altitude: event.altitude,
          confidence: event.confidence,
          airportIcao: event.airportIcao,
          runway: event.runway,
          sectorId: event.sectorId,
          evidenceJson: JSON.stringify(event.evidence),
          metadataJson: JSON.stringify({
            phase: event.phase,
            lifecycleKey: event.lifecycleKey,
            runwayContext: event.runwayContext ?? null,
            startedAt: event.startedAt ?? event.occurredAt,
            endedAt: event.endedAt ?? null,
            reasonCodes: event.reasonCodes ?? event.evidence,
            detectorVersion: event.detectorVersion ?? FLIGHT_INTELLIGENCE_DETECTOR_VERSION,
            ...(event.metadata ?? {}),
          }),
      }));
    } catch (error) {
      // Intelligence persistence is best effort.
      if (event.type === "LANDING") this.diagnostics.landingEvidencePersistFailures += 1;
      if (process.env.FLIGHT_INTELLIGENCE_DEBUG_PERSIST === "true") console.error("[flight-intelligence.persistence]", error);
    }
  }

  private fromRow(row: FlightEventRow): FlightIntelligenceEvent {
    const confidence = typeof row.confidence === "number" ? row.confidence : 0;
    const metadata = this.safeMetadata(row.metadataJson);
    return {
      id: String(row.id ?? row.eventKey),
      eventKey: row.eventKey,
      lifecycleKey: typeof metadata.lifecycleKey === "string" ? metadata.lifecycleKey : row.eventKey,
      type: row.type,
      phase: this.safePhase(metadata.phase),
      icaoHex: row.icaoHex,
      flightId: row.flightId ?? null,
      callsign: row.flight?.callsign ?? null,
      registration: row.flight?.registration ?? row.aircraft?.registration ?? null,
      occurredAt: new Date(row.occurredAt).toISOString(),
      detectedAt: new Date(row.detectedAt).toISOString(),
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      altitude: row.altitude ?? null,
      confidence,
      confidenceLevel: confidenceLevel(confidence),
      airportIcao: row.airportIcao ?? null,
      runway: row.runway ?? null,
      runwayContext: this.safeRunwayContext(metadata.runwayContext),
      sectorId: row.sectorId ?? null,
      evidence: this.safeEvidence(row.evidenceJson),
      startedAt: typeof metadata.startedAt === "string" ? metadata.startedAt : new Date(row.occurredAt).toISOString(),
      ...(typeof metadata.endedAt === "string" ? { endedAt: metadata.endedAt } : {}),
      reasonCodes: Array.isArray(metadata.reasonCodes)
        ? metadata.reasonCodes.filter((item): item is string => typeof item === "string").slice(0, 8)
        : this.safeEvidence(row.evidenceJson),
      metadata,
      detectorVersion: typeof metadata.detectorVersion === "string" ? metadata.detectorVersion : FLIGHT_INTELLIGENCE_DETECTOR_VERSION,
    };
  }

  private safeEvidence(value: unknown): string[] {
    try {
      const parsed = JSON.parse(String(value));
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string").slice(0, 8)
        : [];
    } catch {
      return [];
    }
  }

  private safeMetadata(value: unknown): Record<string, unknown> {
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }

  private safePhase(value: unknown): FlightPhase {
    const phases: FlightPhase[] = ["GROUND", "TAKEOFF", "CLIMB", "CRUISE", "DESCENT", "APPROACH", "FINAL", "GO_AROUND", "LANDED", "UNKNOWN", "LANDING"];
    return typeof value === "string" && phases.includes(value as FlightPhase) ? value as FlightPhase : "CRUISE";
  }

  private safeRunwayContext(value: unknown): RunwayContext | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const context = value as Partial<RunwayContext>;
    if (!["REPORTED", "INFERRED", "UNKNOWN"].includes(String(context.status))) return null;
    return {
      reportedRunway: typeof context.reportedRunway === "string" ? context.reportedRunway : null,
      inferredRunway: typeof context.inferredRunway === "string" ? context.inferredRunway : null,
      status: context.status as RunwayContext["status"],
      conflict: context.conflict === true,
      effectiveRunway: typeof context.effectiveRunway === "string" ? context.effectiveRunway : null,
      displayRunway: typeof context.displayRunway === "string" ? context.displayRunway : null,
      source: context.source,
      confidence: context.confidence ?? null,
    };
  }
}

const globalForIntelligence = globalThis as unknown as { flightIntelligence?: FlightIntelligenceService };

export function getFlightIntelligenceService(): FlightIntelligenceService {
  globalForIntelligence.flightIntelligence ??= new FlightIntelligenceService();
  return globalForIntelligence.flightIntelligence;
}
