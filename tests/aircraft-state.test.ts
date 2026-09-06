import { afterEach, describe, expect, it } from "vitest";
import { MockReadsbProvider } from "@/lib/server/mock-readsb-provider";
import { AircraftStateService } from "@/lib/server/aircraft-state";

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
});
