import type { Aircraft } from "@/lib/aircraft/types";

export type AltitudeObservationSource =
  | "LOCAL_BEAST"
  | "READSB_JSON"
  | "NETWORK"
  | "MLAT"
  | "TIS_B"
  | "OTHER"
  | "UNKNOWN";

export type AltitudeProtocol = "ADSB" | "MODE_S" | "MLAT" | "TIS_B" | "NETWORK" | null;
export type AltitudeType = "BAROMETRIC" | "GNSS" | "UNKNOWN";

export type AltitudeDecisionReason =
  | "LOCAL_BEAST_FRESH_PRIORITY"
  | "READSB_JSON_FRESH_PRIORITY"
  | "NETWORK_FALLBACK"
  | "MLAT_FALLBACK"
  | "OTHER_FALLBACK"
  | "STALE_CANDIDATE_REJECTED"
  | "INVALID_VALUE_REJECTED"
  | "ALTITUDE_MISMATCH_REJECTED"
  | "IMPLAUSIBLE_JUMP_REJECTED"
  | "NO_VALID_SOURCE"
  | "NO_ALTERNATIVE";

export interface AltitudeObservation {
  valueFt: number | null;
  source: AltitudeObservationSource;
  provider: string | null;
  protocol: AltitudeProtocol;
  altitudeType: AltitudeType;
  df: number | null;
  typeCode: number | null;
  subtype: number | null;
  bds: string | null;
  observedAt: string;
  receivedAt: string | null;
  confidence: string | null;
  freshnessAgeMs: number | null;
}

export interface AltitudeDecision {
  selected: AltitudeObservation | null;
  candidates: AltitudeObservation[];
  reason: AltitudeDecisionReason;
  rejected: Array<{ source: AltitudeObservationSource; reason: AltitudeDecisionReason }>;
  anomaly: "DISAGREEMENT" | "IMPLAUSIBLE_JUMP" | null;
}

export interface AltitudeDiagnosticsSnapshot {
  counters: Record<string, number>;
  recentSourceSwitches: Array<{ icaoHex: string; oldSource: AltitudeObservationSource | null; newSource: AltitudeObservationSource; observedAt: string; reason: AltitudeDecisionReason }>;
  recentAnomalies: Array<{ icaoHex: string; observedAt: string; decision: AltitudeDecision }>;
  recentBeastDecodes: Array<{ icaoHex: string; observedAt: string; df: number | null; typeCode: number | null; valueFt: number | null; decision: AltitudeDecisionReason }>;
}

export const ALTITUDE_POLICY = Object.freeze({
  localFreshnessMs: 30_000,
  networkFreshnessMs: 30_000,
  disagreementFt: 12_000,
  maxVerticalRateFtPerMinute: 24_000,
  longGapMs: 5 * 60_000,
  minJumpIntervalMs: 2_000,
  maxSourceSwitches: 100,
  maxAnomalies: 100,
  maxBeastDecodes: 250,
});

const SOURCE_PRIORITY: Record<AltitudeObservationSource, number> = {
  LOCAL_BEAST: 0, READSB_JSON: 1, NETWORK: 2, MLAT: 3, TIS_B: 4, OTHER: 5, UNKNOWN: 6,
};

type AltitudeDiagnosticsStore = {
  counters: Record<string, number>;
  sourceByIcao: Map<string, AltitudeObservationSource>;
  previousByIcao: Map<string, AltitudeObservation>;
  recentSourceSwitches: AltitudeDiagnosticsSnapshot["recentSourceSwitches"];
  recentAnomalies: AltitudeDiagnosticsSnapshot["recentAnomalies"];
  recentBeastDecodes: AltitudeDiagnosticsSnapshot["recentBeastDecodes"];
  seenDecisions: Map<string, string>;
  anomalyLastAt: Map<string, number>;
  persistAnomalyLastAt: Map<string, number>;
};
const globalStore = globalThis as typeof globalThis & { __airRadarAltitudeDiagnostics?: AltitudeDiagnosticsStore };
const store: AltitudeDiagnosticsStore = globalStore.__airRadarAltitudeDiagnostics ??= {
  counters: {}, sourceByIcao: new Map(), previousByIcao: new Map(),
  recentSourceSwitches: [], recentAnomalies: [], recentBeastDecodes: [], seenDecisions: new Map(), anomalyLastAt: new Map(), persistAnomalyLastAt: new Map(),
};
const { counters, sourceByIcao, previousByIcao, recentSourceSwitches, recentAnomalies, recentBeastDecodes, seenDecisions } = store;

