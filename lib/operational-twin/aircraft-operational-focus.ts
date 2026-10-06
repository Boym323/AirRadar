import type { NavigationIntegrityCorridorIntelligence } from "./navigation-integrity-corridor";
import type {
  AircraftOperationalFocusItem,
  AircraftOperationalFocusLevel,
  AircraftOperationalFocusSummary,
  OperationalTwinConfidence,
  OperationalTwinEvent,
} from "./types";
import { OPERATIONAL_TWIN_HORIZON_MINUTES } from "./types";
import type { WeatherCorridorIntelligence } from "@/lib/weather/corridor-intelligence";

export const AIRCRAFT_OPERATIONAL_FOCUS_VERSION = "aircraft-operational-focus-v1" as const;
export const AIRCRAFT_OPERATIONAL_FOCUS_MAX_ITEMS = 8;

function confidenceRank(confidence: OperationalTwinConfidence): number {
  if (confidence === "HIGH") return 3;
  if (confidence === "MEDIUM") return 2;
  return 1;
}

function levelRank(level: Exclude<AircraftOperationalFocusLevel, "NORMAL">): number {
  return level === "ATTENTION" ? 2 : 1;
}

function inHorizon(offsetMinutes: number): boolean {
  return Number.isFinite(offsetMinutes)
    && offsetMinutes >= 0
    && offsetMinutes <= OPERATIONAL_TWIN_HORIZON_MINUTES;
}

function weatherItems(weather: WeatherCorridorIntelligence): AircraftOperationalFocusItem[] {
  return weather.events.flatMap((event) => {
    if (!inHorizon(event.offsetMinutes) || event.type === "SIGMET_EXIT") return [];
    if (event.severity !== "HIGH" && event.severity !== "MODERATE") return [];

    const level = event.severity === "HIGH" && event.confidence !== "LOW"
      ? "ATTENTION" as const
      : "WATCH" as const;
    const reasonCodes = [
      event.severity === "HIGH" ? "WEATHER_HIGH_SEVERITY" : "WEATHER_MODERATE_SEVERITY",
      `WEATHER_${event.type}`,
      `WEATHER_CONFIDENCE_${event.confidence}`,
    ];

    return [{
      id: `weather:${event.id}`,
      type: "WEATHER" as const,
      level,
      offsetMinutes: event.offsetMinutes,
      at: event.at,
      confidence: event.confidence,
      label: event.risk,
      source: event.source,
      sourceReference: event.sourceReference,
      reasonCodes,
    }];
  });
}

function navigationIntegrityItems(
  navigationIntegrity: NavigationIntegrityCorridorIntelligence | undefined,
): AircraftOperationalFocusItem[] {
  if (!navigationIntegrity || navigationIntegrity.status !== "AVAILABLE") return [];

  return navigationIntegrity.events.flatMap((event) => {
    if (!inHorizon(event.entryOffsetMinutes)) return [];
    const elevatedSeverity = event.severity === "SEVERE" || event.severity === "DEGRADED";
    const level = elevatedSeverity && event.confidence !== "LOW"
      ? "ATTENTION" as const
      : "WATCH" as const;

    return [{
      id: `navigation-integrity:${event.id}`,
      type: "NAVIGATION_INTEGRITY" as const,
      level,
      offsetMinutes: event.entryOffsetMinutes,
      at: event.entryAt,
      confidence: event.confidence,
      label: event.severity,
      source: event.source,
      sourceReference: event.anomalyId,
      reasonCodes: [
        `NAVIGATION_INTEGRITY_${event.severity}`,
        `NAVIGATION_INTEGRITY_CONFIDENCE_${event.confidence}`,
        "REGIONAL_HEURISTIC",
      ],
    }];
  });
}

function situationEventItems(events: readonly OperationalTwinEvent[]): AircraftOperationalFocusItem[] {
  return events.flatMap((event) => {
    if (!inHorizon(event.offsetMinutes)) return [];

    if (event.type === "PLANNED_AIRSPACE") {
      return [{
        id: `planned-airspace:${event.id}`,
        type: "PLANNED_AIRSPACE" as const,
        level: "WATCH" as const,
        offsetMinutes: event.offsetMinutes,
        at: event.at,
        confidence: event.confidence,
        label: event.title,
        source: event.source,
        sourceReference: event.sourceReference,
        reasonCodes: ["PLANNED_AIRSPACE_INTERSECTION", "PLAN_ONLY_NOT_ACTIVATION"],
      }];
    }

    if (event.type === "TRAJECTORY_STATE") {
      return [{
        id: `trajectory:${event.id}`,
        type: "TRAJECTORY" as const,
        level: "WATCH" as const,
        offsetMinutes: event.offsetMinutes,
        at: event.at,
        confidence: event.confidence,
        label: event.title,
        source: event.source,
        sourceReference: event.sourceReference,
        reasonCodes: ["TRAJECTORY_NON_NORMAL", "PUBLIC_PREDICTION_CONTEXT"],
      }];
    }

    return [];
  });
}

export function buildAircraftOperationalFocus(input: {
  generatedAt: Date;
  events: readonly OperationalTwinEvent[];
  weatherCorridor: WeatherCorridorIntelligence;
  navigationIntegrityCorridor?: NavigationIntegrityCorridorIntelligence;
}): AircraftOperationalFocusSummary {
  const candidates = [
    ...weatherItems(input.weatherCorridor),
    ...navigationIntegrityItems(input.navigationIntegrityCorridor),
    ...situationEventItems(input.events),
  ].sort((left, right) =>
    levelRank(right.level) - levelRank(left.level)
    || left.offsetMinutes - right.offsetMinutes
    || confidenceRank(right.confidence) - confidenceRank(left.confidence)
    || left.type.localeCompare(right.type)
    || left.id.localeCompare(right.id)
  );

  const items = candidates.slice(0, AIRCRAFT_OPERATIONAL_FOCUS_MAX_ITEMS);
  const level: AircraftOperationalFocusLevel = items.some((item) => item.level === "ATTENTION")
    ? "ATTENTION"
    : items.length
      ? "WATCH"
      : "NORMAL";

  return {
    version: AIRCRAFT_OPERATIONAL_FOCUS_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    level,
    total: items.length,
    watch: items.filter((item) => item.level === "WATCH").length,
    attention: items.filter((item) => item.level === "ATTENTION").length,
    truncated: candidates.length > items.length,
    items,
    limitations: [
      "OPERATIONAL_CONTEXT_ONLY",
      "NOT_SAFETY_ALERT",
      "NO_ATC_CLEARANCE_INFERENCE",
      "SOURCE_SEMANTICS_PRESERVED",
      "NO_ALL_CLEAR_INFERENCE",
    ],
  };
}
