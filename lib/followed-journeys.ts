export const FOLLOWED_JOURNEYS_STORAGE_KEY = "airradar.followed-journeys.v1";
export const FOLLOWED_JOURNEYS_MAX = 24;

export type FollowedJourneyIdentity = "DURABLE" | "PROVISIONAL";
export type FollowedJourneyStatus = "ACTIVE" | "COMPLETED";

export interface FollowedJourney {
  key: string;
  identity: FollowedJourneyIdentity;
  flightId: number | null;
  lifecycleKey: string | null;
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  origin: string | null;
  destination: string | null;
  followedAt: string;
  status: FollowedJourneyStatus;
  completedAt: string | null;
}

export interface FollowedJourneysState {
  version: 1;
  journeys: FollowedJourney[];
}

interface IntelligenceIdentity {
  flightId: number | null;
  lifecycleKey: string;
  occurredAt: string;
  type: string;
}

function clean(value: unknown, max = 80): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result ? result.slice(0, max) : null;
}

function iso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function normalizeJourney(value: unknown): FollowedJourney | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const key = clean(row.key, 180);
  const icaoHex = clean(row.icaoHex, 16)?.toUpperCase() ?? null;
  const followedAt = iso(row.followedAt);
  if (!key || !icaoHex || !followedAt) return null;
  const identity = row.identity === "DURABLE" ? "DURABLE" : "PROVISIONAL";
  const status = row.status === "COMPLETED" ? "COMPLETED" : "ACTIVE";
  const completedAt = iso(row.completedAt);
  return {
    key,
    identity,
    flightId: typeof row.flightId === "number" && Number.isInteger(row.flightId) && row.flightId > 0 ? row.flightId : null,
    lifecycleKey: clean(row.lifecycleKey, 180),
    icaoHex,
    callsign: clean(row.callsign),
    registration: clean(row.registration),
    origin: clean(row.origin, 8),
    destination: clean(row.destination, 8),
    followedAt,
    status,
    completedAt: status === "COMPLETED" ? completedAt : null,
  };
}

export function parseFollowedJourneys(raw: string | null): FollowedJourneysState {
  if (!raw) return { version: 1, journeys: [] };
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; journeys?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.journeys)) return { version: 1, journeys: [] };
    return {
      version: 1,
      journeys: parsed.journeys
        .map(normalizeJourney)
        .filter((item): item is FollowedJourney => item !== null)
        .sort((a, b) => Date.parse(b.followedAt) - Date.parse(a.followedAt))
        .slice(0, FOLLOWED_JOURNEYS_MAX),
    };
  } catch {
    return { version: 1, journeys: [] };
  }
}

export function serializeFollowedJourneys(state: FollowedJourneysState): string {
  return JSON.stringify({ version: 1, journeys: state.journeys.slice(0, FOLLOWED_JOURNEYS_MAX) });
}

function provisionalKey(input: {
  icaoHex: string;
  callsign?: string | null;
  origin?: string | null;
  destination?: string | null;
  at: string;
}): string {
  const day = input.at.slice(0, 10);
  return ["provisional", input.icaoHex.toUpperCase(), clean(input.callsign) ?? "-", clean(input.origin, 8) ?? "-", clean(input.destination, 8) ?? "-", day].join(":");
}

export function resolveFollowedJourney(input: {
  icaoHex: string;
  callsign?: string | null;
  registration?: string | null;
  origin?: string | null;
  destination?: string | null;
  followedAt?: string;
  events?: readonly IntelligenceIdentity[];
}): FollowedJourney {
  const followedAt = iso(input.followedAt ?? new Date().toISOString()) ?? new Date().toISOString();
  const durable = [...(input.events ?? [])]
    .filter((event) => event.lifecycleKey && Number.isFinite(Date.parse(event.occurredAt)))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0] ?? null;
  const completed = durable?.type === "LANDING";
  return {
    key: durable ? (durable.flightId ? "flight:" + durable.flightId : "lifecycle:" + durable.lifecycleKey)
      : provisionalKey({ ...input, at: followedAt }),
    identity: durable ? "DURABLE" : "PROVISIONAL",
    flightId: durable?.flightId ?? null,
    lifecycleKey: durable?.lifecycleKey ?? null,
    icaoHex: input.icaoHex.toUpperCase(),
    callsign: clean(input.callsign),
    registration: clean(input.registration),
    origin: clean(input.origin, 8),
    destination: clean(input.destination, 8),
    followedAt,
    status: completed ? "COMPLETED" : "ACTIVE",
    completedAt: completed ? iso(durable!.occurredAt) : null,
  };
}

export function addFollowedJourney(state: FollowedJourneysState, journey: FollowedJourney): FollowedJourneysState {
  return {
    version: 1,
    journeys: [journey, ...state.journeys.filter((item) => item.key !== journey.key)]
      .sort((a, b) => Date.parse(b.followedAt) - Date.parse(a.followedAt))
      .slice(0, FOLLOWED_JOURNEYS_MAX),
  };
}

export function removeFollowedJourney(state: FollowedJourneysState, key: string): FollowedJourneysState {
  return { version: 1, journeys: state.journeys.filter((item) => item.key !== key) };
}

export function updateJourneyFromEvents(journey: FollowedJourney, events: readonly IntelligenceIdentity[]): FollowedJourney {
  const matching = events.filter((event) =>
    (journey.flightId !== null && event.flightId === journey.flightId)
    || (journey.lifecycleKey !== null && event.lifecycleKey === journey.lifecycleKey)
  );
  const landing = matching.find((event) => event.type === "LANDING");
  if (!landing) return journey;
  return { ...journey, status: "COMPLETED", completedAt: iso(landing.occurredAt) };
}