function bump(name: string): void { counters[name] = (counters[name] ?? 0) + 1; }
function validValue(value: number | null): value is number { return value !== null && Number.isFinite(value) && value >= 0; }
function sourceFor(aircraft: Aircraft, field: "altitude" | "baroAltitude" | "geomAltitude"): AltitudeObservationSource {
  if (aircraft.origin === "local" && /^df\d+$/i.test(aircraft.sourceType ?? "")) return "LOCAL_BEAST";
  const fieldSource = aircraft.provenance?.fields?.[field];
  if (fieldSource?.origin === "local" && fieldSource.protocol === "beast-mode-s") return "LOCAL_BEAST";
  if (fieldSource?.protocol === "readsb-json") return "READSB_JSON";
  if (fieldSource?.origin === "adsblol") {
    if (aircraft.source === "MLAT") return "MLAT";
    if (aircraft.source === "TIS-B") return "TIS_B";
    return "NETWORK";
  }
  if (aircraft.origin === "adsblol") return aircraft.source === "MLAT" ? "MLAT" : "NETWORK";
  return aircraft.origin === "local" ? "READSB_JSON" : "UNKNOWN";
}
function protocolFor(aircraft: Aircraft, field: "altitude" | "baroAltitude" | "geomAltitude"): AltitudeProtocol {
  const p = aircraft.provenance?.fields?.[field]?.protocol;
  if (p === "beast-mode-s") return aircraft.source === "MLAT" ? "MLAT" : "MODE_S";
  if (p === "readsb-json") return "NETWORK" === sourceFor(aircraft, field) ? "NETWORK" : "ADSB";
  if (aircraft.source === "MLAT") return "MLAT";
  if (aircraft.source === "TIS-B") return "TIS_B";
  return aircraft.origin === "adsblol" ? "NETWORK" : "ADSB";
}
function observation(aircraft: Aircraft | undefined, field: "altitude" | "baroAltitude" | "geomAltitude", now: number): AltitudeObservation | null {
  if (!aircraft) return null;
  const value = aircraft[field];
  const observedAt = aircraft.provenance?.fields?.[field]?.observedAt
    ?? (aircraft.observationTimes?.[field] ? new Date(aircraft.observationTimes[field]!).toISOString() : aircraft.lastSeen);
  const timestamp = Date.parse(observedAt);
  const source = sourceFor(aircraft, field);
  return {
    valueFt: typeof value === "number" ? value : null,
    source,
    provider: source === "NETWORK" || source === "MLAT" || source === "TIS_B" ? (aircraft.origin ?? null) : null,
    protocol: protocolFor(aircraft, field),
    altitudeType: field === "geomAltitude" ? "GNSS" : "BAROMETRIC",
    df: aircraft.provenance?.fields?.[field]?.df ?? (aircraft.sourceType?.match(/^df(\d+)$/)?.[1] ? Number(aircraft.sourceType.slice(2)) : null),
    typeCode: aircraft.provenance?.fields?.[field]?.tc ?? null,
    subtype: aircraft.provenance?.fields?.[field]?.subtype ?? null,
    bds: aircraft.provenance?.fields?.[field]?.bds ?? null,
    observedAt,
    receivedAt: aircraft.lastSeen,
    confidence: aircraft.provenance?.fields?.[field]?.confidence ?? null,
    freshnessAgeMs: Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : null,
  };
}

