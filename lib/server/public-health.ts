import type { StateSnapshot } from "@/lib/aircraft/types";
import type { AtcDatasetMetadata } from "@/lib/atc/types";
import type { AlertStatus } from "@/lib/server/alert-engine";

export interface HealthDatabaseStatus {
  status: "ok" | "offline" | "not_configured";
}

export interface PublicHealthResponse {
  status: "ok" | "degraded";
  application: { status: "ok"; name: "AirRadar" };
  database: HealthDatabaseStatus & { message?: string };
  source: {
    status: "ok" | "offline" | "demo";
    provider: string;
    lastUpdate: string | null;
    error: string | null;
  };
  readsb: {
    status: "ok" | "offline" | "demo";
    provider: string;
    lastUpdate: string | null;
    error: string | null;
  };
  aircraftCount: number;
  lastReadsbUpdate: string | null;
  atc: AtcDatasetMetadata;
  alerts: AlertStatus;
  checkedAt: string;
}

export function toPublicHealthResponse(
  snapshot: StateSnapshot,
  database: HealthDatabaseStatus,
  checkedAt = new Date().toISOString(),
  atc: AtcDatasetMetadata = {
    status: "unavailable",
    source: null,
    sourceReference: null,
    effectiveDate: null,
    lastVerifiedAt: null,
    sectorCount: 0,
    transmitterCount: 0,
  },
  alerts: AlertStatus = { status: "disabled", enabled: false, notifier: "noop", ruleCount: 0 },
): PublicHealthResponse {
  const readsbStatus: "ok" | "offline" | "demo" = snapshot.provider === "mock"
    ? "demo"
    : snapshot.sourceOnline ? "ok" : "offline";
  const databaseRequired = snapshot.provider !== "mock";
  const degraded = readsbStatus === "offline"
    || database.status === "offline"
    || databaseRequired && database.status === "not_configured";
  const databaseResponse: PublicHealthResponse["database"] = database.status === "ok"
    ? { status: "ok" }
    : { status: database.status, message: database.status === "not_configured" ? "Database not configured" : "Database unavailable" };
  const sourceError = readsbStatus === "offline" ? "Receiver unavailable" : null;

  return {
    status: degraded ? "degraded" : "ok",
    application: { status: "ok", name: "AirRadar" },
    database: databaseResponse,
    source: {
      status: readsbStatus,
      provider: snapshot.provider,
      lastUpdate: snapshot.lastSourceUpdate,
      error: sourceError,
    },
    readsb: {
      status: readsbStatus,
      provider: snapshot.provider,
      lastUpdate: snapshot.lastReadsbUpdate,
      error: sourceError,
    },
    aircraftCount: snapshot.aircraft.length,
    lastReadsbUpdate: snapshot.lastReadsbUpdate,
    atc,
    alerts,
    checkedAt,
  };
}
