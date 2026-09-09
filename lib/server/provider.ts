import type { AircraftMetadata, CoverageMode, FlightPlan, FlightRoute, NetworkProviderDiagnostics, ProviderSnapshot } from "@/lib/aircraft/types";
import type { AtcActivity, AtcSector } from "@/lib/atc/types";

export interface AircraftProvider {
  readonly name: string;
  getSnapshot(): Promise<ProviderSnapshot>;
  close?(): Promise<void>;
}

export interface ExternalAdsbProvider extends AircraftProvider {
  readonly kind: "external-adsb";
}

export interface NetworkAircraftSnapshot {
  aircraft: ProviderSnapshot["aircraft"];
  fetchedAt: string | null;
  provider: string;
}

/** Optional network live coverage. It never owns local history or statistics. */
export interface NetworkAircraftProvider {
  readonly name: string;
  start(): void;
  getSnapshot(): Promise<NetworkAircraftSnapshot>;
  getDiagnostics(): NetworkProviderDiagnostics;
  stop(): Promise<void>;
}

export interface AircraftStateSnapshotOptions {
  coverage?: CoverageMode;
  includeTrails?: boolean;
}

export interface AircraftMetadataProvider {
  readonly name: string;
  getMetadata(icaoHex: string): Promise<AircraftMetadata | null>;
}

export interface AircraftMetadataDiagnostics {
  hotCacheSize: number;
  hotCacheLimit: number;
  catalogRecordCount: number | null;
  fallbackCacheSize?: number;
  fallbackCacheLimit?: number;
  fallbackCacheBytes?: number;
  fallbackCacheBytesLimit?: number;
}

export interface FlightRouteProvider {
  readonly name: string;
  getRoute(callsign: string, observedAt: Date): Promise<FlightRoute | null>;
}

export interface FlightPlanProvider {
  readonly name: string;
  getFlightPlan(callsign: string, observedAt: Date): Promise<FlightPlan | null>;
}

export interface AtcSectorProvider {
  readonly name: string;
  getSectors(): Promise<AtcSector[]>;
}

export interface AtcActivityProvider {
  readonly name: string;
  getActivity(query: {
    callsign: string | null;
    sectorId: string | null;
    observedAt: Date;
  }): Promise<AtcActivity | null>;
}

export interface ProviderRegistry {
  aircraftMetadata?: AircraftMetadataProvider;
  flightRoute?: FlightRouteProvider;
  flightPlan?: FlightPlanProvider;
  atcSector?: AtcSectorProvider;
  atcActivity?: AtcActivityProvider;
}
