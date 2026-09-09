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

    if (!valid || !type || typeof enabled !== "boolean") return;
    ids.add(id);
    rules.push({ id, name, enabled, type, value, ...(maxDistanceKm === undefined ? {} : { maxDistanceKm }) });
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
