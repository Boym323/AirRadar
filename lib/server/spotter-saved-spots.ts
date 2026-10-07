import { getAlertsFleetsRepository } from "@/lib/server/alerts-fleets-repository";
import type { AlertV1Fleet, AlertV1Geofence, AlertV1Rule } from "@/lib/server/alerts-fleets-v1";

export const SPOTTER_ICONIC_AIRCRAFT_TYPES = [
  "A388",
  "B741",
  "B742",
  "B743",
  "B744",
  "B748",
  "A124",
  "A225",
] as const;

const SPOTTER_FLEET_NAME = "Spotter · iconic aircraft";
const SPOTTER_SPOT_PREFIX = "Spotter · ";
const SPOTTER_RULE_SUFFIX = " · iconic arrivals";
const SPOTTER_DEFAULT_COOLDOWN_MS = 30 * 60_000;

export interface SpotterSavedSpot {
  id: string;
  name: string;
  centerLat: number;
  centerLon: number;
  radiusMeters: number;
  enabled: boolean;
  ruleId: string | null;
  ruleEnabled: boolean;
}

function publicName(storedName: string): string {
  return storedName.startsWith(SPOTTER_SPOT_PREFIX)
    ? storedName.slice(SPOTTER_SPOT_PREFIX.length)
    : storedName;
}

function storedName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ").slice(0, 48);
  if (!cleaned) throw new Error("spot name is required");
  return SPOTTER_SPOT_PREFIX + cleaned;
}

function ruleName(name: string): string {
  return storedName(name) + SPOTTER_RULE_SUFFIX;
}

async function ensureIconicFleet(): Promise<AlertV1Fleet> {
  const repository = getAlertsFleetsRepository();
  let fleet = (await repository.listFleets()).find((item) => item.name === SPOTTER_FLEET_NAME);
  if (!fleet) {
    fleet = await repository.saveFleet({
      name: SPOTTER_FLEET_NAME,
      description: "AirRadar Spotter background alerts for iconic aircraft types.",
      enabled: true,
    });
  }

  const existing = new Set(
    fleet.matchers
      .filter((matcher) => matcher.enabled && matcher.type === "AIRCRAFT_TYPE")
      .map((matcher) => matcher.value.trim().toUpperCase()),
  );
  for (const type of SPOTTER_ICONIC_AIRCRAFT_TYPES) {
    if (existing.has(type)) continue;
    await repository.saveMatcher({
      fleetId: fleet.id,
      type: "AIRCRAFT_TYPE",
      value: type,
      enabled: true,
    });
  }

  return (await repository.listFleets()).find((item) => item.id === fleet!.id) ?? fleet;
}

function toSavedSpot(geofence: AlertV1Geofence, rules: readonly AlertV1Rule[]): SpotterSavedSpot {
  const rule = rules.find((candidate) =>
    candidate.geofenceId === geofence.id
    && candidate.trigger === "GEOFENCE_ENTER"
    && candidate.name === geofence.name + SPOTTER_RULE_SUFFIX
  );
  return {
    id: geofence.id,
    name: publicName(geofence.name),
    centerLat: geofence.centerLat,
    centerLon: geofence.centerLon,
    radiusMeters: geofence.radiusMeters,
    enabled: geofence.enabled,
    ruleId: rule?.id ?? null,
    ruleEnabled: rule?.enabled ?? false,
  };
}

export async function listSpotterSavedSpots(): Promise<SpotterSavedSpot[]> {
  const repository = getAlertsFleetsRepository();
  const [geofences, rules] = await Promise.all([
    repository.listGeofences(),
    repository.listRules(),
  ]);
  return geofences
    .filter((geofence) => geofence.name.startsWith(SPOTTER_SPOT_PREFIX))
    .map((geofence) => toSavedSpot(geofence, rules))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveSpotterSavedSpot(input: {
  name: string;
  centerLat: number;
  centerLon: number;
  radiusMeters: number;
}): Promise<SpotterSavedSpot> {
  const repository = getAlertsFleetsRepository();
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 48);
  if (!name) throw new Error("spot name is required");
  if (!Number.isFinite(input.radiusMeters) || input.radiusMeters < 500 || input.radiusMeters > 25_000) {
    throw new Error("spot radius must be between 500 and 25000 meters");
  }

  const fleet = await ensureIconicFleet();
  const geofenceName = storedName(name);
  const existingGeofence = (await repository.listGeofences()).find((item) => item.name === geofenceName);
  const geofence = await repository.saveGeofence({
    ...(existingGeofence ? { id: existingGeofence.id } : {}),
    name: geofenceName,
    centerLat: input.centerLat,
    centerLon: input.centerLon,
    radiusMeters: input.radiusMeters,
    enabled: true,
  });

  const expectedRuleName = ruleName(name);
  const existingRule = (await repository.listRules()).find((item) =>
    item.name === expectedRuleName || item.geofenceId === geofence.id
  );
  const rule = await repository.saveRule({
    ...(existingRule ? { id: existingRule.id } : {}),
    name: expectedRuleName,
    enabled: true,
    target: { kind: "FLEET", fleetId: fleet.id },
    trigger: "GEOFENCE_ENTER",
    triggerConfig: {},
    channels: ["IN_APP", "PUSHOVER"],
    geofenceId: geofence.id,
    cooldownMs: SPOTTER_DEFAULT_COOLDOWN_MS,
  });

  return {
    ...toSavedSpot(geofence, [rule]),
    ruleId: rule.id,
    ruleEnabled: rule.enabled,
  };
}

export async function deleteSpotterSavedSpot(id: string): Promise<void> {
  const repository = getAlertsFleetsRepository();
  const geofence = (await repository.listGeofences()).find((item) =>
    item.id === id && item.name.startsWith(SPOTTER_SPOT_PREFIX)
  );
  if (!geofence) throw new Error("saved spot not found");

  for (const rule of await repository.listRules()) {
    if (rule.geofenceId === geofence.id && rule.name.endsWith(SPOTTER_RULE_SUFFIX)) {
      await repository.deleteRule(rule.id);
    }
  }
  await repository.deleteGeofence(geofence.id);
}
