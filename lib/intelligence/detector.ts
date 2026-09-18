import type { Aircraft } from "@/lib/aircraft/types";
import { haversineDistanceKm } from "@/lib/geo";
import type { Airport } from "@/lib/airports/types";
import { SAMPLE_AIRPORTS } from "@/lib/server/airport-catalog";
import type { FlightEventType, FlightIntelligenceEvent, FlightObservation } from "@/lib/intelligence/types";
import { confidenceLevel } from "@/lib/intelligence/types";

const MAX_HISTORY = 120;
const MIN_HOLDING_MS = 3 * 60_000;
const HOLDING_WINDOW_MS = 5 * 60_000;
const AIRSPACE_DEBOUNCE_MS = 45_000;

interface TrackState { history: FlightObservation[]; phase: "NONE" | "APPROACH" | "TAKEOFF"; airport: string | null; inside: string | null; pendingBoundary?: { sector: string; inside: boolean; at: number }; emitted: Set<string>; lastHoldingAt: number; }

export class FlightIntelligenceDetector {
  private readonly tracks = new Map<string, TrackState>();
  constructor(private airports: readonly Airport[] = SAMPLE_AIRPORTS) {}
  setAirports(airports: readonly Airport[]): void { this.airports = airports.slice(0, 100_000); }
  cleanup(activeHexes: ReadonlySet<string>): void { for (const hex of this.tracks.keys()) if (!activeHexes.has(hex)) this.tracks.delete(hex); }
  observe(previous: Aircraft | undefined, aircraft: Aircraft, observedAt = Date.parse(aircraft.lastSeen)): FlightIntelligenceEvent[] {
    if (aircraft.origin === "adsblol" || aircraft.lat === null || aircraft.lon === null) return [];
    const state = this.tracks.get(aircraft.icaoHex) ?? { history: [], phase: "NONE", airport: null, inside: null, emitted: new Set(), lastHoldingAt: 0 };
    const prior = state.history.at(-1)?.aircraft;
    state.history.push({ aircraft, observedAt: Number.isFinite(observedAt) ? observedAt : Date.now() });
    if (state.history.length > MAX_HISTORY) state.history.splice(0, state.history.length - MAX_HISTORY);
    const events: FlightIntelligenceEvent[] = [];
    const airport = this.nearestAirport(aircraft);
    const distance = airport ? haversineDistanceKm(aircraft.lat, aircraft.lon, airport.latitude, airport.longitude) : null;
    const priorDistance = prior && prior.lat !== null && prior.lon !== null && airport ? haversineDistanceKm(prior.lat, prior.lon, airport.latitude, airport.longitude) : null;
    if (airport && distance !== null && distance < 25 && aircraft.altitude !== null && aircraft.altitude < 7000) {
      const descending = aircraft.verticalRate !== null && aircraft.verticalRate < -200;
      if (descending && priorDistance !== null && distance < priorDistance) state.phase = "APPROACH";
      if (state.phase === "APPROACH" && aircraft.verticalRate !== null && aircraft.verticalRate > 700 && distance < 8 && priorDistance !== null && distance > priorDistance) {
        events.push(this.event("GO_AROUND", aircraft, airport.icaoCode, 0.86, ["sustained descent toward airport", `minimum distance ${Math.round(Math.min(...state.history.map((item) => this.distance(item.aircraft, airport)) as number[]) * 10) / 10} km`, "vertical rate changed to climb", "distance increased after closest approach"], state));
        state.phase = "NONE";
      } else if (state.phase === "APPROACH" && distance < 2 && aircraft.onGround) {
        events.push(this.event("LANDING", aircraft, airport.icaoCode, 0.8, ["approach sequence", "very close to airport", "aircraft reported on ground"], state));
        state.phase = "NONE";
      } else if (state.phase === "NONE" && priorDistance !== null && descending && distance < 25) {
        state.phase = "APPROACH";
        events.push(this.event("APPROACH", aircraft, airport.icaoCode, 0.68, ["descending", `distance ${distance.toFixed(1)} km`, "low-altitude airport proximity"], state));
      }
    }
    if (airport && state.phase === "NONE" && prior && aircraft.onGround === false && aircraft.verticalRate !== null && aircraft.verticalRate > 500 && (prior.onGround || (prior.altitude ?? 99999) < 1200) && distance !== null && distance < 8) {
      events.push(this.event("TAKEOFF", aircraft, airport.icaoCode, 0.78, ["low initial altitude near airport", "vertical rate changed to climb", "aircraft is moving away from airport"], state));
      state.phase = "TAKEOFF";
    }
    const holding = this.detectHolding(state.history);
    if (holding && state.lastHoldingAt + 10 * 60_000 < observedAt) { state.lastHoldingAt = observedAt; events.push(this.event("HOLDING", aircraft, null, 0.82, holding, state)); }
    const sector = aircraft.atc?.sectorId ?? null;
    if (sector === state.inside) state.pendingBoundary = undefined;
    if (sector !== state.inside) {
      const isEntry = sector !== null;
      const boundary = state.pendingBoundary;
      if (!boundary || boundary.sector !== (sector ?? state.inside ?? "") || boundary.inside !== isEntry || observedAt - boundary.at >= AIRSPACE_DEBOUNCE_MS) {
        state.pendingBoundary = { sector: sector ?? state.inside ?? "", inside: isEntry, at: observedAt };
      }
      if (boundary && boundary.inside === isEntry && observedAt - boundary.at >= AIRSPACE_DEBOUNCE_MS && (!isEntry || boundary.sector === sector)) {
        events.push(this.event(isEntry ? "AIRSPACE_ENTRY" : "AIRSPACE_EXIT", aircraft, null, 0.74, [isEntry ? "position matched sector polygon and altitude limits" : "position left matched sector polygon", "ATC assignment is geographic context only"], state, sector));
        state.inside = sector;
        state.pendingBoundary = undefined;
      }
    }
    this.tracks.set(aircraft.icaoHex, state);
    return events;
  }
  private detectHolding(history: FlightObservation[]): string[] | null {
    if (history.length < 8) return null;
    const last = history.at(-1)!;
    const recent = history.filter((item) => last.observedAt - item.observedAt <= HOLDING_WINDOW_MS).slice(-MAX_HISTORY);
    const first = recent[0];
    if (!first) return null;
    if (last.observedAt - first.observedAt < MIN_HOLDING_MS || first.aircraft.altitude === null || last.aircraft.altitude === null) return null;
    if (Math.abs(last.aircraft.altitude - first.aircraft.altitude) > 1200) return null;
    const points = recent.map((item) => item.aircraft).filter((item) => item.lat !== null && item.lon !== null);
    if (points.length < 8) return null;
    const center = points[0]; const maxDistance = Math.max(...points.map((item) => haversineDistanceKm(center.lat!, center.lon!, item.lat!, item.lon!)));
    const turns = recent.slice(1).filter((item, index) => { const a = recent[index].aircraft.track; const b = item.aircraft.track; return a !== null && b !== null && Math.abs(((b - a + 540) % 360) - 180) > 35; }).length;
    return maxDistance < 12 && turns >= 4 ? ["repeated track changes", "aircraft remained in a limited area", "stable approximate altitude", "observation lasted several minutes"] : null;
  }
  private nearestAirport(aircraft: Aircraft) { return this.airports.map((airport) => ({ airport, distance: haversineDistanceKm(aircraft.lat!, aircraft.lon!, airport.latitude, airport.longitude) })).sort((a, b) => a.distance - b.distance)[0]?.airport ?? null; }
  private distance(aircraft: Aircraft, airport: { latitude: number; longitude: number }) { return aircraft.lat === null || aircraft.lon === null ? 999 : haversineDistanceKm(aircraft.lat, aircraft.lon, airport.latitude, airport.longitude); }
  private event(type: FlightEventType, aircraft: Aircraft, airportIcao: string | null, confidence: number, evidence: string[], state: TrackState, sectorId: string | null = null): FlightIntelligenceEvent {
    const occurredAt = aircraft.lastSeen; const eventKey = `${type}:${aircraft.icaoHex}:${airportIcao ?? sectorId ?? ""}:${Math.floor(Date.parse(occurredAt) / 60000)}`;
    if (state.emitted.has(eventKey)) return { id: eventKey, eventKey, type, icaoHex: aircraft.icaoHex, callsign: aircraft.callsign, registration: aircraft.registration, occurredAt, detectedAt: new Date().toISOString(), latitude: aircraft.lat, longitude: aircraft.lon, altitude: aircraft.altitude, confidence: 0, confidenceLevel: "low", airportIcao, runway: null, sectorId, evidence: [] };
    state.emitted.add(eventKey); if (state.emitted.size > 100) state.emitted.delete(state.emitted.values().next().value!);
    return { id: eventKey, eventKey, type, icaoHex: aircraft.icaoHex, callsign: aircraft.callsign, registration: aircraft.registration, occurredAt, detectedAt: new Date().toISOString(), latitude: aircraft.lat, longitude: aircraft.lon, altitude: aircraft.altitude, confidence, confidenceLevel: confidenceLevel(confidence), airportIcao, runway: null, sectorId, evidence };
  }
}