function effectiveFreshness(candidate: AltitudeObservation): number {
  return candidate.source === "NETWORK" || candidate.source === "MLAT" || candidate.source === "TIS_B"
    ? ALTITUDE_POLICY.networkFreshnessMs : ALTITUDE_POLICY.localFreshnessMs;
}
function decisionKey(icaoHex: string, decision: AltitudeDecision): string {
  return `${icaoHex}:${decision.selected?.source ?? "none"}:${decision.selected?.observedAt ?? "none"}:${decision.reason}:${decision.anomaly ?? ""}`;
}

export function selectAltitudeObservation(
  icaoHex: string,
  candidates: Array<AltitudeObservation | null>,
  now = Date.now(),
): AltitudeDecision {
  const all = candidates.filter((item): item is AltitudeObservation => item !== null);
  bump("altitudeCandidates");
  const valid = all.filter((item) => {
    if (!validValue(item.valueFt)) { bump("altitudeInvalidRejected"); return false; }
    if (item.freshnessAgeMs !== null && item.freshnessAgeMs > effectiveFreshness(item)) { bump("altitudeStaleRejected"); return false; }
    return true;
  });
  valid.sort((a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source] || (a.freshnessAgeMs ?? Infinity) - (b.freshnessAgeMs ?? Infinity));
  let selected = valid[0] ?? null;
  const previous = previousByIcao.get(icaoHex);
  const rejected: AltitudeDecision["rejected"] = [];
  let anomaly: AltitudeDecision["anomaly"] = null;
  if (selected) {
    for (const candidate of valid.slice(1)) {
      if (Math.abs(candidate.valueFt! - selected.valueFt!) > ALTITUDE_POLICY.disagreementFt) {
        anomaly = "DISAGREEMENT";
        rejected.push({ source: candidate.source, reason: "ALTITUDE_MISMATCH_REJECTED" });
        bump("altitudeMismatchRejected");
      }
    }
    // A sharp disagreement is not resolved by an absolute altitude ceiling.
    // When a raw Beast candidate is the only outlier above the operational
    // envelope, retain the corroborated lower candidate and preserve the
    // conflict in the forensic decision. The envelope is only a supporting
    // signal; high altitude alone never rejects a value.
    if (anomaly === "DISAGREEMENT" && selected.source === "LOCAL_BEAST" && selected.valueFt! > 80_000) {
      const corroborated = valid.find((candidate) => candidate !== selected && candidate.valueFt! <= 80_000);
      if (corroborated) {
        rejected.push({ source: selected.source, reason: "ALTITUDE_MISMATCH_REJECTED" });
        selected = corroborated;
        bump("altitudeMismatchRejected");
      }
    }
    if (previous && previous.valueFt !== null && previous.observedAt !== selected.observedAt && previous.source === selected.source) {
      const dt = Date.parse(selected.observedAt) - Date.parse(previous.observedAt);
      const minutes = dt > 0 ? dt / 60_000 : 0;
      const rate = minutes > 0 ? Math.abs(selected.valueFt! - previous.valueFt) / minutes : Infinity;
      if (dt >= ALTITUDE_POLICY.minJumpIntervalMs && dt < ALTITUDE_POLICY.longGapMs && rate > ALTITUDE_POLICY.maxVerticalRateFtPerMinute) {
        anomaly = "IMPLAUSIBLE_JUMP";
        bump("altitudeImplausibleJumpRejected");
        rejected.push({ source: selected.source, reason: "IMPLAUSIBLE_JUMP_REJECTED" });
      }
    }
  }
  const reason: AltitudeDecisionReason = anomaly === "IMPLAUSIBLE_JUMP"
    ? "IMPLAUSIBLE_JUMP_REJECTED"
    : selected === null ? (all.length ? "INVALID_VALUE_REJECTED" : "NO_VALID_SOURCE")
      : selected.source === "LOCAL_BEAST" ? "LOCAL_BEAST_FRESH_PRIORITY"
        : selected.source === "READSB_JSON" ? "READSB_JSON_FRESH_PRIORITY"
          : selected.source === "NETWORK" || selected.source === "MLAT" || selected.source === "TIS_B" ? "NETWORK_FALLBACK" : "OTHER_FALLBACK";
  const finalSelected = anomaly === "IMPLAUSIBLE_JUMP" ? previous ?? null : selected;
  const decision: AltitudeDecision = { selected: finalSelected, candidates: all.slice(0, 8), reason, rejected, anomaly };
  const key = decisionKey(icaoHex, decision);
  if (seenDecisions.get(icaoHex) !== key) {
    seenDecisions.set(icaoHex, key);
    if (finalSelected) {
      const old = sourceByIcao.get(icaoHex);
      if (old && old !== finalSelected.source) {
        bump("altitudeSourceSwitches");
        recentSourceSwitches.unshift({ icaoHex, oldSource: old, newSource: finalSelected.source, observedAt: finalSelected.observedAt, reason });
        recentSourceSwitches.splice(ALTITUDE_POLICY.maxSourceSwitches);
      }
      sourceByIcao.set(icaoHex, finalSelected.source);
      previousByIcao.set(icaoHex, finalSelected);
      bump(`altitudeSelected${finalSelected.source === "LOCAL_BEAST" ? "LocalBeast" : finalSelected.source === "READSB_JSON" ? "ReadsbJson" : finalSelected.source === "NETWORK" ? "Network" : finalSelected.source === "MLAT" ? "Mlat" : "Other"}`);
    }
    if (anomaly && shouldRecordAnomaly(icaoHex, anomaly, now)) {
      bump("altitudeAnomalies");
      recentAnomalies.unshift({ icaoHex, observedAt: new Date(now).toISOString(), decision });
      recentAnomalies.splice(ALTITUDE_POLICY.maxAnomalies);
    }
  }
  return decision;
}

