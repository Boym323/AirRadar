import "temporal-polyfill/full/global";
import { describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/server/db";

const enabled = process.env.AIRRADAR_REAL_ORM_INTEGRATION === "1";

describe.skipIf(!enabled)("real Prisma/Postgres temporal contract", () => {
  it("round-trips Flight and FlightPosition temporal inputs in one transaction", async () => {
    const database = getPrisma();
    if (!database) throw new Error("DATABASE_URL is required for the real ORM integration test");
    const at = Temporal.Instant.fromEpochMilliseconds(Date.parse("2026-01-01T12:00:00.000Z"));
    const rollback = new Error("ROLLBACK_REAL_ORM_TEMPORAL_TEST");

    await expect(database.transaction(async (transaction) => {
      const schema = transaction.orm.public;
      const aircraft = await schema.Aircraft.create({
        icaoHex: `TEST${Date.now().toString(36).toUpperCase()}`,
        registration: "TEST-ORM",
        aircraftType: "A320",
        updatedAt: at,
      });
      const flight = await schema.Flight.create({
        aircraftId: aircraft.id,
        instanceKey: `TEST-ORM:${Date.now()}`,
        callsign: "TESTORM",
        aircraftType: "A320",
        startTime: at,
        lastSeenAt: at,
      });
      await schema.Flight.where({ id: flight.id }).update({ lastSeenAt: at, endTime: at });
      await schema.FlightPosition.create({ flightId: flight.id, recordedAt: at, lat: 50, lon: 14 });
      const persisted = await schema.Flight.where({ id: flight.id }).first();
      const position = await schema.FlightPosition.where({ flightId: flight.id }).first();

      expect(persisted?.startTime).toBeInstanceOf(Temporal.Instant);
      expect(persisted?.lastSeenAt).toBeInstanceOf(Temporal.Instant);
      expect(persisted?.endTime).toBeInstanceOf(Temporal.Instant);
      expect(position?.recordedAt).toBeInstanceOf(Temporal.Instant);
      throw rollback;
    })).rejects.toBe(rollback);
  });
});
