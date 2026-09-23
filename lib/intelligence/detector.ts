import type { Aircraft } from "@/lib/aircraft/types";
import type { AirportRunway } from "@/lib/airports/infrastructure";
import { haversineDistanceKm } from "@/lib/geo";
import type { Airport } from "@/lib/airports/types";
import { SAMPLE_AIRPORTS } from "@/lib/server/airport-catalog";
import { resolveArrivalRunwayContext, resolveDepartureRunwayContext } from "@/lib/route-intelligence/runway-context";
import type { RunwayContext } from "@/lib/route-intelligence/contracts";
import type { FlightEventType, FlightIntelligenceEvent, FlightObservation, FlightPhase } from "@/lib/intelligence/types";
import { confidenceLevel } from "@/lib/intelligence/types";

const MAX_HISTORY = 120;
const MAX_EMITTED_KEYS = 200;
const MIN_HOLDING_MS = 3 * 60_000;
const HOLDING_WINDOW_MS = 5 * 60_000;
const AIRSPACE_DEBOUNCE_MS = 45_000;
const PHASE_CONFIRMATIONS = 2;
const AIRPORT_PROXIMITY_KM = 25;
const RUNWAY_PROXIMITY_KM = 8;

const EVIDENCE = {
  lowInitialAltitude: "intelligence.evidence.lowInitialAltitude",
  climbRateAndAltitude: "intelligence.evidence.climbRateAndAltitude",
  airportProximity: "intelligence.evidence.airportProximity",
  movingAway: "intelligence.evidence.movingAway",
  airborne: "intelligence.evidence.airborne",
  positiveVerticalRate: "intelligence.evidence.positiveVerticalRate",
  altitudeIncreased: "intelligence.evidence.altitudeIncreased",
  takeoffEstablished: "intelligence.evidence.takeoffEstablished",
  verticalRateSettled: "intelligence.evidence.verticalRateSettled",
  altitudeStable: "intelligence.evidence.altitudeStable",
  normalGroundspeed: "intelligence.evidence.normalGroundspeed",
  negativeVerticalRate: "intelligence.evidence.negativeVerticalRate",
  descentPersisted: "intelligence.evidence.descentPersisted",
  altitudeDecreased: "intelligence.evidence.altitudeDecreased",
  sustainedDescent: "intelligence.evidence.sustainedDescent",
  approachArea: "intelligence.evidence.approachArea",
  movedCloser: "intelligence.evidence.movedCloser",
  approachAltitude: "intelligence.evidence.approachAltitude",
  precedingObservation: "intelligence.evidence.precedingObservation",
  approachEstablished: "intelligence.evidence.approachEstablished",
  onGround: "intelligence.evidence.onGround",
  runwayProximity: "intelligence.evidence.runwayProximity",
  lowAltitude: "intelligence.evidence.lowAltitude",
  touchdownGroundspeed: "intelligence.evidence.touchdownGroundspeed",
  climbNearRunway: "intelligence.evidence.climbNearRunway",
  sustainedClimb: "intelligence.evidence.sustainedClimb",
  movedAwayAfterClosest: "intelligence.evidence.movedAwayAfterClosest",
  providerDiverted: "intelligence.evidence.providerDiverted",
  alternateApproach: "intelligence.evidence.alternateApproach",
  alternateProximity: "intelligence.evidence.alternateProximity",
  destinationDiffers: "intelligence.evidence.destinationDiffers",
  destinationAvailable: "intelligence.evidence.destinationAvailable",
  descentBeforeDestination: "intelligence.evidence.descentBeforeDestination",
  holdingDuration: "intelligence.evidence.holdingDuration",
  holdingArea: "intelligence.evidence.holdingArea",
  headingEvolution: "intelligence.evidence.headingEvolution",
  holdingAltitude: "intelligence.evidence.holdingAltitude",
  holdingAirborne: "intelligence.evidence.holdingAirborne",
  sectorMatched: "intelligence.evidence.sectorMatched",
  sectorStable: "intelligence.evidence.sectorStable",
  atcGeographicContext: "intelligence.evidence.atcGeographicContext",
  runwayResolved: "intelligence.evidence.runwayResolved",
} as const;

