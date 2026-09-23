import type { Aircraft } from "@/lib/aircraft/types";
import type { AirportRunway } from "@/lib/airports/infrastructure";
import { getFlightContinuityGapMs } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import { FlightIntelligenceDetector } from "@/lib/intelligence/detector";
import { confidenceLevel, type FlightIntelligenceEvent, type FlightEventType, type FlightPhase } from "@/lib/intelligence/types";
import type { RunwayContext } from "@/lib/route-intelligence/contracts";

const MAX_EVENTS = 500;
const AIRPORT_INDEX_RETRY_MS = 60_000;

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
  orderBy(order: Record<string, string>): FlightEventQuery;
  limit(value: number): FlightEventQuery;
  include(relation: string, callback: (query: RelationQuery) => RelationQuery): FlightEventQuery;
  all(): Promise<FlightEventRow[]>;
}

interface FlightEventTable extends FlightEventQuery {
  create(input: { data: Record<string, unknown> }): Promise<unknown>;
}

interface FlightRow {
  id: number;
  startTime?: Date | string;
  lastSeenAt?: Date | string;
  endTime?: Date | string | null;
}

interface FlightQuery {
  where(filter: Record<string, unknown>): FlightQuery;
  orderBy(order: Record<string, string>): FlightQuery;
  limit(value: number): FlightQuery;
  all(): Promise<FlightRow[]>;
}

interface FlightTable {
  where(filter: Record<string, unknown>): FlightQuery;
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
        const rows = await table.all();
        const runwayTable = (database!.orm.public as unknown as { AirportRunway?: AirportRunwayTable }).AirportRunway;
        const runwayResult = runwayTable && typeof runwayTable.all === "function"
          ? await Promise.allSettled([runwayTable.all()])
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

  observe(previous: Aircraft | undefined, aircraft: Aircraft, observedAt?: number): void {
    void this.ensureAirportIndex();
    let detected: FlightIntelligenceEvent[];
    try {
      detected = this.detector.observe(previous, aircraft, observedAt);
    } catch {
      // Intelligence is optional enrichment. A malformed observation must not
      // reject the live snapshot or stop the single state owner.
      return;
    }
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
      void this.persist(event);
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
    const memory = this.getRecent(query);
    const database = getPrisma();
    if (!database) return memory;

    try {
      const where: Record<string, unknown> = {};
      if (query.type) where.type = query.type;
      if (query.aircraft) where.icaoHex = query.aircraft.toUpperCase();
      if (query.flightId) where.flightId = query.flightId;
      if (query.since && Number.isFinite(Date.parse(query.since))) where.occurredAt = { gte: new Date(query.since) };

      const table = (database.orm.public as unknown as { FlightEvent: FlightEventTable }).FlightEvent;
      const rows = await table
        .where(where)
        .orderBy({ occurredAt: "desc" })
        .include("aircraft", (aircraft) => aircraft.select("registration"))
        .include("flight", (flight) => flight.select("callsign", "registration"))
        .limit(Math.min(100, Math.max(1, query.limit ?? 25)))
        .all();

      return rows.map((row) => this.fromRow(row));
    } catch {
      return memory;
    }
  }

  private async persist(event: FlightIntelligenceEvent): Promise<void> {
    const database = getPrisma();
    if (!database) return;
    try {
      const schema = database.orm.public as unknown as { FlightEvent: FlightEventTable; Flight: FlightTable };
      const occurredAt = Date.parse(event.occurredAt);
      let linkedFlight: FlightRow | undefined;
      for (let attempt = 0; attempt < 3 && !linkedFlight; attempt += 1) {
        const flights = await schema.Flight
          .where({ aircraft: { icaoHex: event.icaoHex } })
          .orderBy({ lastSeenAt: "desc" })
          .limit(8)
          .all();
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
      await schema.FlightEvent.create({
        data: {
          eventKey: event.eventKey,
          type: event.type,
          icaoHex: event.icaoHex,
          flightId: linkedFlight?.id ?? null,
          occurredAt: new Date(event.occurredAt),
          detectedAt: new Date(event.detectedAt),
          latitude: event.latitude,
          longitude: event.longitude,
          altitude: event.altitude,
          confidence: event.confidence,
          airportIcao: event.airportIcao,
          runway: event.runway,
          sectorId: event.sectorId,
          evidenceJson: JSON.stringify(event.evidence),
          metadataJson: JSON.stringify({ phase: event.phase, lifecycleKey: event.lifecycleKey, runwayContext: event.runwayContext ?? null }),
        },
      });
    } catch {
      // Intelligence persistence is best effort.
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
    const phases: FlightPhase[] = ["GROUND", "TAKEOFF", "CLIMB", "CRUISE", "DESCENT", "APPROACH", "LANDING"];
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
