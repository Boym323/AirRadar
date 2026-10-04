import { existsSync, readFileSync } from "node:fs";
import {
  isValidWildcardPattern,
  normalizeAircraftRuleType,
  type AircraftRuleType,
} from "@/lib/aircraft/watchlist";
import { normalizeIcaoHex } from "@/lib/server/validation";
import { getLegacyRuntimeStatePath, getRuntimeStatePath } from "@/lib/server/runtime-state";

export interface AlertRule {
  id: string;
  /** Optional for backwards compatibility with the original alerts.json format. */
  name?: string;
  enabled: boolean;
  type: AircraftRuleType;
  value: string;
  maxDistanceKm?: number;
  etaThresholdMinutes?: number;
  etaDestinationIcao?: string;
  notifyRunwayChange?: boolean;
}

export interface AlertConfig {
  rules: AlertRule[];
  errors: string[];
  path: string;
}

export function getAlertConfigPath(): string {
  return getRuntimeStatePath("alerts.json");
}

function issue(errors: string[], message: string): void {
  errors.push(message);
}

export function parseAlertRules(input: unknown): { rules: AlertRule[]; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(input)) return { rules: [], errors: ["root must be an array"] };

  const rules: AlertRule[] = [];
  const ids = new Set<string>();
  input.forEach((raw, index) => {
    const path = `rules[${index}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issue(errors, `${path} must be an object`);
      return;
    }
    const record = raw as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const enabled = record.enabled;
    const type = typeof record.type === "string" ? normalizeAircraftRuleType(record.type) : null;
    const rawValue = typeof record.value === "string" ? record.value.trim() : "";
    const value = type === "icaoHex" ? normalizeIcaoHex(rawValue) ?? rawValue : rawValue.toUpperCase();
    const rawName = typeof record.name === "string" ? record.name.trim() : "";
    const name = rawName || id;
    let valid = true;

    if (!id) {
      issue(errors, `${path}.id must be a non-empty string`);
      valid = false;
    } else if (ids.has(id)) {
      issue(errors, `${path}.id is duplicated`);
      valid = false;
    }
    if (typeof enabled !== "boolean") {
      issue(errors, `${path}.enabled must be boolean`);
      valid = false;
    }
    if (!type) {
      issue(errors, `${path}.type is unsupported`);
      valid = false;
    }
    if (!value) {
      issue(errors, `${path}.value must be a non-empty string`);
      valid = false;
    }
    if (type === "icaoHex" && !normalizeIcaoHex(rawValue)) {
      issue(errors, `${path}.value must be a valid ICAO hex`);
      valid = false;
    }
    if (type === "callsignPattern" && !isValidWildcardPattern(value)) {
      issue(errors, `${path}.value contains an invalid wildcard pattern`);
      valid = false;
    }

    let maxDistanceKm: number | undefined;
    if (record.maxDistanceKm !== undefined) {
      if (typeof record.maxDistanceKm !== "number" || !Number.isFinite(record.maxDistanceKm) || record.maxDistanceKm <= 0) {
        issue(errors, `${path}.maxDistanceKm must be a positive finite number; non-negative zero is not allowed`);
        valid = false;
      } else {
        maxDistanceKm = record.maxDistanceKm;
      }
    }

    let etaThresholdMinutes: number | undefined;
    if (record.etaThresholdMinutes !== undefined) {
      if (typeof record.etaThresholdMinutes !== "number" || !Number.isInteger(record.etaThresholdMinutes) || record.etaThresholdMinutes < 1 || record.etaThresholdMinutes > 120) {
        issue(errors, `${path}.etaThresholdMinutes must be an integer from 1 to 120`);
        valid = false;
      } else {
        etaThresholdMinutes = record.etaThresholdMinutes;
      }
    }

    let etaDestinationIcao: string | undefined;
    if (record.etaDestinationIcao !== undefined) {
      if (typeof record.etaDestinationIcao !== "string" || !/^[A-Za-z]{4}$/.test(record.etaDestinationIcao.trim())) {
        issue(errors, `${path}.etaDestinationIcao must be a four-letter ICAO code`);
        valid = false;
      } else {
        etaDestinationIcao = record.etaDestinationIcao.trim().toUpperCase();
      }
    }
    if (etaDestinationIcao && etaThresholdMinutes === undefined) {
      issue(errors, `${path}.etaDestinationIcao requires etaThresholdMinutes`);
      valid = false;
    }

    const notifyRunwayChange = record.notifyRunwayChange === undefined ? false : record.notifyRunwayChange;
    if (typeof notifyRunwayChange !== "boolean") {
      issue(errors, `${path}.notifyRunwayChange must be boolean`);
      valid = false;
    }

    if (!valid || !type || typeof enabled !== "boolean") return;
    ids.add(id);
    rules.push({
      id, name, enabled, type, value,
      ...(maxDistanceKm === undefined ? {} : { maxDistanceKm }),
      ...(etaThresholdMinutes === undefined ? {} : { etaThresholdMinutes }),
      ...(etaDestinationIcao === undefined ? {} : { etaDestinationIcao }),
      ...(notifyRunwayChange ? { notifyRunwayChange: true } : {}),
    });
  });

  return { rules, errors };
}

export function loadAlertConfig(path = getAlertConfigPath()): AlertConfig {
  // A legacy checkout config is read only while the state-directory copy is
  // absent. All writes target `path`, so this never creates two active stores.
  const legacyPath = path === getAlertConfigPath() ? getLegacyRuntimeStatePath("alerts.json") : null;
  const sourcePath = existsSync(path) ? path : legacyPath && existsSync(legacyPath) ? legacyPath : null;
  if (!sourcePath) return { rules: [], errors: [], path };
  try {
    const parsed = JSON.parse(readFileSync(sourcePath, "utf8")) as unknown;
    const result = parseAlertRules(parsed);
    if (result.errors.length) console.error(`AirRadar alerts config invalid: ${result.errors.join("; ")}`);
    return { ...result, path };
  } catch (error) {
    const reason = error instanceof SyntaxError ? "invalid JSON" : "file could not be read";
    console.error(`AirRadar alerts config invalid: ${reason}`);
    return { rules: [], errors: [reason], path };
  }
}