interface PendingPhase { phase: FlightPhase; count: number; }
interface TrackState {
  history: FlightObservation[];
  phase: FlightPhase;
  initialized: boolean;
  pendingPhase?: PendingPhase;
  airport: string | null;
  inside: string | null;
  pendingBoundary?: { sector: string; inside: boolean; at: number };
  emitted: Set<string>;
  flightLifecycle: string;
  lastCallsign: string | null;
  airspaceSequence: number;
  holdingCycle: number;
  holdingActive: boolean;
  holdingMisses: number;
  approachCycle: number;
  approachMinDistanceKm: number | null;
  approachEventPending: boolean;
}
interface Signal { active: boolean; weight: number; evidence: string; }
interface AirportMatch { airport: Airport; distanceKm: number; }
interface HoldingEvidence { signals: Signal[]; durationMs: number; maxRadiusKm: number; }

function finite(value: number | null | undefined): value is number { return typeof value === "number" && Number.isFinite(value); }
function signedAngularDifference(a: number, b: number): number { return ((b - a + 540) % 360) - 180; }
function observedAtOf(aircraft: Aircraft, fallback: number): number { const value = Date.parse(aircraft.lastSeen); return Number.isFinite(value) ? value : fallback; }

/** Scores are weighted observed signals, not hand-picked event confidences. */
function scoreSignals(signals: readonly Signal[]): { confidence: number; evidence: string[] } {
  const total = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const active = signals.reduce((sum, signal) => sum + (signal.active ? signal.weight : 0), 0);
  return { confidence: total > 0 ? Math.round((active / total) * 100) / 100 : 0, evidence: signals.filter((signal) => signal.active).map((signal) => signal.evidence) };
}

function altitudeDelta(history: FlightObservation[], count = 3): number | null {
  const values = history.slice(-count).map((item) => item.aircraft.altitude).filter(finite);
  return values.length >= 2 ? values.at(-1)! - values[0]! : null;
}

export class FlightIntelligenceDetector {
  private readonly tracks = new Map<string, TrackState>();
  private airports: readonly Airport[];
  private readonly runwaysByAirport = new Map<string, readonly AirportRunway[]>();

  constructor(airports: readonly Airport[] = SAMPLE_AIRPORTS, runwaysByAirport?: ReadonlyMap<string, readonly AirportRunway[]>) {
    this.airports = airports.slice(0, 100_000);
    if (runwaysByAirport) this.setRunways(runwaysByAirport);
  }
  setAirports(airports: readonly Airport[]): void { this.airports = airports.slice(0, 100_000); }
  setRunways(runwaysByAirport: ReadonlyMap<string, readonly AirportRunway[]>): void {
    this.runwaysByAirport.clear();
    for (const [icao, runways] of runwaysByAirport) {
      if (this.runwaysByAirport.size >= 100_000) break;
      this.runwaysByAirport.set(icao.toUpperCase(), runways.slice(0, 64));
    }
  }
  getPhase(icaoHex: string): FlightPhase | null { return this.tracks.get(icaoHex.toUpperCase())?.phase ?? null; }
  cleanup(activeHexes: ReadonlySet<string>): void { for (const hex of this.tracks.keys()) if (!activeHexes.has(hex)) this.tracks.delete(hex); }

