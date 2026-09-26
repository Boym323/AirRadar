import type { WeatherRadarDiagnostics } from "@/lib/server/weather-radar/types";
import type {
  DiagnosticReasonCode,
  DiagnosticState,
  OperationalState,
  SystemStatus,
  SystemStatusBuildInput,
} from "@/lib/server/system-status-contract";

type WindDiagnostics = ReturnType<(typeof import("@/lib/server/wind-aloft"))["defaultWindAloftProvider"]["diagnostics"]>;

export function diagnostic(
  operationalState: OperationalState,
  reasonCode: DiagnosticReasonCode | null,
): DiagnosticState {
  const reasons: Record<DiagnosticReasonCode, string> = {
    NOT_INITIALIZED: "No request has been made since startup.",
    CONFIG_DISABLED: "Disabled by configuration.",
    FIRST_LOAD_PENDING: "The first data request is in progress.",
    UPSTREAM_UNAVAILABLE: "The upstream provider is unavailable.",
    UPSTREAM_TIMEOUT: "The upstream provider timed out.",
    RATE_LIMITED: "The upstream provider is rate limiting requests.",
    STALE_CACHE: "Using stale cached data.",
    STALE_DATASET: "The dataset is stale.",
    PARTIAL_DATA: "Only part of the dataset is available.",
    NO_VALID_TIMES: "The provider returned no valid forecast times.",
    NO_CATALOG: "No radar catalog is available.",
    NO_USABLE_CACHE: "No usable cached data is available.",
    LAST_REFRESH_FAILED: "The last refresh failed.",
  };
  return { operationalState, reasonCode, reason: reasonCode ? reasons[reasonCode] : null };
}

export function legacyStatus(state: OperationalState): SystemStatus {
  return state === "offline"
    ? "offline"
    : state === "degraded"
      ? "degraded"
      : state === "disabled"
        ? "disabled"
        : "ok";
}

export function adsbDbDiagnostic(value: SystemStatusBuildInput["adsbdb"]): DiagnosticState {
  if (!value) return diagnostic("disabled", "CONFIG_DISABLED");
  if (
    value.hasAttempted === false
    || (value.providerStatus === "unknown" && !value.lastFailureAt && !value.lastSuccessAt)
  ) return diagnostic("on_demand", "NOT_INITIALIZED");
  if (value.providerStatus === "offline") return diagnostic("offline", "UPSTREAM_UNAVAILABLE");
  if (value.providerStatus === "degraded") {
    return diagnostic("degraded", value.hits.staleFallback > 0 ? "STALE_CACHE" : "LAST_REFRESH_FAILED");
  }
  return diagnostic("ok", null);
}

export function weatherStatus(value: SystemStatusBuildInput["weather"]): SystemStatus {
  if (!value) return "disabled";
  if (value.status === "disabled" || value.enabled === false) return "disabled";
  if (value.status === "offline") return "offline";
  if (value.status === "degraded" || value.status === "rate_limited") return "degraded";
  return "ok";
}

export function weatherDiagnostic(value: SystemStatusBuildInput["weather"]): DiagnosticState {
  if (!value || value.enabled === false || value.status === "disabled") {
    return diagnostic("disabled", "CONFIG_DISABLED");
  }
  if (!value.hasAttempted && !value.lastAttemptAt) return diagnostic("on_demand", "NOT_INITIALIZED");
  if (value.inFlight) return diagnostic("loading", "FIRST_LOAD_PENDING");
  if (value.status === "rate_limited") return diagnostic("degraded", "RATE_LIMITED");
  if (value.status === "offline") return diagnostic("offline", "UPSTREAM_UNAVAILABLE");
  if (value.sigmet?.international?.status === "stale" || value.sigmet?.airsigmet?.status === "stale") {
    return diagnostic("degraded", "STALE_DATASET");
  }
  if (
    value.sigmet?.international?.status === "unavailable"
    || value.sigmet?.airsigmet?.status === "unavailable"
  ) return diagnostic("degraded", "PARTIAL_DATA");
  if (value.status === "degraded") return diagnostic("degraded", "LAST_REFRESH_FAILED");
  return diagnostic("ok", null);
}

export function radarDiagnostic(value: WeatherRadarDiagnostics | undefined): DiagnosticState {
  if (!value) return diagnostic("on_demand", "NOT_INITIALIZED");
  if (value.inFlight) return diagnostic("loading", "FIRST_LOAD_PENDING");
  if (!value.hasAttempted) return diagnostic("on_demand", "NOT_INITIALIZED");
  if (value.status === "offline") {
    return diagnostic("offline", value.latestFrameId ? "NO_USABLE_CACHE" : "UPSTREAM_UNAVAILABLE");
  }
  if (value.status === "degraded") {
    return diagnostic("degraded", value.latestFrameId ? "STALE_CACHE" : "LAST_REFRESH_FAILED");
  }
  return diagnostic("ok", null);
}

export function windDiagnostic(value: WindDiagnostics | undefined): DiagnosticState {
  if (!value || !value.hasAttempted) return diagnostic("on_demand", "NOT_INITIALIZED");
  if (value.inFlight) return diagnostic("loading", "FIRST_LOAD_PENDING");
  if (value.status === "offline") return diagnostic("offline", "UPSTREAM_UNAVAILABLE");
  if (value.status === "degraded") {
    return diagnostic("degraded", value.validTimes ? "STALE_CACHE" : "NO_VALID_TIMES");
  }
  return diagnostic("ok", null);
}
