import { afterEach, describe, expect, it } from "vitest";
import { MockReadsbProvider } from "@/lib/server/mock-readsb-provider";
import { AircraftStateService } from "@/lib/server/aircraft-state";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import type { ProviderSnapshot } from "@/lib/aircraft/types";
import { EnrichmentService } from "@/lib/server/enrichment-cache";
import { AtcSectorService, EmptyAtcSectorProvider } from "@/lib/server/atc-sector-service";
import type { AircraftProvider } from "@/lib/server/provider";

const services: AircraftStateService[] = [];

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.stop()));
});

describe("aircraft state service", () => {
  it("keeps trails in server memory but omits them from live wire snapshots", async () => {
    const service = new AircraftStateService(new MockReadsbProvider({ lat: 50, lon: 14, name: "Test" }));
    services.push(service);
    await service.waitForReady();
    const compact = service.getSnapshot();
    const full = service.getSnapshot({ includeTrails: true });

    expect(compact.aircraft[0].trail).toBeUndefined();
    expect(full.aircraft[0].trail).toHaveLength(1);
    expect(service.getAircraft(full.aircraft[0].icaoHex)?.trail).toHaveLength(1);
  });

  it("keeps hex-bound metadata when the same aircraft changes callsign", async () => {
    const firstAircraft = normalizeAircraft({ hex: "ABC123", flight: "OLD123", lat: 50, lon: 14 }, { lat: 50, lon: 14, name: "Test" });
    const secondAircraft = normalizeAircraft({ hex: "ABC123", flight: "NEW123", lat: 50.01, lon: 14.01 }, { lat: 50, lon: 14, name: "Test" });
    if (!firstAircraft || !secondAircraft) throw new Error("test aircraft could not be normalized");
    firstAircraft.enrichment = {
      metadata: {
        registration: "OK-ABC", registrationCountry: "Testland", registrationCountryCode: "TT",
        aircraftType: "A320", icaoTypeCode: "A320", aircraftDescription: "Airbus A320", operator: "Operator ABC123",
        manufacturer: "Airbus", source: "test", retrievedAt: new Date().toISOString(),
      },
      route: {
        callsign: "OLD123", airline: "Old Airline", airlineIcao: null, airlineIata: null,
        origin: "LKPR", destination: "EDDF", originAirport: null, destinationAirport: null,
        source: "test", retrievedAt: new Date().toISOString(),
      },
    };
    const snapshots: ProviderSnapshot[] = [
      { aircraft: [firstAircraft], receiver: { lat: 50, lon: 14, name: "Test" }, fetchedAt: new Date().toISOString(), provider: "test" },
      { aircraft: [secondAircraft], receiver: { lat: 50, lon: 14, name: "Test" }, fetchedAt: new Date(Date.now() + 1_000).toISOString(), provider: "test" },
    ];
    const provider: AircraftProvider = {
      name: "test",
      getSnapshot: async () => snapshots.shift() ?? snapshots[0],
    };
    const service = new AircraftStateService(provider, new EnrichmentService({}), new AtcSectorService(new EmptyAtcSectorProvider()));
    services.push(service);

    await service.waitForReady();
    await (service as unknown as { refresh: () => Promise<void> }).refresh();

    const current = service.getAircraft("ABC123");
    expect(current?.callsign).toBe("NEW123");
    expect(current?.enrichment?.metadata).toMatchObject({ registration: "OK-ABC", operator: "Operator ABC123" });
    expect(current?.enrichment?.route).toBeUndefined();
  });
});