  observe(previous: Aircraft | undefined, aircraft: Aircraft, observedAt = Date.parse(aircraft.lastSeen)): FlightIntelligenceEvent[] {
    void previous;
    if (aircraft.origin === "adsblol" || aircraft.lat === null || aircraft.lon === null) return [];
    const at = Number.isFinite(observedAt) ? observedAt : observedAtOf(aircraft, Date.now());
    const state = this.tracks.get(aircraft.icaoHex) ?? this.newState(at);
    if (state.history.length && at <= state.history.at(-1)!.observedAt) return [];
    if (state.lastCallsign && aircraft.callsign && state.lastCallsign !== aircraft.callsign) {
      state.flightLifecycle = `${at}:${aircraft.callsign}`;
      state.emitted.clear(); state.pendingPhase = undefined; state.approachCycle = 0; state.holdingCycle = 0; state.holdingActive = false; state.approachEventPending = false;
    }
    if (aircraft.callsign) state.lastCallsign = aircraft.callsign;
    state.history.push({ aircraft, observedAt: at });
    if (state.history.length > MAX_HISTORY) state.history.splice(0, state.history.length - MAX_HISTORY);

    const events: FlightIntelligenceEvent[] = [];
    const current = this.nearestAirport(aircraft);
    const prior = state.history.at(-2)?.aircraft;
    const priorMatch = prior ? this.nearestAirport(prior) : null;
    const airport = current?.airport ?? null;
    const distanceKm = current?.distanceKm ?? null;
    const priorDistanceKm = priorMatch && airport?.icaoCode === priorMatch.airport.icaoCode ? priorMatch.distanceKm : null;
    if (airport) {
      state.airport = airport.icaoCode;
      if (state.approachMinDistanceKm === null || distanceKm! < state.approachMinDistanceKm) state.approachMinDistanceKm = distanceKm;
    }
    if (!state.initialized) { state.phase = this.seedPhase(aircraft, distanceKm); state.initialized = true; }

    const runwayFor = (direction: "DEPARTURE" | "ARRIVAL"): RunwayContext | null => {
      if (!airport) return null;
      const positions = state.history.slice(-24).filter((item) => item.aircraft.lat !== null && item.aircraft.lon !== null).map((item) => ({ lat: item.aircraft.lat!, lon: item.aircraft.lon!, track: item.aircraft.track }));
      const input = {
        positions,
        airport: { latitude: airport.latitude, longitude: airport.longitude },
        runways: this.runwaysByAirport.get(airport.icaoCode.toUpperCase()) ?? [],
        flightPlan: aircraft.enrichment?.flightPlan ?? null,
        inferredConfidence: "MEDIUM" as const,
      };
      return direction === "DEPARTURE" ? resolveDepartureRunwayContext(input) : resolveArrivalRunwayContext(input);
    };
    const append = (event: FlightIntelligenceEvent | null): void => { if (event) events.push(event); };
    const takeoffSignals = this.takeoffSignals(aircraft, prior, distanceKm, priorDistanceKm);
    const approachSignals = this.approachSignals(state, aircraft, prior, distanceKm, priorDistanceKm);
    const landingSignals = this.landingSignals(aircraft, distanceKm, state.phase);
    const descentSignals = this.descentSignals(state, aircraft);
    const climbSignals = this.climbSignals(state, aircraft);
    const goAroundSignals = state.phase === "APPROACH" ? this.goAroundSignals(state, aircraft, prior, distanceKm, priorDistanceKm) : null;

    if (goAroundSignals) {
      const scored = scoreSignals(goAroundSignals);
      append(this.event("GO_AROUND", aircraft, state, airport?.icaoCode ?? null, "CLIMB", scored, runwayFor("ARRIVAL")));
      state.phase = "CLIMB"; state.pendingPhase = undefined; state.approachCycle += 1; state.approachMinDistanceKm = distanceKm; state.approachEventPending = false;
    } else {
      if (state.phase === "APPROACH" && state.approachEventPending) {
        const runwayContext = runwayFor("ARRIVAL");
        append(this.event("APPROACH", aircraft, state, airport?.icaoCode ?? null, "APPROACH", scoreSignals(approachSignals), runwayContext));
        const diversion = this.diversionSignals(aircraft, airport, distanceKm, state);
        if (diversion) append(this.event("DIVERSION", aircraft, state, airport?.icaoCode ?? null, "APPROACH", scoreSignals(diversion), runwayContext));
        state.approachEventPending = false;
      }
      if (state.phase === "GROUND" && takeoffSignals.every((signal) => signal.active || signal.weight < 2)) {
      if (this.transition(state, "TAKEOFF")) append(this.event("TAKEOFF", aircraft, state, airport?.icaoCode ?? null, "TAKEOFF", scoreSignals(takeoffSignals), runwayFor("DEPARTURE")));
      } else if (state.phase === "TAKEOFF" && climbSignals.some((signal) => signal.active)) {
      this.transition(state, "CLIMB");
      } else if (state.phase === "CLIMB" && this.cruiseSignals(state, aircraft).every((signal) => signal.active || signal.weight < 2)) {
      this.transition(state, "CRUISE");
      } else if ((state.phase === "CRUISE" || state.phase === "CLIMB") && descentSignals.filter((signal) => signal.active).length >= 2) {
      if (this.transition(state, "DESCENT")) {
        const destination = this.plannedDestination(aircraft);
        if (destination && this.reliableTopOfDescent(state, aircraft, destination)) {
          append(this.event("TOP_OF_DESCENT", aircraft, state, destination.icaoCode, "DESCENT", scoreSignals([...descentSignals, { active: true, weight: 2, evidence: EVIDENCE.destinationAvailable }, { active: true, weight: 2, evidence: EVIDENCE.descentBeforeDestination }]), null));
        }
      }
      } else if (state.phase === "DESCENT" && approachSignals.filter((signal) => signal.active).length >= 3 && this.transition(state, "APPROACH")) {
      state.approachMinDistanceKm = distanceKm;
      state.approachEventPending = true;
      } else if (state.phase === "APPROACH" && landingSignals.filter((signal) => signal.active).length >= 3 && this.transition(state, "LANDING", aircraft.onGround && distanceKm !== null && distanceKm <= 2)) {
      append(this.event("LANDING", aircraft, state, airport?.icaoCode ?? null, "LANDING", scoreSignals(landingSignals), runwayFor("ARRIVAL")));
      } else if (state.phase === "LANDING" && aircraft.onGround) {
        this.transition(state, "GROUND", true);
      }
    }

    const holding = this.detectHolding(state.history);
    if (holding && scoreSignals(holding.signals).confidence >= 0.9) {
      state.holdingMisses = 0;
      if (!state.holdingActive) {
        state.holdingActive = true; state.holdingCycle += 1;
        append(this.event("HOLDING", aircraft, state, null, state.phase, scoreSignals([...holding.signals, { active: holding.durationMs >= MIN_HOLDING_MS, weight: 2, evidence: EVIDENCE.holdingDuration }, { active: holding.maxRadiusKm <= 8, weight: 2, evidence: EVIDENCE.holdingArea }]), null, `holding-${state.holdingCycle}`));
      }
    } else if (state.holdingActive && ++state.holdingMisses >= 2) {
      state.holdingActive = false;
    }
    this.observeAirspace(state, aircraft, at, append);
    this.tracks.set(aircraft.icaoHex, state);
    return events;
  }

