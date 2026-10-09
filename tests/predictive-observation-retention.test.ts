import { describe, expect, it } from "vitest";
import { prunePredictiveObservationRetention } from "@/lib/server/predictive-observation-retention";

function fixture(days: number[]) {
  const now = Date.parse("2026-10-09T00:00:00.000Z");
  const rows = days.map((age, i) => ({observationKey: String(i),
    predictedAt: now - age * 86_400_000}));
  let deleted = 0;
  function query(filtered = rows) {
    return {
      where(p: (x: unknown) => boolean) {
        return query(filtered.filter(row => p({
          predictedAt: {lt: (instant: {epochMilliseconds: number}) => row.predictedAt < instant.epochMilliseconds},
          observationKey: {in: (ids: string[]) => ids.includes(row.observationKey)},
        })));
      },
      orderBy() {return query([...filtered].sort((a,b) => a.predictedAt - b.predictedAt));},
      limit(n: number) {return query(filtered.slice(0,n));},
      select() {return this;},
      async all() {return filtered.map(row => ({observationKey: row.observationKey}));},
      async deleteAndCount() {
        const keys = new Set(filtered.map(row => row.observationKey));
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) if (keys.has(rows[i]!.observationKey)) rows.splice(i,1);
        deleted += before-rows.length;
        return before-rows.length;
      },
    };
  }
  return { database: { orm: {public: {PredictiveObservation: query()}}}, rows, get deleted() {return deleted;} };
}
describe("prospective retention maintenance", () => {
  it("defaults to bounded read-only dry run and preserves the 90 day boundary", async () => {
    const f = fixture([91, 95, 90, 30]);
    const report = await prunePredictiveObservationRetention(f.database as never,
      {now: new Date("2026-10-09T00:00:00Z"), batchSize: 1});
    expect(report).toMatchObject({mode:"DRY_RUN",rowsSelected:1,rowsDeleted:0,complete:false});
    expect(f.deleted).toBe(0);
    expect(f.rows).toHaveLength(4);
  });
  it("removes only old rows in explicit apply mode and respects batch bounds", async () => {
    const f = fixture([91,95,30,10]);
    const report = await prunePredictiveObservationRetention(f.database as never,
      {now:new Date("2026-10-09T00:00:00Z"),apply:true,batchSize:1,maxBatches:5});
    expect(report).toMatchObject({mode:"APPLY",rowsDeleted:2,complete:true});
    expect(f.rows.map(r => r.observationKey)).toEqual(["2","3"]);
  });
});