export function altitudeObservationFor(aircraft: Aircraft | undefined, field: "altitude" | "baroAltitude" | "geomAltitude" = "altitude", now = Date.now()): AltitudeObservation | null {
  return observation(aircraft, field, now);
}
export function selectAircraftAltitude(icaoHex: string, local: Aircraft | undefined, network: Aircraft | undefined, now = Date.now()): AltitudeDecision {
  return selectAltitudeObservation(icaoHex, [observation(local, "altitude", now), observation(network, "altitude", now)] , now);
}
export function recordBeastAltitudeDecode(icaoHex: string, item: AltitudeObservation, decision: AltitudeDecision): void {
  if (item.source !== "LOCAL_BEAST") return;
  recentBeastDecodes.unshift({ icaoHex, observedAt: item.observedAt, df: item.df, typeCode: item.typeCode, valueFt: item.valueFt, decision: decision.reason });
  recentBeastDecodes.splice(ALTITUDE_POLICY.maxBeastDecodes);
}
export function getAltitudeDiagnostics(): AltitudeDiagnosticsSnapshot {
  return { counters: { ...counters }, recentSourceSwitches: recentSourceSwitches.slice(), recentAnomalies: recentAnomalies.slice(), recentBeastDecodes: recentBeastDecodes.slice() };
}
function shouldRecordAnomaly(icaoHex: string, anomaly: NonNullable<AltitudeDecision["anomaly"]>, now: number): boolean {
  const key = `${icaoHex}:${anomaly}`;
  const last = store.anomalyLastAt.get(key);
  if (last !== undefined && now - last < 30_000) return false;
  store.anomalyLastAt.set(key, now);
  return true;
}

export function shouldPersistAltitudeAnomaly(icaoHex: string, anomaly: NonNullable<AltitudeDecision["anomaly"]>, now = Date.now()): boolean {
  const key = `${icaoHex}:${anomaly}`;
  const last = store.persistAnomalyLastAt.get(key);
  if (last !== undefined && now - last < 30_000) return false;
  store.persistAnomalyLastAt.set(key, now);
  return true;
}

export function resetAltitudeDiagnosticsForTests(): void { for (const key of Object.keys(counters)) delete counters[key]; sourceByIcao.clear(); previousByIcao.clear(); recentSourceSwitches.length = 0; recentAnomalies.length = 0; recentBeastDecodes.length = 0; seenDecisions.clear(); store.anomalyLastAt.clear(); store.persistAnomalyLastAt.clear(); }