  private newState(lifecycle: number): TrackState {
    return { history: [], phase: "GROUND", initialized: false, airport: null, inside: null, emitted: new Set(), flightLifecycle: String(lifecycle), lastCallsign: null, airspaceSequence: 0, holdingCycle: 0, holdingActive: false, holdingMisses: 0, approachCycle: 0, approachMinDistanceKm: null, approachEventPending: false };
  }
  private seedPhase(aircraft: Aircraft, distanceKm: number | null): FlightPhase {
    if (aircraft.onGround || (distanceKm !== null && distanceKm <= RUNWAY_PROXIMITY_KM && (aircraft.altitude ?? 0) < 500)) return "GROUND";
    if ((aircraft.verticalRate ?? 0) > 300) return "CLIMB";
    if ((aircraft.verticalRate ?? 0) < -300) return "DESCENT";
    return "CRUISE";
  }
  private transition(state: TrackState, phase: FlightPhase, strong = false): boolean {
    if (state.phase === phase) { state.pendingPhase = undefined; return false; }
    if (state.pendingPhase?.phase !== phase) state.pendingPhase = { phase, count: 0 };
    state.pendingPhase.count += 1;
    if (strong || state.pendingPhase.count >= PHASE_CONFIRMATIONS) { state.phase = phase; state.pendingPhase = undefined; return true; }
    return false;
  }

