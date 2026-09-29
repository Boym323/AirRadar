import "temporal-polyfill/full/global";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { getPrisma } from "@/lib/server/db";
import { ReceiverCoverageAnalytics } from "@/lib/server/receiver-coverage-analytics";

const enabled = process.env.AIRRADAR_REAL_ORM_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
type Pending = { pending: Map<number, { buckets: Map<string, { available: number; captured: number }>; providers: Set<string> }> };

describe.skipIf(!enabled)("ReceiverCoverageHourly real PostgreSQL integration", () => {
  const database = getPrisma()!;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const hour = Temporal.Instant.fromEpochMilliseconds(
    Math.floor(Date.now() / 3_600_000) * 3_600_000,
  );
  const suffix = `real-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const keys = [`${suffix}-a`, `${suffix}-b`, `${suffix}-c`, `${suffix}-d`];
  const triggerName = `airradar_${suffix.replace(/[^a-z0-9]/gi, "_")}_fail`;
  const functionName = `${triggerName}_fn`;

  afterAll(async () => {
    await pool.query(`DROP TRIGGER IF EXISTS "${triggerName}" ON "receiverCoverageHourly"; DROP FUNCTION IF EXISTS "${functionName}"();`);
    await pool.query(`DELETE FROM "receiverCoverageHourly" WHERE "hour" = $1 AND "bucketKey" = ANY($2::text[])`, [hour.toString(), keys]);
    await pool.end();
  });

  it("rolls back UPDATE and CREATE mutations, then retries each delta exactly once", async () => {
    await database.transaction(async (transaction) => {
      const table = transaction.orm.public.ReceiverCoverageHourly;
      await table.create({ hour, dimension: "real", bucketKey: keys[0], availableCount: 100, capturedCount: 80, referenceProviders: "test" });
      await table.create({ hour, dimension: "real", bucketKey: keys[1], availableCount: 50, capturedCount: 40, referenceProviders: "test" });
    });
    await pool.query(`
      CREATE OR REPLACE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        IF NEW."bucketKey" IN ('${keys[1]}', '${keys[3]}') THEN
          RAISE EXCEPTION 'synthetic ReceiverCoverageHourly failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER "${triggerName}"
      AFTER INSERT OR UPDATE ON "receiverCoverageHourly"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"();
    `);

    const analytics = new ReceiverCoverageAnalytics({ enabled: true });
    const internals = analytics as unknown as {
      pending: Map<number, { buckets: Map<string, { available: number; captured: number }>; providers: Set<string> }>;
    };
    internals.pending.set(hour.epochMilliseconds, {
      buckets: new Map([
        [keys[0], { available: 10, captured: 8 }],
        [keys[1], { available: 5, captured: 4 }],
      ]),
      providers: new Set(["test"]),
    });

    await analytics.flush();
    const rolledBack = (await database.orm.public.ReceiverCoverageHourly.where({ hour }).all()).filter((row) => keys.includes(row.bucketKey));
    expect(rolledBack.map((row) => [row.bucketKey, row.availableCount, row.capturedCount])).toEqual([
      [keys[0], 100, 80],
      [keys[1], 50, 40],
    ]);
    expect(analytics.getDiagnostics()).toMatchObject({ flushFailures: 1, flushSuccesses: 0, rowsInserted: 0, rowsUpdated: 0 });

    await pool.query(`DROP TRIGGER "${triggerName}" ON "receiverCoverageHourly"`);
    await analytics.flush();
    const retried = (await database.orm.public.ReceiverCoverageHourly.where({ hour }).all()).filter((row) => keys.includes(row.bucketKey));
    expect(retried.map((row) => [row.bucketKey, row.availableCount, row.capturedCount])).toEqual([
      [keys[0], 110, 88],
      [keys[1], 55, 44],
    ]);

    await pool.query(`CREATE TRIGGER "${triggerName}" AFTER INSERT OR UPDATE ON "receiverCoverageHourly" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
    const createAnalytics = new ReceiverCoverageAnalytics({ enabled: true });
    const createInternals = createAnalytics as unknown as typeof internals;
    createInternals.pending.set(hour.epochMilliseconds, {
      buckets: new Map([
        [keys[2], { available: 7, captured: 6 }],
        [keys[3], { available: 3, captured: 2 }],
      ]),
      providers: new Set(["test"]),
    });
    await createAnalytics.flush();
    expect((await database.orm.public.ReceiverCoverageHourly.where({ hour }).all()).some((row) => row.bucketKey === keys[2])).toBe(false);
    expect(createAnalytics.getDiagnostics()).toMatchObject({ flushFailures: 1, rowsInserted: 0 });
  });

  it("warms a cold cache and preserves durable counts across an analytics restart", async () => {
    await database.orm.public.ReceiverCoverageHourly.create({ hour, dimension: "real", bucketKey: keys[2], availableCount: 20, capturedCount: 10, referenceProviders: "test" });
    const first = new ReceiverCoverageAnalytics({ enabled: true });
    const firstInternals = first as unknown as Pending;
    firstInternals.pending.set(hour.epochMilliseconds, { buckets: new Map([[keys[2], { available: 4, captured: 3 }]]), providers: new Set(["test"]) });
    await first.flush();
    const second = new ReceiverCoverageAnalytics({ enabled: true });
    const secondInternals = second as unknown as Pending;
    secondInternals.pending.set(hour.epochMilliseconds, { buckets: new Map([[keys[2], { available: 5, captured: 4 }]]), providers: new Set(["test"]) });
    await second.flush();
    const row = await database.orm.public.ReceiverCoverageHourly.where({ hour, bucketKey: keys[2] }).first();
    expect(row).toMatchObject({ availableCount: 29, capturedCount: 17 });
    expect(second.getDiagnostics().rowsUpdated).toBe(1);
  });
});
