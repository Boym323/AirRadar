import type { ProviderSnapshot } from "@/lib/aircraft/types";

export interface AircraftProvider {
  readonly name: "readsb" | "mock";
  getSnapshot(): Promise<ProviderSnapshot>;
}