  private takeoffSignals(aircraft: Aircraft, prior: Aircraft | undefined, distanceKm: number | null, priorDistanceKm: number | null): Signal[] {
    const lowInitialAltitude = (prior?.altitude ?? aircraft.altitude ?? 99999) <= 1_500;
    const priorGround = prior?.onGround === true || lowInitialAltitude;
    const climb = (aircraft.verticalRate ?? 0) >= 300 && (aircraft.altitude ?? 0) >= (prior?.altitude ?? 0) + 50;
    const movingAway = distanceKm !== null && priorDistanceKm !== null && distanceKm > priorDistanceKm + 0.15;
    return [{ active: priorGround, weight: 3, evidence: EVIDENCE.lowInitialAltitude }, { active: climb, weight: 3, evidence: EVIDENCE.climbRateAndAltitude }, { active: distanceKm !== null && distanceKm <= RUNWAY_PROXIMITY_KM, weight: 2, evidence: EVIDENCE.airportProximity }, { active: movingAway, weight: 2, evidence: EVIDENCE.movingAway }, { active: aircraft.onGround === false, weight: 1, evidence: EVIDENCE.airborne }];
  }
  private climbSignals(state: TrackState, aircraft: Aircraft): Signal[] {
    return [{ active: (aircraft.verticalRate ?? 0) > 250, weight: 2, evidence: EVIDENCE.positiveVerticalRate }, { active: (altitudeDelta(state.history) ?? 0) > 150, weight: 2, evidence: EVIDENCE.altitudeIncreased }, { active: state.phase === "TAKEOFF", weight: 1, evidence: EVIDENCE.takeoffEstablished }];
  }
  private cruiseSignals(state: TrackState, aircraft: Aircraft): Signal[] {
    const recentRates = state.history.slice(-3).map((item) => item.aircraft.verticalRate).filter(finite);
    const delta = altitudeDelta(state.history);
    return [{ active: recentRates.length >= 2 && recentRates.every((rate) => Math.abs(rate) < 250), weight: 2, evidence: EVIDENCE.verticalRateSettled }, { active: finite(aircraft.altitude) && (delta === null || Math.abs(delta) < 500), weight: 2, evidence: EVIDENCE.altitudeStable }, { active: (aircraft.groundSpeed ?? 0) > 120, weight: 1, evidence: EVIDENCE.normalGroundspeed }];
  }
  private descentSignals(state: TrackState, aircraft: Aircraft): Signal[] {
    const recent = state.history.slice(-4).map((item) => item.aircraft.verticalRate).filter(finite);
    return [{ active: (aircraft.verticalRate ?? 0) < -200, weight: 2, evidence: EVIDENCE.negativeVerticalRate }, { active: recent.length >= 2 && recent.filter((rate) => rate < -150).length >= 2, weight: 3, evidence: EVIDENCE.descentPersisted }, { active: (altitudeDelta(state.history, 4) ?? 0) < -250, weight: 2, evidence: EVIDENCE.altitudeDecreased }];
  }
  private approachSignals(state: TrackState, aircraft: Aircraft, prior: Aircraft | undefined, distanceKm: number | null, priorDistanceKm: number | null): Signal[] {
    const descent = this.descentSignals(state, aircraft);
    return [{ active: descent.filter((signal) => signal.active).length >= 2, weight: 3, evidence: EVIDENCE.sustainedDescent }, { active: distanceKm !== null && distanceKm <= AIRPORT_PROXIMITY_KM, weight: 2, evidence: EVIDENCE.approachArea }, { active: distanceKm !== null && priorDistanceKm !== null && distanceKm < priorDistanceKm - 0.1, weight: 2, evidence: EVIDENCE.movedCloser }, { active: finite(aircraft.altitude) && aircraft.altitude! < 7_000, weight: 1, evidence: EVIDENCE.approachAltitude }, { active: prior !== undefined, weight: 1, evidence: EVIDENCE.precedingObservation }];
  }
  private landingSignals(aircraft: Aircraft, distanceKm: number | null, phase: FlightPhase): Signal[] {
    return [{ active: phase === "APPROACH", weight: 3, evidence: EVIDENCE.approachEstablished }, { active: aircraft.onGround, weight: 4, evidence: EVIDENCE.onGround }, { active: distanceKm !== null && distanceKm <= 2, weight: 3, evidence: EVIDENCE.runwayProximity }, { active: (aircraft.altitude ?? 99999) < 1_500, weight: 1, evidence: EVIDENCE.lowAltitude }, { active: aircraft.groundSpeed === null || aircraft.groundSpeed <= 110, weight: 1, evidence: EVIDENCE.touchdownGroundspeed }];
  }
  private goAroundSignals(state: TrackState, aircraft: Aircraft, prior: Aircraft | undefined, distanceKm: number | null, priorDistanceKm: number | null): Signal[] | null {
    if (!prior || distanceKm === null || priorDistanceKm === null || distanceKm > RUNWAY_PROXIMITY_KM) return null;
    const minimum = state.approachMinDistanceKm ?? Math.min(distanceKm, priorDistanceKm);
    const climbing = (aircraft.verticalRate ?? 0) > 500 && (altitudeDelta(state.history, 3) ?? 0) > 150;
    const movingAway = distanceKm > minimum + 0.5 && distanceKm > priorDistanceKm + 0.15;
    if (!climbing || !movingAway) return null;
    return [{ active: true, weight: 3, evidence: EVIDENCE.approachEstablished }, { active: true, weight: 2, evidence: EVIDENCE.climbNearRunway }, { active: climbing, weight: 3, evidence: EVIDENCE.sustainedClimb }, { active: movingAway, weight: 3, evidence: EVIDENCE.movedAwayAfterClosest }];
  }
  private reliableTopOfDescent(state: TrackState, aircraft: Aircraft, destination: Airport): boolean {
    const distance = haversineDistanceKm(aircraft.lat!, aircraft.lon!, destination.latitude, destination.longitude);
    return distance > 20 && (aircraft.altitude ?? 0) >= 8_000 && this.descentSignals(state, aircraft).filter((signal) => signal.active).length >= 2;
  }
  private plannedDestination(aircraft: Aircraft): Airport | null {
    const route = aircraft.enrichment?.route;
    if (!route) return null;
    if (route.destinationAirport) return route.destinationAirport;
    const code = route.destination?.trim().toUpperCase();
    return code ? this.airports.find((airport) => airport.icaoCode.toUpperCase() === code || airport.iataCode?.toUpperCase() === code) ?? null : null;
  }
  private diversionSignals(aircraft: Aircraft, airport: Airport | null, distanceKm: number | null, state: TrackState): Signal[] | null {
    const destination = this.plannedDestination(aircraft);
    if (!destination || !airport || destination.icaoCode.toUpperCase() === airport.icaoCode.toUpperCase() || distanceKm === null || distanceKm > RUNWAY_PROXIMITY_KM) return null;
    const providerDiverted = aircraft.enrichment?.flightPlan?.flightAware?.diverted === true;
    return [{ active: providerDiverted, weight: 4, evidence: EVIDENCE.providerDiverted }, { active: state.phase === "APPROACH", weight: 3, evidence: EVIDENCE.alternateApproach }, { active: distanceKm <= RUNWAY_PROXIMITY_KM, weight: 2, evidence: EVIDENCE.alternateProximity }, { active: true, weight: 2, evidence: EVIDENCE.destinationDiffers }];
  }

