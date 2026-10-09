import { closePrisma, getPrisma } from "@/lib/server/db";
import { prunePredictiveObservationRetention } from "@/lib/server/predictive-observation-retention";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) throw new Error("Usage: npm run predictive:retention -- [--apply]");
  const database = getPrisma();
  if (!database) throw new Error("DATABASE_URL missing; no retention work performed");
  const report = await prunePredictiveObservationRetention(database as unknown as Parameters<typeof prunePredictiveObservationRetention>[0], {
    apply: args.includes("--apply"),
  });
  // Report only counts and cutoff; never output identities or full rows.
  console.log(JSON.stringify(report));
  if (!report.complete) console.warn("[retention] bounded pass incomplete; next maintenance run continues");
}
main().catch((error: unknown) => {
  console.error("[retention] failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}).finally(async () => { await closePrisma(); });
