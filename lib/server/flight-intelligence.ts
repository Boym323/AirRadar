import type { Aircraft } from "@/lib/aircraft/types";
import { getPrisma } from "@/lib/server/db";
import { FlightIntelligenceDetector } from "@/lib/intelligence/detector";
import type { FlightIntelligenceEvent, FlightEventType } from "@/lib/intelligence/types";

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

interface FlightTable {
  where(filter: Record<string, unknown>): {
    orderBy(order: Record<string, string>): {
      limit(value: number): { all(): Promise<Array<{ id: number }> };
    };
  };
}

interface AirportTable {
  all(): Promise<Array<{
    icao: string;
    iata: string | null;
    name: string;
    city: string | null;
    country: string | null;
    latitude: number;
    longitude: number;
  }>>;
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
        this.detector.setAirports(rows
          .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude))
          .map((row) => ({
            icaoCode: row.icao,
            iataCode: row.iata,
            name: row.name,
            city: row.city,
            country: row.country,
            latitude: row.latitude,
            longitude: row.longitude,
          })));
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
    for (const event of this.detector.observe(previous, aircraft, observedAt)) {
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
        && (!query.flightId || false)
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
      const flights = await schema.Flight
        .where({ aircraft: { icaoHex: event.icaoHex } })
        .orderBy({ lastSeenAt: "desc" })
        .limit(1)
        .all();
      await schema.FlightEvent.create({
        data: {
          eventKey: event.eventKey,
          type: event.type,
          icaoHex: event.icaoHex,
          flightId: flights[0]?.id ?? null,
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
        },
      });
    } catch {
      // Intelligence persistence is best effort.
    }
  }

  private fromRow(row: FlightEventRow): FlightIntelligenceEvent {
    const confidence = typeof row.confidence === "number" ? row.confidence : 0;
    return {
      id: String(row.id ?? row.eventKey),
      eventKey: row.eventKey,
      type: row.type,
      icaoHex: row.icaoHex,
      callsign: row.flight?.callsign ?? null,
      registration: row.flight?.registration ?? row.aircraft?.registration ?? null,
      occurredAt: new Date(row.occurredAt).toISOString(),
      detectedAt: new Date(row.detectedAt).toISOString(),
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      altitude: row.altitude ?? null,
      confidence,
      confidenceLevel: confidence >= .8 ? "high" : confidence >= .6 ? "medium" : "low",
      airportIcao: row.airportIcao ?? null,
      runway: row.runway ?? null,
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
}

const globalForIntelligence = globalThis as unknown as { flightIntelligence?: FlightIntelligenceService };

export function getFlightIntelligenceService(): FlightIntelligenceService {
  globalForIntelligence.flightIntelligence ??= new FlightIntelligenceService();
  return globalForIntelligence.flightIntelligence;
}