  private detectHolding(history: FlightObservation[]): HoldingEvidence | null {
    if (history.length < 8) return null;
    const last = history.at(-1)!;
    const recent = history.filter((item) => last.observedAt - item.observedAt <= HOLDING_WINDOW_MS);
    const first = recent[0];
    if (!first || recent.length < 8) return null;
    const durationMs = last.observedAt - first.observedAt;
    const points = recent.map((item) => item.aircraft).filter((item) => item.lat !== null && item.lon !== null);
    if (points.length < 8) return null;
    const center = { lat: points.reduce((sum, item) => sum + item.lat!, 0) / points.length, lon: points.reduce((sum, item) => sum + item.lon!, 0) / points.length };
    const maxRadiusKm = Math.max(...points.map((item) => haversineDistanceKm(center.lat, center.lon, item.lat!, item.lon!)));
    const altitudeValues = recent.map((item) => item.aircraft.altitude).filter(finite);
    const altitudeRange = altitudeValues.length >= 6 ? Math.max(...altitudeValues) - Math.min(...altitudeValues) : Number.POSITIVE_INFINITY;
    const tracks = recent.map((item) => item.aircraft.track).filter(finite);
    const turns: number[] = [];
    for (let index = 1; index < tracks.length; index += 1) turns.push(signedAngularDifference(tracks[index - 1]!, tracks[index]!));
    const meaningfulTurns = turns.filter((turn) => Math.abs(turn) >= 20);
    const cumulativeTurn = meaningfulTurns.reduce((sum, turn) => sum + Math.abs(turn), 0);
    const sectors = new Set(tracks.map((track) => Math.floor(track / 45)));
    const meanAltitudeStep = altitudeValues.length > 1 ? altitudeValues.slice(1).reduce((sum, value, index) => sum + Math.abs(value - altitudeValues[index]!), 0) / (altitudeValues.length - 1) : Number.POSITIVE_INFINITY;
    return { durationMs, maxRadiusKm, signals: [{ active: durationMs >= MIN_HOLDING_MS, weight: 3, evidence: EVIDENCE.holdingDuration }, { active: maxRadiusKm <= 8, weight: 3, evidence: EVIDENCE.holdingArea }, { active: cumulativeTurn >= 300 && meaningfulTurns.length >= 5 && sectors.size >= 4, weight: 3, evidence: EVIDENCE.headingEvolution }, { active: altitudeRange <= 900 && meanAltitudeStep <= 350, weight: 2, evidence: EVIDENCE.holdingAltitude }, { active: recent.every((item) => item.aircraft.onGround === false), weight: 1, evidence: EVIDENCE.holdingAirborne }] };
  }
  private nearestAirport(aircraft: Aircraft): AirportMatch | null {
    if (aircraft.lat === null || aircraft.lon === null) return null;
    let best: AirportMatch | null = null;
    for (const airport of this.airports) {
      const distanceKm = haversineDistanceKm(aircraft.lat, aircraft.lon, airport.latitude, airport.longitude);
      if (!best || distanceKm < best.distanceKm) best = { airport, distanceKm };
    }
    return best;
  }

