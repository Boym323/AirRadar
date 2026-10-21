import type { ProviderSnapshot } from "@/lib/aircraft/types";

/** Port for the process-owned local receiver. Implementations must not start polling on import. */
export interface AircraftProvider {
  readonly name: string;
  getSnapshot(): Promise<ProviderSnapshot>;
  /** Cancel an in-flight read without necessarily closing provider resources. */
  abort?(): void;
  close?(): Promise<void>;
  getDiagnostics?(): unknown;
}

export interface ExternalAdsbProvider extends AircraftProvider {
  readonly kind: "external-adsb";
}