  private event(type: FlightEventType, aircraft: Aircraft, state: TrackState, airportIcao: string | null, phase: FlightPhase, scored: { confidence: number; evidence: string[] }, runwayContext: RunwayContext | null, semanticSuffix = "", sectorId: string | null = null): FlightIntelligenceEvent | null {
    const runway = runwayContext && !runwayContext.conflict && runwayContext.effectiveRunway && (runwayContext.confidence === "HIGH" || runwayContext.confidence === "MEDIUM") ? runwayContext.effectiveRunway : null;
    const lifecycleKey = `${aircraft.icaoHex}:${state.flightLifecycle}`;
    const eventKey = [lifecycleKey, type, airportIcao ?? sectorId ?? "GLOBAL", semanticSuffix || state.approachCycle || "0"].join(":");
    if (state.emitted.has(eventKey)) return null;
    state.emitted.add(eventKey); while (state.emitted.size > MAX_EMITTED_KEYS) state.emitted.delete(state.emitted.values().next().value!);
    return { id: eventKey, eventKey, lifecycleKey, type, phase, icaoHex: aircraft.icaoHex, flightId: null, callsign: aircraft.callsign, registration: aircraft.registration, occurredAt: aircraft.lastSeen || new Date().toISOString(), detectedAt: new Date().toISOString(), latitude: aircraft.lat, longitude: aircraft.lon, altitude: aircraft.altitude, confidence: scored.confidence, confidenceLevel: confidenceLevel(scored.confidence), airportIcao, runway, runwayContext, sectorId, evidence: [...scored.evidence, ...(runway ? [EVIDENCE.runwayResolved] : [])].slice(0, 8) };
  }

  private observeAirspace(state: TrackState, aircraft: Aircraft, observedAt: number, append: (event: FlightIntelligenceEvent | null) => void): void {
    const sector = aircraft.atc?.sectorId ?? null;
    if (sector === state.inside) { state.pendingBoundary = undefined; return; }
    const isEntry = sector !== null;
    const boundary = state.pendingBoundary;
    const key = sector ?? state.inside ?? "";
    if (!boundary || boundary.sector !== key || boundary.inside !== isEntry) state.pendingBoundary = { sector: key, inside: isEntry, at: observedAt };
    const pending = state.pendingBoundary;
    if (!pending || pending.inside !== isEntry || observedAt - pending.at < AIRSPACE_DEBOUNCE_MS || (isEntry && pending.sector !== sector)) return;
    const scored = scoreSignals([{ active: true, weight: 3, evidence: EVIDENCE.sectorMatched }, { active: true, weight: 2, evidence: EVIDENCE.sectorStable }, { active: isEntry ? sector !== null : state.inside !== null, weight: 1, evidence: EVIDENCE.atcGeographicContext }]);
    state.airspaceSequence += 1;
    append(this.event(isEntry ? "AIRSPACE_ENTRY" : "AIRSPACE_EXIT", aircraft, state, null, state.phase, scored, null, `airspace-${state.airspaceSequence}`, sector));
    state.inside = sector; state.pendingBoundary = undefined;
  }
}
